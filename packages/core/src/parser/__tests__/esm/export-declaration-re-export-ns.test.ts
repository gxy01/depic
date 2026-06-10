import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ExportDeclaration : export * as Identifier FromClause ;
 */
describe('export * as ns from specifier', () => {
  it('parses export namespace', () => {
    const result = parse(`export * as ns from './bar';`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'ns',
      kind: 'named',
      reExportFrom: './bar',
      isTypeOnly: false,
    });
  });

  it('records source location', () => {
    const result = parse(`export * as ns from './bar';`);

    expect(result.exports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/export-re-export-ns.ts');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'ns',
      kind: 'named',
      reExportFrom: './bar',
    });
  });
});
