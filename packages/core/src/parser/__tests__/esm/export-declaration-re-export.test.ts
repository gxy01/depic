import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ExportDeclaration : export { ExportsList } FromClause ;
 */
describe('export { named } from specifier', () => {
  it('parses a single re-export', () => {
    const result = parse(`export { foo } from './bar';`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'foo',
      kind: 'named',
      reExportFrom: './bar',
      isTypeOnly: false,
    });
  });

  it('parses multiple re-exports', () => {
    const result = parse(`export { foo, bar } from './baz';`);

    expect(result.exports).toHaveLength(2);
    expect(result.exports[0]).toMatchObject({ name: 'foo', reExportFrom: './baz' });
    expect(result.exports[1]).toMatchObject({ name: 'bar', reExportFrom: './baz' });
  });

  it('parses re-export with alias', () => {
    const result = parse(`export { foo as baz } from './bar';`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe('baz');
    expect(result.exports[0].reExportFrom).toBe('./bar');
  });

  it('records source location', () => {
    const result = parse(`export { foo } from './bar';`);

    expect(result.exports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/export-re-export.ts');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'foo',
      kind: 'named',
      reExportFrom: './bar',
    });
  });
});
