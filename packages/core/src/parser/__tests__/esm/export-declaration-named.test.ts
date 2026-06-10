import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ExportDeclaration : export NamedExports ;
 * NamedExports : { ExportsList }
 */
describe('export { named }', () => {
  it('parses a single named export', () => {
    const result = parse(`export { foo };`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'foo',
      kind: 'named',
      isTypeOnly: false,
    });
  });

  it('parses multiple named exports', () => {
    const result = parse(`export { foo, bar };`);

    expect(result.exports).toHaveLength(2);
    expect(result.exports[0]).toMatchObject({ name: 'foo', kind: 'named' });
    expect(result.exports[1]).toMatchObject({ name: 'bar', kind: 'named' });
  });

  it('parses export with alias', () => {
    const result = parse(`export { foo as baz };`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe('baz');
  });

  it('records source location', () => {
    const result = parse(`export { foo };`);

    expect(result.exports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/export-named.ts');

    expect(result.exports).toHaveLength(2);
    expect(result.exports[0].name).toBe('foo');
    expect(result.exports[1].name).toBe('bar');
  });
});
