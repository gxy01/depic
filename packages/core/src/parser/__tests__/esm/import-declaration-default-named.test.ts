import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ImportDeclaration : import ImportedDefaultBinding , NamedImports FromClause ;
 */
describe('import default + named', () => {
  it('parses default + named import', () => {
    const result = parse(`import React, { useState } from 'react';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: 'react',
      kind: 'static-import',
      isTypeOnly: false,
    });
    expect(result.imports[0].symbols).toEqual([
      { imported: 'default', local: 'React' },
      { imported: 'useState', local: 'useState' },
    ]);
  });

  it('parses default + named import with alias', () => {
    const result = parse(`import foo, { bar as baz } from './mod';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('./mod');
    expect(result.imports[0].symbols).toEqual([
      { imported: 'default', local: 'foo' },
      { imported: 'bar', local: 'baz' },
    ]);
  });

  it('records source location', () => {
    const result = parse(`import React, { useState } from 'react';`);

    expect(result.imports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/import-default-named.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('react');
    expect(result.imports[0].symbols).toEqual([
      { imported: 'default', local: 'React' },
      { imported: 'useState', local: 'useState' },
    ]);
  });
});
