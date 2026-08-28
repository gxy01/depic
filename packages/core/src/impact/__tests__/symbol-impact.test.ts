import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeImpact } from '../index';
import { analyze } from '../../analyze';

const targets = ['a', 'b'].map((id) => ({ kind: 'entry' as const, id, file: `page-${id}.ts` }));

describe('symbol-aware impact (issue #20)', () => {
  let root: string;
  const put = (file: string, source: string) => writeFileSync(join(root, file), source);
  const change = (file = 'a.ts', before = 'export function fetchA() { return "old"; }',
    after = 'export function fetchA() { return "new"; }') => {
    put(file, after + '\n');
    const oldLines = before.split('\n');
    const newLines = after.split('\n');
    return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n`
      + oldLines.map((line) => '-' + line).join('\n') + '\n'
      + newLines.map((line) => '+' + line).join('\n') + '\n';
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'depic-symbol-impact-'));
    put('a.ts', 'export function fetchA() { return "new"; }\n');
    put('b.ts', 'export function fetchB() { return "b"; }\n');
    put('index.ts', 'export * from "./a"; export * from "./b";');
    put('client.ts', 'export * as generatedClient from "./index";');
    for (const id of ['a', 'b']) {
      put(`page-${id}.ts`, `import { generatedClient } from "./client"; export const page = () => generatedClient.fetch${id.toUpperCase()}();`);
    }
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('prunes the unrelated namespace consumer and serializes evidence for both decisions', async () => {
    const report = await analyzeImpact({ root, targets, diff: change() });
    expect(report.impacts.map((item) => item.target.id)).toEqual(['a']);
    expect(JSON.parse(JSON.stringify(report)).symbolEvidence).toEqual([
      expect.objectContaining({ targetId: 'a', changedFile: 'a.ts', precision: 'symbol', affected: true, changedSymbols: ['fetchA'] }),
      expect.objectContaining({ targetId: 'b', changedFile: 'a.ts', precision: 'symbol', affected: false }),
    ]);
    expect(report.symbolEvidence?.[0].chain).toContainEqual({ file: 'a.ts', symbol: 'fetchA' });
    const graph = await analyze({ root });
    expect(graph.getTransitiveDependencies(join(root, 'page-b.ts'))).toContain(join(root, 'a.ts'));
  });

  it.each([
    ['import * as client from "./index";', 'client.fetchB()'],
    ['import * as client from "./index";', 'client["fetchB"]()'],
    ['import { renamed as call } from "./client";', 'call()'],
  ])('handles static namespace members and aliased named reexports: %s', async (imports, call) => {
    put('client.ts', 'export * as generatedClient from "./index"; export { fetchB as renamed } from "./index";');
    put('page-b.ts', `${imports} export function Page() { return ${call}; }`);
    expect((await analyzeImpact({ root, targets, diff: change() })).impacts.map((item) => item.target.id)).toEqual(['a']);
  });

  it('follows private helper references without marking an unrelated export', async () => {
    put('index.ts', 'export * from "./a";');
    const before = 'function helper() { return "old"; }\nexport const fetchA = () => helper();\nexport const fetchB = () => "b";';
    const after = before.replace('old', 'new');
    // Real hunk changes only the helper, not unchanged context lines.
    put('a.ts', after + '\n');
    const diff = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,3 @@\n'
      + '-function helper() { return "old"; }\n+function helper() { return "new"; }\n'
      + ' export const fetchA = () => helper();\n export const fetchB = () => "b";\n';
    const report = await analyzeImpact({ root, targets, diff });
    expect(report.impacts.map((item) => item.target.id)).toEqual(['a']);
    expect(report.symbolEvidence?.[0].changedSymbols).toEqual(['helper']);
  });

  it.each([
    ['dynamic-member', 'import { generatedClient as c } from "./client"; export const page = (key: string) => c[key]();'],
    ['namespace-escape', 'import { generatedClient as c } from "./client"; export const page = () => consume(c);'],
    ['top-level-effects', 'import { generatedClient as c } from "./client"; console.log(c); export const page = () => c.fetchB();'],
    ['side-effect-import', 'import "./index"; export const page = () => 1;'],
  ])('retains file-level results for %s', async (reason, source) => {
    put('page-b.ts', source);
    const report = await analyzeImpact({ root, targets, diff: change() });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.symbolEvidence).toContainEqual(expect.objectContaining({ targetId: 'b', precision: 'file', fallbackReason: reason }));
  });

  it('does not prune ambiguous star exports', async () => {
    put('b.ts', 'export const fetchB = () => "b"; export const fetchA = () => "other";');
    const report = await analyzeImpact({ root, targets, diff: change() });
    expect(report.impacts.map((item) => item.target.id)).toEqual(['a']);
    expect(report.symbolEvidence).toContainEqual(expect.objectContaining({ targetId: 'a', precision: 'file', fallbackReason: 'ambiguous-export' }));
  });

  it('retains both targets for top-level effects introduced or removed in the changed module', async () => {
    const report = await analyzeImpact({ root, targets, diff: change('a.ts', 'console.log("old");\nexport const fetchA = () => 1;', 'export const fetchA = () => 1;') });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.symbolEvidence?.every((item) => item.precision === 'file')).toBe(true);
  });

  it('falls back when the supplied diff does not match the current source', async () => {
    const diff = change();
    put('a.ts', 'export function fetchA() { return "different"; }\n');
    const report = await analyzeImpact({ root, targets, diff });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.symbolEvidence?.[0].fallbackReason).toBe('diff-source-mismatch');
  });

  it('preserves own-file, type-only and excluded-file semantics', async () => {
    const diff = change();
    const report = await analyzeImpact({ root, targets: [...targets, { kind: 'entry', id: 'self', file: 'a.ts' }], diff });
    expect(report.impacts.map((item) => item.target.id)).toEqual(['a', 'self']);
    expect((await analyzeImpact({ root, targets, diff, includeTypeOnly: true })).impactedTargetCount).toBe(2);
    const excluded = await analyzeImpact({ root, targets, diff, excludeChangedFiles: ['a.ts'] });
    expect(excluded.impactedTargetCount).toBe(0);
    expect(excluded.symbolEvidence).toEqual([]);
  });

  it('keeps the owning package direct', async () => {
    // Root package owns every fixture file, so an own-file change is always direct.
    put('package.json', JSON.stringify({ name: '@fixture/provider' }));
    const report = await analyzeImpact({ root, targets: [{ kind: 'package', id: 'pkg', package: '@fixture/provider' }], diff: change() });
    expect(report.impacts[0].impact).toBe('direct');
    expect(report.symbolEvidence?.[0].fallbackReason).toBe('target-file-changed');
  });

  it('refines workspace consumer packages using their existing resolved graph', async () => {
    for (const pkg of ['provider', 'consumer-a', 'consumer-b']) {
      mkdirSync(join(root, 'packages', pkg), { recursive: true });
      put(`packages/${pkg}/package.json`, JSON.stringify({ name: `@fixture/${pkg}`, main: 'index.ts' }));
    }
    put('packages/provider/index.ts', 'export * as api from "../../index";');
    put('packages/consumer-a/index.ts', 'import { api } from "@fixture/provider"; export const page = () => api.fetchA();');
    put('packages/consumer-b/index.ts', 'import { api } from "@fixture/provider"; export const page = () => api.fetchB();');
    const report = await analyzeImpact({
      root, diff: change(), workspace: { packagePatterns: ['packages/*'] },
      targets: ['consumer-a', 'consumer-b'].map((id) => ({ kind: 'package', id, package: `@fixture/${id}` })),
    });
    expect(report.impacts.map((item) => item.target.id)).toEqual(['consumer-a']);
  });

  it('refines static React JSX references without relying on target symbol names', async () => {
    put('page-b.tsx', 'import { fetchB as Component } from "./index"; export default function Page() { return <Component />; }');
    const report = await analyzeImpact({ root, targets: [{ ...targets[1], file: 'page-b.tsx' }], diff: change() });
    expect(report.impactedTargetCount).toBe(0);
    expect(report.symbolEvidence?.[0].precision).toBe('symbol');
  });

  it('refines before chain limits, so an unrelated early path cannot consume the budget', async () => {
    const diff = change() + change('b.ts', 'export function fetchB() { return "old"; }', 'export function fetchB() { return "new"; }');
    const report = await analyzeImpact({ root, targets: [targets[1]], diff, maxChainsPerTarget: 1 });
    expect(report.impacts[0].changedFiles).toEqual(['b.ts']);
  });

  it('treats a static default import and explicit override of a star export correctly', async () => {
    put('b.ts', 'export default function fetchB() { return "b"; }');
    put('index.ts', 'export * from "./a"; export { default as fetchA } from "./b";');
    const report = await analyzeImpact({ root, targets: [targets[0]], diff: change() });
    expect(report.impactedTargetCount).toBe(0);
    expect(report.symbolEvidence?.[0].precision).toBe('symbol');
  });

  it('handles a local export list of a namespace import', async () => {
    put('client.ts', 'import * as ns from "./index"; export { ns as generatedClient };');
    expect((await analyzeImpact({ root, targets, diff: change() })).impacts.map((item) => item.target.id)).toEqual(['a']);
  });

  it('does not use EntryTarget.symbol to hide other declarations in the same entry', async () => {
    put('page-b.ts', 'import { generatedClient as c } from "./client"; export const selected = () => c.fetchB(); export const other = () => c.fetchA();');
    const report = await analyzeImpact({ root, targets: [{ ...targets[1], symbol: 'selected' }], diff: change() });
    expect(report.impactedTargetCount).toBe(1);
  });

  it.each([
    ['cyclic-export', 'export * from "./loop"; export * from "./a"; export * from "./b";'],
    ['top-level-effects', 'export * from "./a"; export * from "./b"; console.log("loaded");'],
  ])('keeps conservative results for barrel %s', async (reason, barrel) => {
    put('loop.ts', 'export * from "./index";');
    put('index.ts', barrel);
    const report = await analyzeImpact({ root, targets, diff: change() });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.symbolEvidence?.[1].fallbackReason).toBe(reason);
  });

  it('does not prune after an export is renamed or removed', async () => {
    const report = await analyzeImpact({ root, targets, diff: change('a.ts', 'export const oldName = () => 1;', 'export const fetchA = () => 1;') });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.symbolEvidence?.[1].fallbackReason).toBe('module-shape-changed');
  });

  it('falls back on work-budget exhaustion rather than pruning', async () => {
    put('page-b.ts', `import { generatedClient as c } from "./client"; export const page = () => { ${'c.fetchB();'.repeat(10_001)} };`);
    const report = await analyzeImpact({ root, targets: [targets[1]], diff: change() });
    expect(report.impactedTargetCount).toBe(1);
    expect(report.symbolEvidence?.[0].fallbackReason).toBe('symbol-budget-exceeded');
  });

  it('terminates recursive declaration references while preserving their dependencies', async () => {
    put('page-b.ts', 'import { generatedClient as c } from "./client"; function helper() { helper(); return c.fetchB(); } export const page = () => helper();');
    expect((await analyzeImpact({ root, targets, diff: change() })).impacts.map((item) => item.target.id)).toEqual(['a']);
  });
});
