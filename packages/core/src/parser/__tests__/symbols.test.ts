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

  it.each([
    'export class A { static value = effect(); }',
    'export const value = effect();',
    'export let value = 1;',
    'export const { value } = object;',
    'export default effect();',
    'import "./side-effect";',
    'export const f = (key: string) => api[key];',
    'export const f = () => eval("code");',
  ])('marks unsupported or effectful syntax as a fallback: %s', (source) => {
    expect(parseSymbolModule(source, 'test.ts').fallbackReason).toBeDefined();
  });
});
