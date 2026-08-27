import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '../../analyze';
import { analyzeImpact } from '../index';

const TARGETS = [
  { kind: 'entry' as const, id: 'page-a', file: 'src/pages/page-a.ts' },
  { kind: 'entry' as const, id: 'page-b', file: 'src/pages/page-b.ts' },
];

function modifiedDiff(file: string): string {
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+new\n`;
}

describe('impact-only changed file exclusions (issue #17)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'depic-generated-impact-'));
    for (const dir of ['src/generated/nested', 'src/pages']) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    const files = {
      'src/shared.ts': 'export const shared = () => "value";',
      'src/generated/a.ts': 'import { shared } from "../shared"; export const fetchA = () => shared();',
      'src/generated/b.ts': 'export const fetchB = () => "b";',
      'src/generated/nested/c.ts': 'export const fetchC = () => "c";',
      'src/generated/index.ts': 'export * from "./a"; export * from "./b"; export * from "./nested/c";',
      'src/client.ts': 'export * as generatedClient from "./generated/index";',
      'src/pages/page-a.ts': 'import { generatedClient } from "../client"; export const pageA = () => generatedClient.fetchA();',
      'src/pages/page-b.ts': 'import { generatedClient } from "../client"; export const pageB = () => generatedClient.fetchB();',
    };
    for (const [file, source] of Object.entries(files)) {
      writeFileSync(join(root, file), source);
    }
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function configure(excludeChangedFiles: string[]): void {
    writeFileSync(join(root, 'depic.config.json'), JSON.stringify({
      impact: { targets: TARGETS, excludeChangedFiles },
    }));
  }

  it('preserves conservative barrel fan-out unless filtering is explicitly configured', async () => {
    const report = await analyzeImpact({ root, targets: TARGETS, diff: modifiedDiff('src/generated/a.ts') });
    expect(report.impacts.map((impact) => impact.target.id)).toEqual(['page-a', 'page-b']);
    expect(report.diagnostics).toEqual([]);
  });

  it('reads impact.excludeChangedFiles and reports excluded changes instead of silent no-impact', async () => {
    configure(['src/generated/**']);
    const report = await analyzeImpact({ root, diff: modifiedDiff('src/generated/a.ts') });

    expect(report).toMatchObject({ totalTargetCount: 2, impactedTargetCount: 0, changedFiles: [], impacts: [], truncated: false });
    expect(report.diagnostics).toEqual([{
      level: 'warning',
      code: 'excluded-changed-files',
      files: ['src/generated/a.ts'],
      message: expect.stringContaining('not analyzed'),
    }]);
  });

  it('retains generated modules and their edges for other changes and graph analysis', async () => {
    configure(['src/generated/**']);
    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('src/generated/a.ts') + modifiedDiff('src/shared.ts'),
    });
    expect(report.changedFiles).toEqual(['src/shared.ts']);
    expect(report.impactedTargetCount).toBe(2);
    expect(report.impacts[1].dependencyChains).toContainEqual([
      'src/pages/page-b.ts', 'src/client.ts', 'src/generated/index.ts', 'src/generated/a.ts', 'src/shared.ts',
    ]);

    const graph = await analyze({ root });
    expect(graph.getFileNode(join(root, 'src/generated/a.ts'))).toBeDefined();
    expect(graph.getTransitiveDependencies(join(root, 'src/pages/page-b.ts'))).toContain(join(root, 'src/shared.ts'));
  });

  it('keeps excluded entry files and package members valid as targets', async () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@fixture/app' }));
    const report = await analyzeImpact({
      root,
      targets: [...TARGETS, { kind: 'package', id: 'app', package: '@fixture/app' }],
      excludeChangedFiles: ['src/pages/**', 'src/generated/**'],
      diff: modifiedDiff('src/pages/page-a.ts') + modifiedDiff('src/generated/a.ts'),
    });
    expect(report.totalTargetCount).toBe(3);
    expect(report.impactedTargetCount).toBe(0);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0].code).toBe('excluded-changed-files');
  });

  it.each([{ patterns: [] }, { patterns: ['src/generated/b.ts'] }])('lets explicit API patterns override the configured list: $patterns', async ({ patterns: excludeChangedFiles }) => {
    configure(['src/generated/**']);
    const report = await analyzeImpact({ root, excludeChangedFiles, diff: modifiedDiff('src/generated/a.ts') });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.diagnostics).toEqual([]);
  });

  it.each([
    ['src/generated/a.ts', 'src/generated/a.ts', true],
    ['src/generated/*', 'src/generated/a.ts', true],
    ['src/generated/*', 'src/generated/nested/c.ts', false],
    ['src/generated/**', 'src/generated/nested/c.ts', true],
    ['**/src/generated/a.ts', 'src/generated/a.ts', true],
    ['src/generated/**/*.ts', 'src/generated/a.ts', true],
    ['src/generated/**/*.ts', 'src/generated/nested/c.ts', true],
    ['./src/generated/*.ts', 'src/generated/a.ts', true],
    ['src\\generated\\**', 'src/generated/a.ts', true],
    ['src/generated/a?ts', 'src/generated/a.ts', false],
  ])('matches root-relative pattern %s against %s', async (pattern, file, excluded) => {
    const report = await analyzeImpact({ root, targets: TARGETS, excludeChangedFiles: [pattern], diff: modifiedDiff(file) });
    expect(report.diagnostics.some((diagnostic) => diagnostic.code === 'excluded-changed-files')).toBe(excluded);
    expect(report.impactedTargetCount).toBe(excluded ? 0 : 2);
  });

  it('deduplicates and sorts excluded paths, including added, deleted, renamed and unmapped files', async () => {
    const report = await analyzeImpact({
      root,
      targets: TARGETS,
      excludeChangedFiles: ['src/generated/**'],
      diff: modifiedDiff('src/generated/b.ts') + modifiedDiff('src/generated/b.ts')
        + modifiedDiff('src/generated/missing.ts')
        + 'diff --git a/src/generated/added.ts b/src/generated/added.ts\n--- /dev/null\n+++ b/src/generated/added.ts\n'
        + 'diff --git a/src/generated/deleted.ts b/src/generated/deleted.ts\n--- a/src/generated/deleted.ts\n+++ /dev/null\n'
        + 'diff --git a/src/generated/old.ts b/src/generated/renamed.ts\nrename from src/generated/old.ts\nrename to src/generated/renamed.ts\n',
    });
    expect(report.diagnostics).toEqual([expect.objectContaining({
      code: 'excluded-changed-files',
      files: ['src/generated/added.ts', 'src/generated/b.ts', 'src/generated/deleted.ts', 'src/generated/missing.ts', 'src/generated/renamed.ts'],
    })]);
    expect(report.changedFiles).toEqual([]);
  });

  it('does not hide a rename out of an excluded directory', async () => {
    const report = await analyzeImpact({
      root, targets: TARGETS, excludeChangedFiles: ['src/generated/**'],
      diff: 'diff --git a/src/generated/a.ts b/src/a.ts\nrename from src/generated/a.ts\nrename to src/a.ts\n',
    });
    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'renamed-file', files: ['src/a.ts'] })]);
  });

  it('treats regex metacharacters in filenames literally', async () => {
    writeFileSync(join(root, 'src/generated/a+(test).ts'), 'export const x = 1;');
    const report = await analyzeImpact({
      root, targets: TARGETS, excludeChangedFiles: ['src/generated/a+(test).ts'],
      diff: modifiedDiff('src/generated/a+(test).ts') + modifiedDiff('src/generated/a.ts'),
    });
    expect(report.changedFiles).toEqual(['src/generated/a.ts']);
    expect(report.diagnostics[0].files).toEqual(['src/generated/a+(test).ts']);
  });

  it.each(['not a diff', 'diff --git a/../outside.ts b/../outside.ts\n'])('does not bypass diff validation with a broad exclusion: %s', async (diff) => {
    await expect(analyzeImpact({ root, targets: TARGETS, diff, excludeChangedFiles: ['**'] })).rejects.toThrow();
  });

  it('filters before global classification but preserves unexcluded global changes and diagnostics', async () => {
    const report = await analyzeImpact({
      root, targets: TARGETS, excludeChangedFiles: ['package.json', 'src/generated/**'],
      diff: modifiedDiff('package.json') + modifiedDiff('src/generated/a.ts'),
    });
    expect(report.impactedTargetCount).toBe(0);
    expect(report.diagnostics[0].files).toEqual(['package.json', 'src/generated/a.ts']);

    const globalReport = await analyzeImpact({
      root, targets: TARGETS, excludeChangedFiles: ['src/generated/**'],
      diff: modifiedDiff('package.json') + modifiedDiff('src/generated/a.ts'),
    });
    expect(globalReport.changedFiles).toEqual(['package.json']);
    expect(globalReport.impacts.every((impact) => impact.impact === 'global')).toBe(true);
    expect(globalReport.diagnostics[0]).toMatchObject({ code: 'excluded-changed-files', files: ['src/generated/a.ts'] });
  });

  it.each([
    { invalid: 'src/generated/**' }, { invalid: [null] }, { invalid: [''] },
    { invalid: ['/src/generated/**'] }, { invalid: ['../generated/**'] }, { invalid: ['C:\\generated\\**'] },
  ])(
    'rejects invalid filter configuration: $invalid',
    async ({ invalid }) => {
      await expect(analyzeImpact({
        root, targets: TARGETS, diff: modifiedDiff('src/generated/a.ts'),
        excludeChangedFiles: invalid as string[],
      })).rejects.toThrow('excludeChangedFiles');
    },
  );
});
