import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 ECMAScript 产生式:
 * ExportDeclaration : export default AssignmentExpression ;
 * ExportDeclaration : export default HoistableDeclaration ;
 * ExportDeclaration : export default ClassDeclaration ;
 */
describe('export default', () => {
  it('parses export default expression', () => {
    const result = parse(`export default 42;`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'default',
      kind: 'default',
      isTypeOnly: false,
    });
  });

  it('parses export default function', () => {
    const result = parse(`export default function foo() {}`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe('foo');
    expect(result.exports[0].kind).toBe('default');
  });

  it('parses export default anonymous function', () => {
    const result = parse(`export default function() {}`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe('default');
    expect(result.exports[0].kind).toBe('default');
  });

  it('records source location', () => {
    const result = parse(`export default 42;`);

    expect(result.exports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('esm/export-default-expr.ts');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'default',
      kind: 'default',
    });
  });
});
