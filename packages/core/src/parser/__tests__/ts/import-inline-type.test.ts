import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 TypeScript 扩展:
 * import { type Foo } from 'bar'  — 单个符号的 inline type modifier
 */
describe('import { type Foo }', () => {
  it('parses inline type modifier on a single specifier', () => {
    const result = parse(`import { type Foo } from './types';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './types',
      kind: 'static-import',
      isTypeOnly: false, // 声明级别不是 type-only
    });
    // inline type 只影响单个符号
    expect(result.imports[0].symbols).toHaveLength(1);
    expect(result.imports[0].symbols[0]).toEqual({
      imported: 'Foo',
      local: 'Foo',
      isTypeOnly: true,
    });
  });

  it('parses mixed type and value imports', () => {
    const result = parse(`import { type Foo, Bar } from './types';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].symbols).toHaveLength(2);
    expect(result.imports[0].symbols[0]).toEqual({
      imported: 'Foo',
      local: 'Foo',
      isTypeOnly: true,
    });
    expect(result.imports[0].symbols[1]).toEqual({
      imported: 'Bar',
      local: 'Bar',
    });
  });

  it('records source location', () => {
    const result = parse(`import { type Foo } from './types';`);

    expect(result.imports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('ts/import-inline-type.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('./types');
    expect(result.imports[0].symbols[0]).toMatchObject({
      imported: 'Foo',
      isTypeOnly: true,
    });
    expect(result.imports[0].symbols[1]).toMatchObject({
      imported: 'Bar',
    });
    expect(result.imports[0].symbols[1].isTypeOnly).toBeUndefined();
  });
});
