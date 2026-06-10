import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ExportDeclaration : export * FromClause ;
 */
describe('export * from specifier', () => {
  it('parses export all', () => {
    const result = parse(`export * from './bar';`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: '*',
      kind: 'all',
      reExportFrom: './bar',
      isTypeOnly: false,
    });
  });

  it('records source location', () => {
    const result = parse(`export * from './bar';`);

    expect(result.exports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/export-re-export-all.ts');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: '*',
      kind: 'all',
      reExportFrom: './bar',
    });
  });
});
