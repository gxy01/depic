import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeImpact } from '../index';

describe('type declarations and semantic no-ops (issues #22/#23)', () => {
  let root: string;
  const put = (file: string, source: string) => writeFileSync(join(root, file), source);
  const targets = ['a', 'b'].map((id) => ({ kind: 'entry' as const, id, file: `${id}.ts` }));
  function change(before: string, after: string, file = 'models.ts'): string {
    put(file, after + '\n');
    return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${before.split('\n').length} +1,${after.split('\n').length} @@\n`
      + before.split('\n').map((line) => '-' + line).join('\n') + '\n'
      + after.split('\n').map((line) => '+' + line).join('\n') + '\n';
  }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'depic-type-noop-'));
    put('index.ts', 'export type { UserConfig as User, Other } from "./models";');
    put('a.ts', 'import type { User } from "./index"; export const enabled = (config: User) => config.enabled;');
    put('b.ts', 'import type { Other } from "./index"; export const name = (config: Other) => config.name;');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function typeDiff(kind = 'interface'): string {
    const first = kind === 'interface' ? 'export interface UserConfig {' : 'export type UserConfig = {';
    put('models.ts', `${first}\n  name?: string;\n  enabled?: boolean;\n}\nexport interface Other { name: string }\n`);
    return 'diff --git a/models.ts b/models.ts\n--- a/models.ts\n+++ b/models.ts\n@@ -2,2 +2,3 @@\n   name?: string;\n+  enabled?: boolean;\n }\n';
  }

  it.each(['interface', 'type'])('refines %s edits through aliased type reexports', async (kind) => {
    const report = await analyzeImpact({ root, targets, diff: typeDiff(kind), includeTypeOnly: true });
    expect(report.impacts.map((item) => item.target.id)).toEqual(['a']);
    expect(report.symbolEvidence?.[0]).toMatchObject({ precision: 'symbol', changedSymbols: ['UserConfig'] });
    expect(report.symbolEvidence?.[1]).toMatchObject({ precision: 'symbol', affected: false });
  });

  it('keeps both consumers of the same type: declaration precision is not field precision', async () => {
    put('b.ts', 'import type { User } from "./index"; export const name = (config: User) => config.name;');
    const report = await analyzeImpact({ root, targets, diff: typeDiff(), includeTypeOnly: true });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.symbolEvidence?.every((item) => item.precision === 'symbol')).toBe(true);
  });

  it('preserves default exclusion of type-only edges', async () => {
    expect((await analyzeImpact({ root, targets, diff: typeDiff() })).impactedTargetCount).toBe(0);
  });

  it('follows namespace type references and local type aliases', async () => {
    put('a.ts', 'import type * as models from "./models"; type Local = models.UserConfig; export const f = (x: Local) => x;');
    put('b.ts', 'import type * as models from "./models"; export const f = (x: models.Other) => x;');
    expect((await analyzeImpact({ root, targets, diff: typeDiff(), includeTypeOnly: true })).impacts.map((item) => item.target.id)).toEqual(['a']);
  });

  it.each([
    'export type Derived = UserConfig["name"];',
    'export type Derived<T> = T extends UserConfig ? T : never;',
    'export type Derived = { [K in keyof UserConfig]: UserConfig[K] };',
    'export interface UserConfig { extra?: number }',
  ])('retains conservative fallback for unsupported or merged types: %s', async (extra) => {
    const diff = typeDiff();
    // Extra declaration is unchanged context outside the provided hunk.
    put('models.ts', 'export interface UserConfig {\n  name?: string;\n  enabled?: boolean;\n}\nexport interface Other { name: string }\n' + extra);
    const report = await analyzeImpact({ root, targets, diff, includeTypeOnly: true });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.symbolEvidence?.every((item) => item.precision === 'file')).toBe(true);
  });

  it.each([
    ['/** Generated API documentation: version=1 */\nexport function f() { return request("/user"); }', '/** Generated API documentation: version=2 */\nexport function f() { return request("/user"); }'],
    ['export function f(){return 1;}', 'export function f() {\n  return 1;\n}'],
    ['export function f() { /* 中文旧文档 */ return 1; }', 'export function f() { /* 中文新文档 */ return 1; }'],
    ['console.log("load");\n// old\nexport class C {}', 'console.log("load");\n// new\nexport class C {}'],
  ])('reports checked ordinary comment/format changes as semantic-noop', async (before, after) => {
    put('a.ts', 'import { f } from "./models"; export const page = () => f();');
    const report = await analyzeImpact({ root, targets: [targets[0], { kind: 'entry', id: 'self', file: 'models.ts' }], diff: change(before, after) });
    expect(report.impactedTargetCount).toBe(0);
    expect(report.changedFiles).toEqual([]);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'semantic-noop', files: ['models.ts'] }));
  });

  it.each([
    ['export const f = () => "/user";', 'export const f = () => "/admin";'],
    ['export const f = () => `hello`;', 'export const f = () => `bye`;'],
    ['export const f = () => 1;', 'export const f = () => 2;'],
    ['// @ts-ignore\nexport const f = () => 1;', '// @ts-expect-error\nexport const f = () => 1;'],
    ['/* webpackChunkName: "old" */\nexport const f = () => 1;', '/* webpackChunkName: "new" */\nexport const f = () => 1;'],
  ])('never suppresses runtime literals, implementation or directive changes', async (before, after) => {
    put('a.ts', 'import { f } from "./models"; export const page = () => f();');
    const report = await analyzeImpact({ root, targets: [targets[0]], diff: change(before, after) });
    expect(report.impactedTargetCount).toBe(1);
    expect(report.diagnostics.some((d) => d.code === 'semantic-noop')).toBe(false);
  });

  it('does not confuse exclusions or global configuration with semantic-noop', async () => {
    const diff = change('// old\nexport const f = 1;', '// new\nexport const f = 1;');
    expect((await analyzeImpact({ root, targets, diff, excludeChangedFiles: ['models.ts'] })).diagnostics[0].code).toBe('excluded-changed-files');
    const global = await analyzeImpact({ root, targets, diff: change('// old\nexport default {};', '// new\nexport default {};', 'vite.config.ts') });
    expect(global.impacts.every((item) => item.impact === 'global')).toBe(true);
  });

  it.each([
    ['import type { Other } from "./external";', 'import { Other } from "./external";'],
    ['export type * from "./external";', 'export * from "./external";'],
    ['export type { Other } from "./external";', 'export { Other } from "./external";'],
  ])('does not lose type/runtime edge changes on a declaration line', async (before, after) => {
    put('external.ts', 'export interface Other { x: string }');
    put('a.ts', 'import type { UserConfig } from "./models"; export const page = (x: UserConfig) => x;');
    const suffix = ' export const f = () => 1;\nexport interface UserConfig { x: string }';
    const diff = change(before + suffix, after + suffix);
    const report = await analyzeImpact({ root, targets: [targets[0]], diff, includeTypeOnly: true });
    expect(report.impactedTargetCount).toBe(1);
    expect(report.symbolEvidence?.[0].fallbackReason).toBe('module-shape-changed');
  });

  it('keeps runtime side-effect safeguards in type mode', async () => {
    const diff = typeDiff();
    put('models.ts', 'export interface UserConfig {\n  name?: string;\n  enabled?: boolean;\n}\nexport interface Other { name: string }\nconsole.log("load");');
    const report = await analyzeImpact({ root, targets, diff, includeTypeOnly: true });
    expect(report.impactedTargetCount).toBe(2);
    expect(report.symbolEvidence?.[0].fallbackReason).toBe('top-level-effects');
  });

  it('does not treat a type contract change as a no-op in default runtime mode', async () => {
    put('a.ts', 'import { f } from "./models"; export const page = () => f();');
    const diff = change('export interface User { x: string }\nexport const f = () => 1;', 'export interface User { x: number }\nexport const f = () => 1;');
    const report = await analyzeImpact({ root, targets: [targets[0]], diff });
    expect(report.impactedTargetCount).toBe(1);
    expect(report.diagnostics.some((d) => d.code === 'semantic-noop')).toBe(false);
  });

  it('refines type stars, inline type imports and return annotations', async () => {
    put('index.ts', 'export type * from "./models";');
    put('a.ts', 'import { type UserConfig } from "./index"; export function page(): UserConfig { return {}; }');
    put('b.ts', 'import { type Other } from "./index"; export const page: () => Other = () => ({ name: "b" });');
    expect((await analyzeImpact({ root, targets, diff: typeDiff(), includeTypeOnly: true })).impacts.map((item) => item.target.id)).toEqual(['a']);
  });

  it('rejects stale no-op diffs and keeps modified/no-op files independent', async () => {
    put('a.ts', 'import { f } from "./models"; export const page = () => f();');
    const noopDiff = change('// old\nexport const f = () => 1;', '// new\nexport const f = () => 1;');
    const diff = noopDiff + change('export const page = () => 1;', 'export const page = () => 2;', 'b.ts');
    const mixed = await analyzeImpact({ root, targets, diff });
    expect(mixed.impacts.map((item) => item.target.id)).toEqual(['b']);
    expect(mixed.changedFiles).toEqual(['b.ts']);
    put('models.ts', '// different\nexport const f = () => 1;\n');
    const stale = await analyzeImpact({ root, targets: [targets[0]], diff: noopDiff });
    expect(stale.impactedTargetCount).toBe(1);
    expect(stale.symbolEvidence?.[0].fallbackReason).toBe('diff-source-mismatch');
  });

  it('does not hide newly added files using no-op detection', async () => {
    const diff = change('// old\nexport const f = () => 1;', '// new\nexport const f = () => 1;').replace('--- a/models.ts', '--- /dev/null');
    const report = await analyzeImpact({ root, targets: [{ kind: 'entry', id: 'self', file: 'models.ts' }], diff });
    expect(report.impactedTargetCount).toBe(1);
    expect(report.diagnostics.some((d) => d.code === 'semantic-noop')).toBe(false);
  });
});
