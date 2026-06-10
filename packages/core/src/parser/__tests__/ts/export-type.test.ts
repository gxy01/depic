import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 TypeScript 扩展:
 * export type { Foo }
 * export type { Foo } from './bar'
 * export type * from './bar'
 */
describe('export type', () => {
  it('parses export type { named }', () => {
    const result = parse(`export type { Foo };`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'Foo',
      kind: 'named',
      isTypeOnly: true,
    });
  });

  it('parses export type { named } from specifier', () => {
    const result = parse(`export type { Foo } from './types';`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'Foo',
      kind: 'named',
      reExportFrom: './types',
      isTypeOnly: true,
    });
  });

  it('parses export type * from specifier', () => {
    const result = parse(`export type * from './types';`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: '*',
      kind: 'all',
      reExportFrom: './types',
      isTypeOnly: true,
    });
  });

  it('records source location', () => {
    const result = parse(`export type { Foo };`);

    expect(result.exports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file (named)', () => {
    const result = parseFixture('ts/export-type-named.ts');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'Foo',
      kind: 'named',
      isTypeOnly: true,
    });
  });

  it('parses from a fixture file (re-export)', () => {
    const result = parseFixture('ts/export-type-re-export.ts');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'Foo',
      kind: 'named',
      reExportFrom: './types',
      isTypeOnly: true,
    });
  });
});
