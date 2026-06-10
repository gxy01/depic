import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ImportDeclaration : import ImportedDefaultBinding FromClause ;
 *
 * ImportedDefaultBinding : ImportedBinding
 */
describe('import default', () => {
  it('parses a default import', () => {
    const result = parse(`import React from 'react';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: 'react',
      symbols: [{ imported: 'default', local: 'React' }],
      kind: 'static-import',
      isTypeOnly: false,
    });
  });

  it('records source location', () => {
    const result = parse(`import React from 'react';`);

    expect(result.imports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/import-default.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('react');
    expect(result.imports[0].symbols).toEqual([
      { imported: 'default', local: 'React' },
    ]);
  });
});
