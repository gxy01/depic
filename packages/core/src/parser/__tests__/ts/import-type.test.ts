import { describe, it, expect } from 'vitest';
import { parse, parseFixture } from '../test-utils';

/**
 * 对应 TypeScript 扩展:
 * import type { Foo } from 'bar'
 * import type Foo from 'bar'
 * import type * as Foo from 'bar'
 */
describe('import type', () => {
  it('parses import type (named)', () => {
    const result = parse(`import type { Foo } from './types';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './types',
      symbols: [{ imported: 'Foo', local: 'Foo' }],
      kind: 'static-import',
      isTypeOnly: true,
    });
  });

  it('parses import type (default)', () => {
    const result = parse(`import type Foo from './types';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './types',
      symbols: [{ imported: 'default', local: 'Foo' }],
      kind: 'static-import',
      isTypeOnly: true,
    });
  });

  it('parses import type (namespace)', () => {
    const result = parse(`import type * as Foo from './types';`);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './types',
      symbols: [{ imported: '*', local: 'Foo' }],
      kind: 'static-import',
      isTypeOnly: true,
    });
  });

  it('records source location', () => {
    const result = parse(`import type { Foo } from './types';`);

    expect(result.imports[0].loc).toEqual({ line: 1, column: 0 });
  });

  it('parses from a fixture file', () => {
    const result = parseFixture('ts/import-type.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './types',
      isTypeOnly: true,
    });
  });
});
