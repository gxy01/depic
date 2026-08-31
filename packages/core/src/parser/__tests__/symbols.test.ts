import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSymbolModule } from '../symbols';

describe('symbol proof parser', () => {
  it('preserves export aliases, namespace provenance and static member references', () => {
    const source = readFileSync(new URL('./fixtures/esm/symbol-proof.ts', import.meta.url), 'utf8');
    const module = parseSymbolModule(source, 'symbol-proof.ts');
    expect(module.fallbackReason).toBeUndefined();
    expect(module.imports.get('api')).toEqual({ name: '*', source: './source' });
    expect(module.exports.get('renamed')).toEqual({ name: 'original', source: './source' });
    expect(module.exports.get('namespace')).toEqual({ name: '*', source: './source' });
    expect(module.declarations.get('consumer')?.references).toContainEqual({ name: 'api', members: ['fetch'] });
    expect(module.declarations.get('consumer')?.startLine).toBe(5);
    expect(module.declarations.get('consumer')?.endLine).toBe(7);
  });

  it('uses UTF-8 byte offsets correctly after non-ASCII text', () => {
    const source = 'const label = "中文😀";\nexport function foo() { return label; }\n';
    expect(parseSymbolModule(source, 'test.ts').declarations.get('foo')).toMatchObject({ startLine: 2, endLine: 2 });
  });

  it('models safe exported object-literal members independently', () => {
    const source = `const suffix = '!';
export const client = {
  fetchA: () => 'a' + suffix,
  fetchB() { return 'b'; },
  ['version']: 1,
};`;
    const module = parseSymbolModule(source, 'test.ts');
    expect(module.fallbackReason).toBeUndefined();
    expect(module.declarations.get('client')?.members).toEqual(['fetchA', 'fetchB', 'version']);
    expect(module.declarations.get('client.fetchA')?.references).toContainEqual({ name: 'suffix', members: [] });
    expect(module.declarations.get('client.fetchA')).toMatchObject({ startLine: 3, endLine: 3 });
    expect(module.declarations.get('client.fetchB')).toMatchObject({ startLine: 4, endLine: 4 });
  });

  it('collects interface/type declarations, annotation references and qualified type provenance', () => {
    const source = readFileSync(new URL('./fixtures/ts/symbol-contracts.ts', import.meta.url), 'utf8');
    const module = parseSymbolModule(source, 'contracts.ts', true);
    expect(module.fallbackReason).toBeUndefined();
    expect(module.declarations.get('Config')).toMatchObject({ kind: 'type', startLine: 4, endLine: 4 });
    expect(module.exports.get('PublicUser')).toEqual({ name: 'User', source: './models', isTypeOnly: true });
    expect(module.declarations.get('Response')?.references).toContainEqual({ name: 'models', members: ['Error'] });
    expect(module.declarations.get('handle')?.references).toContainEqual({ name: 'Response', members: [] });
    const runtime = parseSymbolModule(source, 'contracts.ts');
    expect(runtime.declarations.has('Config')).toBe(false);
    expect(runtime.imports.has('models')).toBe(false);
  });

  it.each([
    'import { Foo } from "./foo"; type Foo = string; export const f = () => Foo;',
    'type Foo = string; import { Foo } from "./foo"; export const f = () => Foo;',
    'export type { Foo } from "./a"; export { Foo } from "./b";',
  ])('does not resolve ambiguous type/value name collisions optimistically', (source) => {
    expect(parseSymbolModule(source, 'test.ts', true).fallbackReason).toBe('duplicate-binding');
  });

  it.each([
    'export class A { static value = effect(); }',
    'export const value = effect();',
    'export let value = 1;',
    'export const { value } = object;',
    'export default effect();',
    'import "./side-effect";',
    'export const f = (key: string) => api[key];',
    'export const f = () => eval("code");',
    'export const client = { ...other, fetch: () => 1 };',
    'export const client = { get fetch() { return 1; } };',
    'export const client = { [key]: () => 1 };',
    'export const client = { fetch: effect() };',
  ])('marks unsupported or effectful syntax as a fallback: %s', (source) => {
    expect(parseSymbolModule(source, 'test.ts').fallbackReason).toBeDefined();
  });
});
