import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeImpact } from '../index';
import type { AnalyzeOptions } from '../../types';

function modifiedDiff(file: string): string {
  return `diff --git a/${file} b/${file}
index 1111111..2222222 100644
--- a/${file}
+++ b/${file}
@@ -1 +1 @@
-old
+new
`;
}

describe('unmapped changed-file classification (issue #35)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'depic-unmapped-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/page.ts'), 'export const page = 1;');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each<{
    name: string;
    file: string;
    analysis?: Pick<AnalyzeOptions, 'include' | 'exclude' | 'extensions'>;
    code: 'unmapped-file' | 'non-source-file';
    level: 'warning' | 'info';
  }>([
    {
      name: 'README outside the default source graph',
      file: 'README.md',
      code: 'non-source-file',
      level: 'info',
    },
    {
      name: 'generated artifact outside the default source graph',
      file: 'dist/styles.css',
      code: 'non-source-file',
      level: 'info',
    },
    {
      name: 'unmapped TypeScript source',
      file: 'src/missing.ts',
      code: 'unmapped-file',
      level: 'warning',
    },
    {
      name: 'custom resolver extension',
      file: 'src/component.vue',
      analysis: { extensions: ['.vue'] },
      code: 'unmapped-file',
      level: 'warning',
    },
    {
      name: 'custom include without a source-like extension',
      file: 'docs/guides/guide.md',
      analysis: { include: ['**/*.ts', 'docs/**/*.md'] },
      code: 'unmapped-file',
      level: 'warning',
    },
    {
      name: 'custom include overridden by an explicit exclude',
      file: 'docs/generated/report.md',
      analysis: { include: ['**/*.ts', 'docs/**/*.md'], exclude: ['docs/generated/**'] },
      code: 'non-source-file',
      level: 'info',
    },
    {
      name: 'excluded TypeScript source remains prominent',
      file: 'src/generated/missing.ts',
      analysis: { exclude: ['src/generated/**'] },
      code: 'unmapped-file',
      level: 'warning',
    },
  ])('classifies $name', async ({ file, analysis, code, level }) => {
    const report = await analyzeImpact({
      root,
      diff: modifiedDiff(file),
      targets: [{ kind: 'entry', id: 'page', file: 'src/page.ts' }],
      ...analysis,
    });

    expect(report.changedFiles).toEqual([]);
    expect(report.impacts).toEqual([]);
    expect(report.analysisStatus).toBe(level === 'warning' ? 'incomplete' : 'complete');
    expect(report.diagnostics).toEqual([expect.objectContaining({ code, level, files: [file] })]);
  });

  it('uses effective extensions loaded from depic.config.json', async () => {
    writeFileSync(join(root, 'depic.config.json'), JSON.stringify({
      extensions: ['vue'],
      impact: { targets: [{ kind: 'entry', id: 'page', file: 'src/page.ts' }] },
    }));

    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('src/missing.vue'),
    });

    expect(report.diagnostics).toEqual([expect.objectContaining({
      code: 'unmapped-file',
      level: 'warning',
      files: ['src/missing.vue'],
    })]);
  });

  it.each([
    ['a parse failure', 'src/broken.ts', () => {
      writeFileSync(join(root, 'src/broken.ts'), 'export const = ;');
    }],
    ['a gitignored source', 'src/ignored.ts', () => {
      writeFileSync(join(root, 'src/ignored.ts'), 'export const ignored = true;');
      writeFileSync(join(root, '.gitignore'), 'src/ignored.ts\n');
    }],
  ])('keeps %s as an unmapped source warning', async (_name, file, arrange) => {
    arrange();

    const report = await analyzeImpact({
      root,
      diff: modifiedDiff(file),
      targets: [{ kind: 'entry', id: 'page', file: 'src/page.ts' }],
    });

    expect(report.diagnostics).toEqual([expect.objectContaining({
      code: 'unmapped-file',
      level: 'warning',
      files: [file],
    })]);
  });

  it('lets configured global impact take precedence over non-source classification', async () => {
    writeFileSync(join(root, 'depic.config.json'), JSON.stringify({
      impact: {
        targets: [{ kind: 'entry', id: 'page', file: 'src/page.ts' }],
        globalImpactPatterns: ['README.md'],
      },
    }));

    const report = await analyzeImpact({ root, diff: modifiedDiff('README.md') });

    expect(report.changedFiles).toEqual(['README.md']);
    expect(report.impacts).toEqual([expect.objectContaining({ impact: 'global' })]);
    expect(report.diagnostics).toEqual([]);
  });
});
