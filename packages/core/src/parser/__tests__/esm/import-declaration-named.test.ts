import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ImportDeclaration : import NamedImports FromClause ;
 *
 * NamedImports : { ImportsList }
 * ImportsList  : ImportSpecifier , ImportSpecifier , ...
 * ImportSpecifier : ImportedBinding
 *                : IdentifierName as ImportedBinding
 */
describe('import { named } from specifier', () => {
  it('parses a single named import', () => {
    const result = parse(`import { foo } from './bar';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './bar',
      symbols: [{ imported: 'foo', local: 'foo' }],
      kind: 'static-import',
      isTypeOnly: false,
    });
  });

  it('parses multiple named imports', () => {
    const result = parse(`import { foo, bar } from './baz';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('./baz');
    expect(result.imports[0].symbols).toEqual([
      { imported: 'foo', local: 'foo' },
      { imported: 'bar', local: 'bar' },
    ]);
  });

  it('parses named import with alias (as)', () => {
    const result = parse(`import { foo as baz } from './bar';`);

    expect(result.imports[0].symbols).toEqual([
      { imported: 'foo', local: 'baz' },
    ]);
  });

  it('parses mixed aliased and non-aliased imports', () => {
    const result = parse(`import { foo, bar as baz } from './mod';`);

    expect(result.imports[0].symbols).toEqual([
      { imported: 'foo', local: 'foo' },
      { imported: 'bar', local: 'baz' },
    ]);
  });

  it('records source location', () => {
    const result = parse(`import { foo } from './bar';`);

    expect(result.imports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/import-named.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('./bar');
    expect(result.imports[0].symbols).toEqual([
      { imported: 'foo', local: 'foo' },
    ]);
  });
});
