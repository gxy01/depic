import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runAnalyze,
  runCycles,
  runDependents,
  runStats,
  runWeb,
  runImpact,
  runInit,
} from '../index';
import { runCli } from '../cli';

describe('CLI commands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-cli-'));
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('analyze outputs valid JSON', async () => {
    const output = await runAnalyze(tmpDir);

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('edges');
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.edges.length).toBe(1);
  });

  it.each(['--version', '-V'])('prints the package version for %s', async (flag) => {
    let stdout = '';
    let stderr = '';
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

    const exitCode = await runCli(
      [flag],
      (value) => { stdout += value; },
      (value) => { stderr += value; },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${packageJson.version}\n`);
    expect(stderr).toBe('');
  });

  it.each(['--help', '-h'])('prints root help for %s', async (flag) => {
    let stdout = '';

    const exitCode = await runCli([flag], (value) => { stdout += value; });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('depic impact');
    expect(stdout).toContain('--version');
  });

  it.each(['init', 'analyze', 'cycles', 'dependents', 'stats', 'impact', 'targets', 'web', 'serve'])(
    'prints subcommand help without executing %s',
    async (command) => {
      let stdout = '';
      let stderr = '';

      const exitCode = await runCli(
        [command, '--help'],
        (value) => { stdout += value; },
        (value) => { stderr += value; },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`Usage: depic ${command}`);
      expect(stderr).toBe('');
    },
  );

  it('documents impact chain limits in subcommand help', async () => {
    let stdout = '';

    const exitCode = await runCli(['impact', '--help'], (value) => { stdout += value; });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('depic.config.json');
    expect(stdout).toContain('impact.maxChainsPerTarget');
    expect(stdout).toContain('impact.maxTotalChains');
    expect(stdout).toContain('--max-chains-per-target');
    expect(stdout).toContain('--max-total-chains');
    expect(stdout).toContain('--baseline-root');
  });

  it('targets suggest prints deterministic JSON', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    let stdout = '';
    const exitCode = await runCli(['targets', 'suggest', tmpDir], (value) => { stdout += value; });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('schemaVersion', 1);
    expect(parsed).toHaveProperty('state');
    expect(parsed).toHaveProperty('targets');
    expect(parsed).toHaveProperty('unknown');
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(JSON.parse(stdout)));
  });

  it('analyze --dot outputs DOT format', async () => {
    const output = await runAnalyze(tmpDir, true);

    expect(output).toContain('digraph deps {');
    expect(output).toContain('->');
  });

  it('cycles reports no cycles for acyclic project', async () => {
    const output = await runCycles(tmpDir);

    expect(output).toBe('No circular dependencies found.');
  });

  it('cycles detects circular dependency', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './a';`);

    const output = await runCycles(tmpDir);

    expect(output).not.toBe('No circular dependencies found.');
    expect(output).toContain('→');
  });

  it('dependents shows files that import the target', async () => {
    const output = await runDependents(join(tmpDir, 'b.ts'), tmpDir);

    expect(output).toContain('a.ts');
    expect(output).toContain('static-import');
  });

  it('dependents reports none when no dependents', async () => {
    const output = await runDependents(join(tmpDir, 'a.ts'), tmpDir);

    expect(output).toContain('No files depend on');
  });

  it('stats outputs valid JSON with expected keys', async () => {
    const output = await runStats(tmpDir);

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('fileCount');
    expect(parsed).toHaveProperty('edgeCount');
    expect(parsed).toHaveProperty('externalCount');
    expect(parsed.fileCount).toBe(2);
    expect(parsed.edgeCount).toBe(1);
  });

  it('web generates HTML with inert, round-trippable graph data', async () => {
    const outFile = join(tmpDir, 'deps.html');
    const boundary = '</ScRiPt><div data-depic-boundary="unexpected">';
    writeFileSync(join(tmpDir, 'boundary.ts'), `import ${JSON.stringify(boundary)};`);
    const output = await runWeb(tmpDir, outFile);

    expect(output).toContain('Written to');
    // File should exist and contain HTML
    const content = readFileSync(outFile, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('id="depic-graph-data"');
    expect(content).not.toContain(boundary);
    const embedded = content.match(
      /<script type="application\/json" id="depic-graph-data">([\s\S]*?)<\/script>/u,
    );
    if (!embedded) throw new Error('Embedded graph data element not found.');
    expect(JSON.parse(embedded[1]).edges).toContainEqual(expect.objectContaining({
      specifier: boundary,
    }));
  });

  it('impact writes a JSON report and returns a summary', async () => {
    const targetsFile = join(tmpDir, 'targets.json');
    const diffFile = join(tmpDir, 'change.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(targetsFile, JSON.stringify([{ kind: 'entry', id: '/', file: 'a.ts', symbol: 'Page' }]));
    writeFileSync(diffFile, `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`);

    const output = await runImpact(tmpDir, diffFile, targetsFile, reportFile);

    expect(output).toContain('Impacted targets: 1 / 1');
    expect(JSON.parse(readFileSync(reportFile, 'utf-8'))).toMatchObject({
      impactedTargetCount: 1,
      impacts: [{ target: { id: '/' }, impact: 'direct' }],
    });
  });

  it('impact accepts Git-quoted UTF-8 paths and writes the decoded path', async () => {
    const diffFile = join(tmpDir, 'quoted.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(join(tmpDir, 'café.ts'), 'export const value = 2;\n');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: { targets: [{ kind: 'entry', id: 'unicode', file: 'café.ts' }] },
    }));
    writeFileSync(diffFile, String.raw`diff --git "a/caf\303\251.ts" "b/caf\303\251.ts"
--- "a/caf\303\251.ts"
+++ "b/caf\303\251.ts"
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`);

    let output = '';
    const exitCode = await runCli([
      'impact', tmpDir, '--diff', diffFile, '--report', reportFile,
    ], (value) => { output += value; });

    expect(exitCode).toBe(0);
    expect(output).toContain('Impacted targets: 1 / 1');
    expect(JSON.parse(readFileSync(reportFile, 'utf8'))).toMatchObject({
      analysisStatus: 'complete',
      changedFiles: ['café.ts'],
      impacts: [{ target: { id: 'unicode' }, changedFiles: ['café.ts'] }],
    });
  });

  it('impact rejects an encoded traversal before writing a report', async () => {
    const diffFile = join(tmpDir, 'unsafe.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(diffFile, String.raw`diff --git "a/\056\056\057escape.ts" "b/\056\056\057escape.ts"
`);

    await expect(runCli([
      'impact', tmpDir, '--diff', diffFile, '--report', reportFile,
    ])).rejects.toThrow(/relative/u);
    expect(() => readFileSync(reportFile)).toThrow();
  });

  it('impact rejects a non-UTF-8 diff file before writing a report', async () => {
    const diffFile = join(tmpDir, 'invalid-utf8.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(diffFile, Buffer.from([
      ...Buffer.from('diff --git a/bad'),
      0xc3,
      0x28,
      ...Buffer.from('.ts b/bad.ts\n'),
    ]));

    await expect(runImpact(tmpDir, diffFile, undefined, reportFile))
      .rejects.toThrow('Impact diff must be valid UTF-8.');
    expect(() => readFileSync(reportFile)).toThrow();
  });

  it('makes truncation actionable and accepts one-off chain-limit overrides (issue #34)', async () => {
    const diffFile = join(tmpDir, 'change.diff');
    const reportFile = join(tmpDir, 'impact.json');
    const imports: string[] = [];
    const diffs: string[] = [];
    for (let index = 1; index <= 3; index += 1) {
      imports.push(`import { d${index} } from './d${index}';`);
      writeFileSync(join(tmpDir, `d${index}.ts`), `export const d${index} = 'new';`);
      diffs.push(`diff --git a/d${index}.ts b/d${index}.ts\n--- a/d${index}.ts\n+++ b/d${index}.ts\n@@ -1 +1 @@\n-export const d${index} = 'old';\n+export const d${index} = 'new';\n`);
    }
    writeFileSync(join(tmpDir, 'entry.ts'), `${imports.join('\n')}\nexport const entry = [d1, d2, d3];`);
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({ impact: {
      targets: [{ kind: 'entry', id: 'entry', file: 'entry.ts' }],
      maxChainsPerTarget: 1,
      maxTotalChains: 10,
    } }));
    writeFileSync(diffFile, diffs.join(''));

    const limitedOutput = await runImpact(tmpDir, diffFile, undefined, reportFile);
    expect(limitedOutput).toContain('Truncated target entry: returned 1 / at least 2 chains');
    expect(limitedOutput).toContain('Omitted chain sample: entry.ts ->');
    expect(limitedOutput).toContain('Recovery: rerun with --max-chains-per-target 2 --max-total-chains 10');
    expect(JSON.parse(readFileSync(reportFile, 'utf8')).diagnostics[0].chainLimit).toMatchObject({
      targetId: 'entry', returnedChainCount: 1, knownMinimumChainCount: 2,
    });

    let stdout = '';
    const exitCode = await runCli([
      'impact', tmpDir,
      '--diff', diffFile,
      '--report', reportFile,
      '--max-chains-per-target', '3',
      '--max-total-chains', '3',
    ], (value) => { stdout += value; });
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('Truncated target');
    expect(JSON.parse(readFileSync(reportFile, 'utf8'))).toMatchObject({
      truncated: false,
      impacts: [{ pathCount: 3, truncated: false }],
    });
  });

  it.each([
    ['--max-chains-per-target', '0'],
    ['--max-chains-per-target', '1.5'],
    ['--max-total-chains', 'nope'],
  ])('rejects invalid one-off chain limit %s=%s', async (flag, value) => {
    await expect(runCli([
      'impact', tmpDir, '--diff', 'change.diff', '--report', 'report.json', flag, value,
    ])).rejects.toThrow(`${flag} requires a positive integer.`);
  });

  it('makes a deletion explicitly incomplete when no baseline is provided', async () => {
    const diffFile = join(tmpDir, 'delete.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(join(tmpDir, 'a.ts'), 'import { value } from "./removed"; export const page = value;');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: { targets: [{ kind: 'entry', id: 'page', file: 'a.ts' }] },
    }));
    writeFileSync(diffFile, 'diff --git a/removed.ts b/removed.ts\ndeleted file mode 100644\n--- a/removed.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-export const value = 1;\n');

    let output = '';
    const exitCode = await runCli([
      'impact', tmpDir,
      '--diff', diffFile,
      '--report', reportFile,
    ], (value) => { output += value; });
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));

    expect(exitCode).toBe(0);
    expect(output).toContain('INCOMPLETE impact analysis: target coverage is not fully proven');
    expect(output).toContain('Unresolved changed files: 1');
    expect(output).toContain('removed.ts: baseline-required; recovery=provide-baseline-root; rerun with --baseline-root /path/to/baseline-checkout');
    expect(report).toMatchObject({
      analysisStatus: 'incomplete',
      changedFiles: ['removed.ts'],
      unresolvedChanges: [{ file: 'removed.ts', status: 'unknown' }],
    });
  });

  it('accepts --baseline-root and reports baseline-proven deletion impact', async () => {
    const baselineRoot = mkdtempSync(join(tmpdir(), 'depic-cli-baseline-'));
    try {
      const diffFile = join(tmpDir, 'delete.diff');
      const reportFile = join(tmpDir, 'impact.json');
      writeFileSync(join(tmpDir, 'a.ts'), 'import { value } from "./removed"; export const page = value;');
      writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
        impact: { targets: [{ kind: 'entry', id: 'page', file: 'a.ts' }] },
      }));
      writeFileSync(join(baselineRoot, 'a.ts'), 'import { value } from "./removed"; export const page = value;');
      writeFileSync(join(baselineRoot, 'removed.ts'), 'export const value = 1;');
      writeFileSync(diffFile, 'diff --git a/removed.ts b/removed.ts\ndeleted file mode 100644\n--- a/removed.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-export const value = 1;\n');
      let stdout = '';

      const exitCode = await runCli([
        'impact', tmpDir,
        '--diff', diffFile,
        '--report', reportFile,
        '--baseline-root', baselineRoot,
      ], (value) => { stdout += value; });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Impacted targets: 1 / 1');
      expect(stdout).not.toContain('INCOMPLETE impact analysis');
      expect(JSON.parse(readFileSync(reportFile, 'utf8'))).toMatchObject({
        analysisStatus: 'complete',
        unresolvedChanges: [],
        impacts: [{
          target: { id: 'page' },
          changedFiles: ['removed.ts'],
          analysisBasis: 'baseline',
        }],
      });
    } finally {
      rmSync(baselineRoot, { recursive: true, force: true });
    }
  });

  it('rejects --baseline-root without a path', async () => {
    await expect(runCli([
      'impact', tmpDir, '--diff', 'change.diff', '--report', 'report.json', '--baseline-root',
    ])).rejects.toThrow('--baseline-root requires a path.');
  });

  it('impact reads targets from the shared depic config by default', async () => {
    const diffFile = join(tmpDir, 'change.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: {
        targets: [{ kind: 'entry', id: '/', file: 'a.ts', symbol: 'Page' }],
      },
    }));
    writeFileSync(diffFile, `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`);

    const output = await runImpact(tmpDir, diffFile, undefined, reportFile);

    expect(output).toContain('Impacted targets: 1 / 1');
    expect(JSON.parse(readFileSync(reportFile, 'utf-8'))).toMatchObject({
      impacts: [{ target: { id: '/' }, impact: 'direct' }],
    });
  });

  it('impact reports current consumers of a renamed destination and baseline uncertainty', async () => {
    const diffFile = join(tmpDir, 'rename.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(join(tmpDir, 'page.ts'), 'import { value } from "./new-helper"; export const page = value;');
    writeFileSync(join(tmpDir, 'new-helper.ts'), 'export const value = "new";');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: { targets: [{ kind: 'entry', id: '/page', file: 'page.ts' }] },
    }));
    writeFileSync(diffFile, `diff --git a/old-helper.ts b/new-helper.ts
similarity index 78%
rename from old-helper.ts
rename to new-helper.ts
--- a/old-helper.ts
+++ b/new-helper.ts
@@ -1 +1 @@
-export const value = "old";
+export const value = "new";
`);

    const output = await runImpact(tmpDir, diffFile, undefined, reportFile);
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));

    expect(output).toContain('Impacted targets: 1 / 1');
    expect(report).toMatchObject({
      changedFiles: ['new-helper.ts'],
      impacts: [{ target: { id: '/page' }, changedFiles: ['new-helper.ts'] }],
      diagnostics: [{ code: 'renamed-file', files: ['new-helper.ts'] }],
    });
    expect(report.diagnostics[0].message).toContain('old-helper.ts');
  });

  it('init ignores the entire runtime artifact directory', () => {
    const output = runInit(tmpDir);
    const gitignore = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');

    expect(output).toContain('Added Depic rules');
    expect(gitignore).toBe('.depic/\n');
  });

  it('impact exposes configured exclusions in both the summary and JSON report', async () => {
    const diffFile = join(tmpDir, 'change.diff');
    const reportFile = join(tmpDir, 'impact.json');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: {
        targets: [{ kind: 'entry', id: '/', file: 'a.ts' }],
        excludeChangedFiles: ['b.ts'],
      },
    }));
    writeFileSync(diffFile, 'diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-old\n+new\n');

    const output = await runImpact(tmpDir, diffFile, undefined, reportFile);

    expect(output).toContain('Impacted targets: 0 / 1');
    expect(output).toContain('Excluded changed files (not analyzed): b.ts');
    expect(JSON.parse(readFileSync(reportFile, 'utf-8'))).toMatchObject({
      changedFiles: [],
      impacts: [],
      diagnostics: [{ code: 'excluded-changed-files', files: ['b.ts'] }],
    });
    expect(JSON.parse(await runAnalyze(tmpDir)).nodes).toHaveLength(2);
  });

  it('init migrates selective artifact rules after config moves to the root', () => {
    writeFileSync(
      join(tmpDir, '.gitignore'),
      'node_modules/\n# Depic generated artifacts\n.depic/*\n!.depic/impact-targets.json\n',
    );

    const output = runInit(tmpDir);
    const gitignore = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');

    expect(output).toContain('Migrated Depic rules');
    expect(gitignore).toBe('node_modules/\n.depic/\n');
  });

  it('impact exposes symbol refinement and conservative fallback in CLI and JSON', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'export const fetchA = () => "new";\n');
    writeFileSync(join(tmpDir, 'b.ts'), 'export const fetchB = () => "b";\n');
    writeFileSync(join(tmpDir, 'barrel.ts'), 'export * from "./a"; export * from "./b";');
    writeFileSync(join(tmpDir, 'page.ts'), 'import * as api from "./barrel"; export const page = () => api.fetchB();');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: { targets: [{ kind: 'entry', id: 'page', file: 'page.ts' }] },
    }));
    const diff = join(tmpDir, 'change.diff');
    const report = join(tmpDir, 'impact.json');
    writeFileSync(diff, 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-export const fetchA = () => "old";\n+export const fetchA = () => "new";\n');
    const output = await runImpact(tmpDir, diff, undefined, report);
    expect(output).toContain('Impacted targets: 0 / 1');
    expect(output).toContain('Symbol analysis: 1 refined, 0 file-level');
    expect(JSON.parse(readFileSync(report, 'utf8')).symbolEvidence[0]).toMatchObject({ precision: 'symbol', affected: false });
    writeFileSync(join(tmpDir, 'page.ts'), 'import * as api from "./barrel"; export const page = (key: string) => api[key]();');
    expect(await runImpact(tmpDir, diff, undefined, report)).toContain('File-level reasons: dynamic-member');
    expect(JSON.parse(readFileSync(report, 'utf8')).symbolEvidence[0]).toMatchObject({ precision: 'file', affected: true });
  });

  it('impact reports semantic no-ops separately from excluded files', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), '// updated docs\nexport const page = () => 1;\n');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({ impact: { targets: [{ kind: 'entry', id: 'page', file: 'a.ts' }] } }));
    const diff = join(tmpDir, 'change.diff');
    const report = join(tmpDir, 'impact.json');
    writeFileSync(diff, 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-// old docs\n+// updated docs\n');
    const output = await runImpact(tmpDir, diff, undefined, report);
    expect(output).toContain('Impacted targets: 0 / 1');
    expect(output).toContain('Semantic no-op files (checked AST equivalence): a.ts');
    expect(output).not.toContain('not analyzed');
    expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({ changedFiles: [], diagnostics: [{ code: 'semantic-noop', files: ['a.ts'] }] });
  });

  it('keeps non-source changes visible and machine-distinct in CLI and JSON', async () => {
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: { targets: [{ kind: 'entry', id: 'page', file: 'a.ts' }] },
    }));
    const diff = join(tmpDir, 'change.diff');
    const report = join(tmpDir, 'impact.json');
    writeFileSync(diff, 'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n');

    const output = await runImpact(tmpDir, diff, undefined, report);

    expect(output).toContain('Non-source changed files (outside analyzed graph): README.md');
    expect(output).toContain('Diagnostics: 0 warning(s), 1 info');
    expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({
      changedFiles: [],
      diagnostics: [{ code: 'non-source-file', level: 'info', files: ['README.md'] }],
    });
  });

  it('summarizes unmapped source files as warnings separately from info', async () => {
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({
      impact: { targets: [{ kind: 'entry', id: 'page', file: 'a.ts' }] },
    }));
    const diff = join(tmpDir, 'change.diff');
    const report = join(tmpDir, 'impact.json');
    writeFileSync(diff, 'diff --git a/missing.ts b/missing.ts\n--- a/missing.ts\n+++ b/missing.ts\n@@ -1 +1 @@\n-old\n+new\n');

    const output = await runImpact(tmpDir, diff, undefined, report);

    expect(output).toContain('Parse-failed source files (warning): missing.ts');
    expect(output).toContain('Diagnostics: 1 warning(s), 0 info');
  });

  it('impact reads type-symbol refinement from shared config', async () => {
    writeFileSync(join(tmpDir, 'models.ts'), 'export interface User { enabled?: boolean }\nexport interface Other { name: string }\n');
    writeFileSync(join(tmpDir, 'a.ts'), 'import type { User } from "./models"; export const page = (x: User) => x;');
    writeFileSync(join(tmpDir, 'b.ts'), 'import type { Other } from "./models"; export const page = (x: Other) => x;');
    writeFileSync(join(tmpDir, 'depic.config.json'), JSON.stringify({ impact: {
      includeTypeOnly: true, targets: ['a', 'b'].map((id) => ({ kind: 'entry', id, file: `${id}.ts` })),
    } }));
    const diff = join(tmpDir, 'change.diff');
    const report = join(tmpDir, 'impact.json');
    writeFileSync(diff, 'diff --git a/models.ts b/models.ts\n--- a/models.ts\n+++ b/models.ts\n@@ -1 +1 @@\n-export interface User {}\n+export interface User { enabled?: boolean }\n');
    expect(await runImpact(tmpDir, diff, undefined, report)).toContain('Impacted targets: 1 / 2');
    expect(JSON.parse(readFileSync(report, 'utf8')).symbolEvidence[0]).toMatchObject({ precision: 'symbol', changedSymbols: ['User'] });
  });
});
