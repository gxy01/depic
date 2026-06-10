import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ImportDeclaration : import NameSpaceImport FromClause ;
 *
 * NameSpaceImport : * as ImportedBinding
 */
describe('import namespace', () => {
  it('parses a namespace import', () => {
    const result = parse(`import * as utils from './utils';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './utils',
      symbols: [{ imported: '*', local: 'utils' }],
      kind: 'static-import',
      isTypeOnly: false,
    });
  });

  it('records source location', () => {
    const result = parse(`import * as utils from './utils';`);

    expect(result.imports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/import-namespace.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('./utils');
    expect(result.imports[0].symbols).toEqual([
      { imported: '*', local: 'utils' },
    ]);
  });
});
