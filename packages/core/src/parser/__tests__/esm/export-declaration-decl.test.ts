import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ExportDeclaration : export VariableStatement
 * ExportDeclaration : export Declaration
 *
 * 即 export const / export let / export var / export function / export class
 */
describe('export declaration', () => {
  it('parses export const', () => {
    const result = parse(`export const foo = 1;`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'foo',
      kind: 'named',
      isTypeOnly: false,
    });
  });

  it('parses export function', () => {
    const result = parse(`export function foo() {}`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'foo',
      kind: 'named',
    });
  });

  it('parses export class', () => {
    const result = parse(`export class Foo {}`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'Foo',
      kind: 'named',
    });
  });

  it('parses export let', () => {
    const result = parse(`export let foo = 1;`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'foo',
      kind: 'named',
    });
  });

  it('records source location', () => {
    const result = parse(`export const foo = 1;`);

    expect(result.exports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/export-decl.ts');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'foo',
      kind: 'named',
    });
  });
});
