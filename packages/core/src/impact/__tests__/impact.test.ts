import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeImpact } from '../index';

const TARGETS = [
  { kind: 'entry' as const, id: '/', file: 'src/pages/HomePage.tsx', symbol: 'HomePage' },
  { kind: 'entry' as const, id: '/admin', file: 'src/pages/AdminPage.tsx', symbol: 'AdminPage' },
];

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

function renamedDiff(oldFile: string, newFile: string, withEdit: boolean): string {
  return `diff --git a/${oldFile} b/${newFile}
similarity index ${withEdit ? '78' : '100'}%
rename from ${oldFile}
rename to ${newFile}
${withEdit ? `index 1111111..2222222 100644
--- a/${oldFile}
+++ b/${newFile}
@@ -1 +1 @@
-export const value = 'old';
+export const value = 'new';
` : ''}`;
}

describe('analyzeImpact', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'depic-impact-'));
    mkdirSync(join(root, 'src/pages'), { recursive: true });
    mkdirSync(join(root, 'src/components'), { recursive: true });
    mkdirSync(join(root, 'src/utils'), { recursive: true });
    writeFileSync(join(root, 'src/pages/HomePage.tsx'), "import { Card } from '../components/Card'; export const HomePage = () => <Card />;");
    writeFileSync(join(root, 'src/pages/AdminPage.tsx'), "import { Card } from '../components/Card'; export const AdminPage = () => <Card />;");
    writeFileSync(join(root, 'src/components/Card.tsx'), "import { format } from '../utils/format'; export const Card = () => <div>{format()}</div>;");
    writeFileSync(join(root, 'src/utils/format.ts'), 'export const format = () => "ok";');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds all pages that transitively depend on a changed file', async () => {
    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('src/utils/format.ts'),
      targets: TARGETS,
    });

    expect(report.impactedTargetCount).toBe(2);
    expect(report.impacts.map((impact) => impact.target.id)).toEqual(['/', '/admin']);
    expect(report.impacts.every((impact) => impact.impact === 'transitive')).toBe(true);
    expect(report.impacts[0].dependencyChains[0]).toEqual([
      'src/pages/HomePage.tsx',
      'src/components/Card.tsx',
      'src/utils/format.ts',
    ]);
  });

  it.each([
    ['a pure rename', false],
    ['a rename with edited contents', true],
  ])('conservatively propagates the head destination for %s', async (_case, withEdit) => {
    writeFileSync(
      join(root, 'src/pages/RenamedPage.ts'),
      "import { value } from '../utils/new-helper'; export const RenamedPage = value;",
    );
    writeFileSync(
      join(root, 'src/utils/new-helper.ts'),
      `export const value = '${withEdit ? 'new' : 'old'}';`,
    );

    const report = await analyzeImpact({
      root,
      diff: renamedDiff('src/utils/old-helper.ts', 'src/utils/new-helper.ts', withEdit),
      targets: [{ kind: 'entry', id: '/renamed', file: 'src/pages/RenamedPage.ts' }],
    });

    expect(report.changedFiles).toEqual(['src/utils/new-helper.ts']);
    expect(report.analysisStatus).toBe('incomplete');
    expect(report.impacts).toEqual([expect.objectContaining({
      target: expect.objectContaining({ id: '/renamed' }),
      impact: 'direct',
      changedFiles: ['src/utils/new-helper.ts'],
      dependencyChains: [[
        'src/pages/RenamedPage.ts',
        'src/utils/new-helper.ts',
      ]],
    })]);
    expect(report.unresolvedChanges).toEqual([expect.objectContaining({
      kind: 'renamed-file',
      file: 'src/utils/new-helper.ts',
      oldPath: 'src/utils/old-helper.ts',
      newPath: 'src/utils/new-helper.ts',
      reason: expect.stringMatching(/baseline-|compare-rename-baseline/),
      recovery: expect.objectContaining({
        action: expect.any(String),
      }),
    })]);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'renamed-file',
      files: ['src/utils/new-helper.ts'],
      message: expect.stringMatching(/renamed file.*old-helper\.ts.*new-helper\.ts.*baseline comparison/i),
    }));
    expect(report.symbolEvidence).toContainEqual(expect.objectContaining({
      targetId: '/renamed',
      changedFile: 'src/utils/new-helper.ts',
      precision: 'file',
      affected: true,
      fallbackReason: 'unsupported-diff',
    }));
  });

  it('treats a renamed global-impact destination as global while retaining uncertainty', async () => {
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}');

    const report = await analyzeImpact({
      root,
      diff: renamedDiff('package.old.json', 'package.json', false),
      targets: TARGETS,
    });

    expect(report.changedFiles).toEqual(['package.json']);
    expect(report.impacts).toHaveLength(2);
    expect(report.impacts.every((impact) => impact.impact === 'global')).toBe(true);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'renamed-file',
      message: expect.stringContaining('package.old.json'),
    }));
  });

  it('marks direct page and direct dependency changes as direct', async () => {
    const pageReport = await analyzeImpact({
      root,
      diff: modifiedDiff('src/pages/HomePage.tsx'),
      targets: TARGETS,
    });
    expect(pageReport.impacts).toHaveLength(1);
    expect(pageReport.impacts[0]).toMatchObject({ impact: 'direct', changedFiles: ['src/pages/HomePage.tsx'] });
    expect(pageReport.impacts[0].dependencyChains).toEqual([['src/pages/HomePage.tsx']]);

    const dependencyReport = await analyzeImpact({
      root,
      diff: modifiedDiff('src/components/Card.tsx'),
      targets: TARGETS,
    });
    expect(dependencyReport.impacts.every((impact) => impact.impact === 'direct')).toBe(true);
  });

  it('reports global impact for configuration changes', async () => {
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}');
    const report = await analyzeImpact({ root, diff: modifiedDiff('package.json'), targets: TARGETS });

    expect(report.impacts).toHaveLength(2);
    expect(report.impacts.every((impact) => impact.impact === 'global')).toBe(true);
    expect(report.impacts.every((impact) => impact.dependencyChains.length === 0)).toBe(true);
  });

  it('reports global impact when the shared depic config changes', async () => {
    writeFileSync(join(root, 'depic.config.json'), JSON.stringify({
      impact: { targets: TARGETS },
    }));

    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('depic.config.json'),
    });

    expect(report.impacts).toHaveLength(2);
    expect(report.impacts.every((impact) => impact.impact === 'global')).toBe(true);
  });

  it('ignores type-only imports unless enabled', async () => {
    writeFileSync(join(root, 'src/pages/TypedPage.ts'), "import type { Model } from '../utils/types'; export const TypedPage = 1;");
    writeFileSync(join(root, 'src/utils/types.ts'), 'export interface Model { id: string }');
    const targets = [{ kind: 'entry' as const, id: '/typed', file: 'src/pages/TypedPage.ts', symbol: 'TypedPage' }];

    const defaultReport = await analyzeImpact({
      root,
      diff: modifiedDiff('src/utils/types.ts'),
      targets,
    });
    expect(defaultReport.impacts).toEqual([]);

    const typedReport = await analyzeImpact({
      root,
      diff: modifiedDiff('src/utils/types.ts'),
      targets,
      includeTypeOnly: true,
    });
    expect(typedReport.impacts).toHaveLength(1);
  });

  it('uses targets and impact options from depic.config.json', async () => {
    writeFileSync(
      join(root, 'src/pages/ConfiguredPage.ts'),
      "import type { Model } from '../utils/configuredTypes'; export const ConfiguredPage = 1;",
    );
    writeFileSync(
      join(root, 'src/utils/configuredTypes.ts'),
      'export interface Model { id: string }',
    );
    writeFileSync(join(root, 'depic.config.json'), JSON.stringify({
      impact: {
        includeTypeOnly: true,
        targets: [{
          kind: 'entry',
          id: '/configured',
          file: 'src/pages/ConfiguredPage.ts',
          symbol: 'ConfiguredPage',
        }],
      },
    }));

    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('src/utils/configuredTypes.ts'),
    });

    expect(report.impacts).toHaveLength(1);
    expect(report.impacts[0].target.id).toBe('/configured');
  });

  it('warns for missing page files and errors for conflicting ids', async () => {
    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('src/utils/format.ts'),
      targets: [{ kind: 'entry', id: '/missing', file: 'src/pages/Missing.tsx' }],
    });
    expect(report.diagnostics.some((diagnostic) => diagnostic.code === 'missing-entry-file')).toBe(true);

    await expect(analyzeImpact({
      root,
      diff: modifiedDiff('src/utils/format.ts'),
      targets: [
        { kind: 'entry', id: '/', file: 'src/pages/HomePage.tsx' },
        { kind: 'entry', id: '/', file: 'src/pages/AdminPage.tsx' },
      ],
    })).rejects.toThrow('Conflicting impact targets');
  });

  it('finds impacted workspace packages', async () => {
    mkdirSync(join(root, 'packages/a/src'), { recursive: true });
    mkdirSync(join(root, 'packages/b/src'), { recursive: true });
    writeFileSync(join(root, 'packages/a/package.json'), '{"name":"@fixture/a"}');
    writeFileSync(join(root, 'packages/b/package.json'), '{"name":"@fixture/b"}');
    writeFileSync(join(root, 'packages/a/src/format.ts'), 'export const format = () => "ok";');
    writeFileSync(join(root, 'packages/b/src/index.ts'), "import { format } from '../../a/src/format'; export const value = format();");

    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('packages/a/src/format.ts'),
      targets: [
        { kind: 'package', id: '@fixture/a', package: '@fixture/a' },
        { kind: 'package', id: '@fixture/b', package: '@fixture/b' },
      ],
    });

    expect(report.impacts.map((impact) => impact.target.id)).toEqual(['@fixture/a', '@fixture/b']);
    expect(report.impacts.every((impact) => impact.target.kind === 'package')).toBe(true);
  });

  it('treats a pure re-export barrel as a direct dependency', async () => {
    writeFileSync(
      join(root, 'src/pages/BarrelPage.tsx'),
      "import { Changed } from '../components/barrel'; export const BarrelPage = () => <Changed />;",
    );
    mkdirSync(join(root, 'src/components/barrel'), { recursive: true });
    writeFileSync(
      join(root, 'src/components/barrel/index.ts'),
      "export { Changed } from './Changed';",
    );
    writeFileSync(
      join(root, 'src/components/barrel/Changed.tsx'),
      'export const Changed = () => <div />;',
    );

    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('src/components/barrel/Changed.tsx'),
      targets: [{
        kind: 'entry',
        id: '/barrel',
        file: 'src/pages/BarrelPage.tsx',
        symbol: 'BarrelPage',
      }],
    });

    expect(report.impacts).toHaveLength(1);
    expect(report.impacts[0].impact).toBe('direct');
    expect(report.impacts[0].dependencyChains[0]).toEqual([
      'src/pages/BarrelPage.tsx',
      'src/components/barrel/index.ts',
      'src/components/barrel/Changed.tsx',
    ]);
  });

  it('prefers the shortest dependency chain when the chain limit is reached', async () => {
    writeFileSync(
      join(root, 'src/pages/ShortestPage.ts'),
      "import { indirect } from '../components/A'; import { changed } from '../utils/zChanged'; export const value = indirect + changed;",
    );
    writeFileSync(
      join(root, 'src/components/A.ts'),
      "import { intermediate } from './B'; export const indirect = intermediate;",
    );
    writeFileSync(
      join(root, 'src/components/B.ts'),
      "import { changed } from '../utils/zChanged'; export const intermediate = changed;",
    );
    writeFileSync(join(root, 'src/utils/zChanged.ts'), "export const changed = 'changed';");

    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('src/utils/zChanged.ts'),
      targets: [{
        kind: 'entry',
        id: '/shortest',
        file: 'src/pages/ShortestPage.ts',
        symbol: 'value',
      }],
      maxChainsPerTarget: 1,
    });

    expect(report.impacts).toHaveLength(1);
    expect(report.impacts[0].impact).toBe('direct');
    expect(report.impacts[0].dependencyChains).toEqual([[
      'src/pages/ShortestPage.ts',
      'src/utils/zChanged.ts',
    ]]);
    expect(report.impacts[0].truncated).toBe(true);
    expect(report.impacts[0].knownMinimumPathCount).toBe(2);
    expect(report.truncated).toBe(true);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'chain-limit-reached',
      chainLimit: expect.objectContaining({
        targetId: '/shortest',
        returnedChainCount: 1,
        knownMinimumChainCount: 2,
        maxChainsPerTarget: 1,
        maxTotalChains: 10_000,
        limitCause: 'per-target',
      }),
    }));
  });

  it('reports actionable per-target truncation counts, limits, recovery, and an omitted chain (issue #34)', async () => {
    mkdirSync(join(root, 'src/deps'), { recursive: true });
    const imports: string[] = [];
    const diffs: string[] = [];
    for (let index = 1; index <= 21; index += 1) {
      const file = `src/deps/d${index}.ts`;
      imports.push(`import { d${index} } from '../deps/d${index}';`);
      writeFileSync(join(root, file), `export const d${index} = 'new';`);
      diffs.push(`diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-export const d${index} = 'old';\n+export const d${index} = 'new';\n`);
    }
    writeFileSync(
      join(root, 'src/pages/FanoutPage.ts'),
      `${imports.join('\n')}\nexport const page = [${Array.from({ length: 21 }, (_, i) => `d${i + 1}`).join(', ')}];`,
    );

    const report = await analyzeImpact({
      root,
      diff: diffs.join(''),
      targets: [{ kind: 'entry', id: 'fanout', file: 'src/pages/FanoutPage.ts' }],
    });

    expect(report.impacts[0]).toMatchObject({
      target: { id: 'fanout' },
      pathCount: 20,
      knownMinimumPathCount: 21,
      truncated: true,
    });
    expect(report.impacts[0].changedFiles).toHaveLength(21);
    expect(report.diagnostics).toEqual([expect.objectContaining({
      code: 'chain-limit-reached',
      message: expect.stringContaining('returned 20 of at least 21'),
      chainLimit: {
        targetId: 'fanout',
        returnedChainCount: 20,
        knownMinimumChainCount: 21,
        maxChainsPerTarget: 20,
        maxTotalChains: 10_000,
        limitCause: 'per-target',
        omittedDependencyChain: expect.arrayContaining(['src/pages/FanoutPage.ts']),
        recovery: {
          cli: '--max-chains-per-target 40 --max-total-chains 10000',
          config: '{"impact":{"maxChainsPerTarget":40,"maxTotalChains":10000}}',
        },
      },
    })]);
  });

  it('keeps later impacted targets visible when the report-wide chain budget is exhausted', async () => {
    writeFileSync(join(root, 'src/pages/FirstPage.ts'), "import { first } from '../utils/first'; export const page = first;");
    writeFileSync(join(root, 'src/pages/SecondPage.ts'), "import { second } from '../utils/second'; export const page = second;");
    writeFileSync(join(root, 'src/utils/first.ts'), "export const first = 'new';");
    writeFileSync(join(root, 'src/utils/second.ts'), "export const second = 'new';");
    const diff = [
      ['first', 'first'],
      ['second', 'second'],
    ].map(([file, symbol]) => `diff --git a/src/utils/${file}.ts b/src/utils/${file}.ts\n--- a/src/utils/${file}.ts\n+++ b/src/utils/${file}.ts\n@@ -1 +1 @@\n-export const ${symbol} = 'old';\n+export const ${symbol} = 'new';\n`).join('');

    const report = await analyzeImpact({
      root,
      diff,
      targets: [
        { kind: 'entry', id: 'first', file: 'src/pages/FirstPage.ts' },
        { kind: 'entry', id: 'second', file: 'src/pages/SecondPage.ts' },
      ],
      maxTotalChains: 1,
    });

    expect(report.impactedTargetCount).toBe(2);
    expect(report.impacts).toEqual([
      expect.objectContaining({ target: expect.objectContaining({ id: 'first' }), pathCount: 1, truncated: false }),
      expect.objectContaining({
        target: expect.objectContaining({ id: 'second' }),
        changedFiles: ['src/utils/second.ts'],
        dependencyChains: [],
        pathCount: 0,
        knownMinimumPathCount: 1,
        truncated: true,
      }),
    ]);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      chainLimit: expect.objectContaining({ targetId: 'second', limitCause: 'total' }),
    }));
  });

  it('conservatively reports file-level impact through a shared aggregator', async () => {
    writeFileSync(
      join(root, 'src/pages/AggregatorPage.ts'),
      "import { used } from '../components/aggregator'; export const pageValue = used;",
    );
    writeFileSync(
      join(root, 'src/components/aggregator.ts'),
      "import { changed } from '../utils/changed'; export const used = 'used'; export { changed };",
    );
    writeFileSync(
      join(root, 'src/utils/changed.ts'),
      "export const changed = 'changed';",
    );

    const report = await analyzeImpact({
      root,
      diff: modifiedDiff('src/utils/changed.ts'),
      targets: [{
        kind: 'entry',
        id: '/aggregator',
        file: 'src/pages/AggregatorPage.ts',
        symbol: 'pageValue',
      }],
    });

    expect(report.impacts).toHaveLength(1);
    expect(report.impacts[0]).toMatchObject({
      impact: 'transitive',
      changedFiles: ['src/utils/changed.ts'],
    });
    expect(report.impacts[0].dependencyChains).toContainEqual([
      'src/pages/AggregatorPage.ts',
      'src/components/aggregator.ts',
      'src/utils/changed.ts',
    ]);
    expect(
      report.impacts[0].dependencyChains.every(
        (chain) => chain[chain.length - 1] === 'src/utils/changed.ts',
      ),
    ).toBe(true);
  });
});
