import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ImportCall — import('foo')
 *
 * 动态导入表达式。
 */
describe('dynamic import()', () => {
  it('parses bare import() call', () => {
    const result = parse(`import('./foo');`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './foo',
      symbols: [],
      kind: 'dynamic-import',
      isTypeOnly: false,
    });
  });

  it('parses const x = import()', () => {
    const result = parse(`const x = import('./foo');`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './foo',
      kind: 'dynamic-import',
    });
  });

  it('parses return import()', () => {
    const result = parse(`function f() { return import('./foo'); }`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './foo',
      kind: 'dynamic-import',
    });
  });

  it('records source location', () => {
    const result = parse(`import('./foo');`);

    expect(result.imports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/import-dynamic.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './foo',
      kind: 'dynamic-import',
    });
  });
});
