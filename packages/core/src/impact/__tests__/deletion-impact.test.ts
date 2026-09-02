import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeImpact } from '../index';

function deletedDiff(file: string): string {
  return `diff --git a/${file} b/${file}
deleted file mode 100644
index 1111111..0000000
--- a/${file}
+++ /dev/null
@@ -1 +0,0 @@
-export const value = 1;
`;
}

function modifiedDiff(file: string): string {
  return `diff --git a/${file} b/${file}
index 1111111..2222222 100644
--- a/${file}
+++ b/${file}
@@ -1 +1 @@
-export const live = 1;
+export const live = 2;
`;
}

describe('baseline-aware deleted-file impact (issue #40)', () => {
  let root: string;
  let baselineRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'depic-delete-head-'));
    baselineRoot = mkdtempSync(join(tmpdir(), 'depic-delete-baseline-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(baselineRoot, 'src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(baselineRoot, { recursive: true, force: true });
  });

  it('marks deletion impact incomplete and machine-actionable without a baseline', async () => {
    writeFileSync(
      join(root, 'src/entry.ts'),
      "import { value } from './removed'; export const entry = value;",
    );

    const report = await analyzeImpact({
      root,
      diff: deletedDiff('src/removed.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report).toMatchObject({
      analysisStatus: 'incomplete',
      impactedTargetCount: 0,
      changedFiles: ['src/removed.ts'],
      impacts: [],
      unresolvedChanges: [{
        kind: 'deleted-file',
        file: 'src/removed.ts',
        status: 'unknown',
        reason: 'baseline-required',
        recovery: {
          action: 'provide-baseline-root',
          cli: '--baseline-root /path/to/baseline-checkout',
        },
      }],
      diagnostics: [{ code: 'deleted-file', level: 'warning', files: ['src/removed.ts'] }],
    });
  });

  it('uses baseline reverse dependencies to impact a head entry', async () => {
    writeFileSync(
      join(root, 'src/entry.ts'),
      "import { value } from './removed'; export const entry = value;",
    );
    writeFileSync(
      join(baselineRoot, 'src/entry.ts'),
      "import { value } from './removed'; export const entry = value;",
    );
    writeFileSync(join(baselineRoot, 'src/removed.ts'), 'export const value = 1;');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      diff: deletedDiff('src/removed.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report).toMatchObject({
      analysisStatus: 'complete',
      impactedTargetCount: 1,
      changedFiles: ['src/removed.ts'],
      unresolvedChanges: [],
      impacts: [{
        target: { id: 'entry' },
        impact: 'direct',
        changedFiles: ['src/removed.ts'],
        dependencyChains: [['src/entry.ts', 'src/removed.ts']],
        pathCount: 1,
        analysisBasis: 'baseline',
      }],
      diagnostics: [{ code: 'deleted-file', level: 'info', files: ['src/removed.ts'] }],
    });
  });

  it('can prove that a configured entry itself was deleted', async () => {
    writeFileSync(join(baselineRoot, 'src/entry.ts'), 'export const value = 1;');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      diff: deletedDiff('src/entry.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report.totalTargetCount).toBe(1);
    expect(report.impacts).toEqual([expect.objectContaining({
      impact: 'direct',
      dependencyChains: [['src/entry.ts']],
      analysisBasis: 'baseline',
    })]);
    expect(report.diagnostics.some((item) => item.code === 'missing-entry-file')).toBe(false);
  });

  it('distinguishes a deleted file missing from the supplied baseline', async () => {
    writeFileSync(join(root, 'src/entry.ts'), 'export const entry = 1;');
    writeFileSync(join(baselineRoot, 'src/entry.ts'), 'export const entry = 1;');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      diff: deletedDiff('src/removed.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report.analysisStatus).toBe('incomplete');
    expect(report.unresolvedChanges).toEqual([expect.objectContaining({
      file: 'src/removed.ts',
      reason: 'baseline-file-missing',
      recovery: expect.objectContaining({ action: 'restore-baseline-file' }),
    })]);
  });

  it('distinguishes a baseline source parse failure', async () => {
    writeFileSync(join(root, 'src/entry.ts'), 'export const entry = 1;');
    writeFileSync(join(baselineRoot, 'src/entry.ts'), 'export const entry = 1;');
    writeFileSync(join(baselineRoot, 'src/removed.ts'), 'export const = ;');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      diff: deletedDiff('src/removed.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report.unresolvedChanges).toEqual([expect.objectContaining({
      reason: 'baseline-parse-failed',
      recovery: expect.objectContaining({ action: 'fix-baseline-parse' }),
    })]);
  });

  it('distinguishes a parseable file absent from the built baseline graph', async () => {
    writeFileSync(join(root, 'src/entry.ts'), 'export const entry = 1;');
    writeFileSync(join(baselineRoot, 'src/entry.ts'), 'export const entry = 1;');
    writeFileSync(join(baselineRoot, 'src/removed.ts'), 'export const value = 1;');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      exclude: ['src/removed.ts'],
      diff: deletedDiff('src/removed.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report.unresolvedChanges).toEqual([expect.objectContaining({
      reason: 'baseline-file-unmapped',
      recovery: expect.objectContaining({ action: 'include-baseline-file' }),
    })]);
  });

  it('distinguishes a baseline graph construction failure', async () => {
    writeFileSync(join(root, 'src/entry.ts'), 'export const entry = 1;');
    writeFileSync(join(baselineRoot, 'depic.config.json'), '{ invalid');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      diff: deletedDiff('src/removed.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report.unresolvedChanges).toEqual([expect.objectContaining({
      reason: 'baseline-analysis-failed',
      recovery: expect.objectContaining({ action: 'fix-baseline-analysis' }),
    })]);
  });

  it('stays incomplete when a configured target is missing from the baseline graph', async () => {
    writeFileSync(join(root, 'src/entry.ts'), 'export const entry = 1;');
    writeFileSync(join(baselineRoot, 'src/entry.ts'), 'export const = ;');
    writeFileSync(join(baselineRoot, 'src/removed.ts'), 'export const value = 1;');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      diff: deletedDiff('src/removed.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report.analysisStatus).toBe('incomplete');
    expect(report.unresolvedChanges).toEqual([expect.objectContaining({
      reason: 'baseline-targets-unmapped',
      targetIds: ['entry'],
      recovery: expect.objectContaining({ action: 'fix-baseline-targets' }),
    })]);
  });

  it('combines head and baseline evidence for the same target', async () => {
    const entry = "import { live } from './live'; import { value } from './removed'; export const result = live + value;";
    writeFileSync(join(root, 'src/entry.ts'), entry);
    writeFileSync(join(root, 'src/live.ts'), 'export const live = 2;');
    writeFileSync(join(baselineRoot, 'src/entry.ts'), entry);
    writeFileSync(join(baselineRoot, 'src/live.ts'), 'export const live = 1;');
    writeFileSync(join(baselineRoot, 'src/removed.ts'), 'export const value = 1;');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      diff: `${modifiedDiff('src/live.ts')}\n${deletedDiff('src/removed.ts')}`,
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report.impacts).toEqual([expect.objectContaining({
      changedFiles: ['src/live.ts', 'src/removed.ts'],
      dependencyChains: [
        ['src/entry.ts', 'src/live.ts'],
        ['src/entry.ts', 'src/removed.ts'],
      ],
      pathCount: 2,
      analysisBasis: 'mixed',
    })]);
  });

  it('applies existing chain limits across combined head and baseline evidence', async () => {
    const entry = "import { live } from './live'; import { value } from './removed'; export const result = live + value;";
    writeFileSync(join(root, 'src/entry.ts'), entry);
    writeFileSync(join(root, 'src/live.ts'), 'export const live = 2;');
    writeFileSync(join(baselineRoot, 'src/entry.ts'), entry);
    writeFileSync(join(baselineRoot, 'src/live.ts'), 'export const live = 1;');
    writeFileSync(join(baselineRoot, 'src/removed.ts'), 'export const value = 1;');

    const report = await analyzeImpact({
      root,
      baselineRoot,
      diff: `${modifiedDiff('src/live.ts')}\n${deletedDiff('src/removed.ts')}`,
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
      maxChainsPerTarget: 1,
      maxTotalChains: 10,
    });

    expect(report.analysisStatus).toBe('complete');
    expect(report.impacts).toEqual([expect.objectContaining({
      changedFiles: ['src/live.ts', 'src/removed.ts'],
      dependencyChains: [['src/entry.ts', 'src/live.ts']],
      pathCount: 1,
      knownMinimumPathCount: 2,
      truncated: true,
      analysisBasis: 'mixed',
    })]);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'chain-limit-reached',
      chainLimit: expect.objectContaining({
        returnedChainCount: 1,
        knownMinimumChainCount: 2,
        omittedDependencyChain: ['src/entry.ts', 'src/removed.ts'],
      }),
    }));
  });

  it('lets global impact cover deletions without baseline data', async () => {
    writeFileSync(join(root, 'src/entry.ts'), 'export const entry = 1;');

    const report = await analyzeImpact({
      root,
      diff: deletedDiff('package.json'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report).toMatchObject({
      analysisStatus: 'complete',
      impactedTargetCount: 1,
      changedFiles: ['package.json'],
      impacts: [{ impact: 'global', changedFiles: ['package.json'] }],
      unresolvedChanges: [],
      diagnostics: [{ code: 'deleted-file', level: 'info' }],
    });
  });

  it('reports a missing baseline checkout without turning it into trusted zero impact', async () => {
    writeFileSync(join(root, 'src/entry.ts'), 'export const entry = 1;');

    const report = await analyzeImpact({
      root,
      baselineRoot: 'missing-baseline',
      diff: deletedDiff('src/removed.ts'),
      targets: [{ kind: 'entry', id: 'entry', file: 'src/entry.ts' }],
    });

    expect(report.analysisStatus).toBe('incomplete');
    expect(report.unresolvedChanges).toEqual([expect.objectContaining({
      reason: 'baseline-root-unavailable',
      recovery: expect.objectContaining({ action: 'fix-baseline-root' }),
    })]);
  });
});
