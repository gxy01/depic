import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ImportDeclaration : import ModuleSpecifier ;
 *
 * 副作用导入 — 没有 ImportClause，仅为了执行模块副作用。
 */
describe('import side-effect', () => {
  it('parses a side-effect import', () => {
    const result = parse(`import './foo';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './foo',
      symbols: [],
      kind: 'static-import',
      isTypeOnly: false,
    });
  });

  it('parses a relative path side-effect import', () => {
    const result = parse(`import '../bar';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('../bar');
    expect(result.imports[0].symbols).toEqual([]);
  });

  it('records source location', () => {
    const result = parse(`import './foo';`);

    expect(result.imports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/import-side-effect.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('./styles');
    expect(result.imports[0].symbols).toEqual([]);
  });
});
