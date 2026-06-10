import { describe, it, expect } from 'vitest';
import { parse } from '../test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFile } from '../../parseFile';

describe('edge cases', () => {
  it('handles BOM (byte order mark) in source', () => {
    const source = '﻿' + `import { foo } from './bar';`;

    const result = parse(source, '/test/bom.ts');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      specifier: './bar',
      symbols: [{ imported: 'foo', local: 'foo' }],
      kind: 'static-import',
    });
  });

  it('handles BOM fixture file', () => {
    const fixturePath = resolve(
      import.meta.dirname,
      '../fixtures/esm/import-with-bom.ts',
    );
    const source = readFileSync(fixturePath, 'utf-8');

    // Verify the file actually starts with BOM
    expect(source.charCodeAt(0)).toBe(0xfeff);

    const result = parseFile(source, fixturePath);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifier).toBe('./bar');
  });

  it('throws on syntax error', () => {
    expect(() => parse(`import { from './foo';`)).toThrow();
  });

  it('handles empty file', () => {
    const result = parse('');

    expect(result.imports).toEqual([]);
    expect(result.exports).toEqual([]);
  });

  it('handles file with only whitespace', () => {
    const result = parse('   \n  \n  ');

    expect(result.imports).toEqual([]);
    expect(result.exports).toEqual([]);
  });

  it('records correct line number for multi-line source', () => {
    const result = parse(`// comment\nimport { foo } from './bar';`);

    expect(result.imports).toHaveLength(1);
    // import is on line 2
    expect(result.imports[0].loc.line).toBe(2);
  });

  it('parses export var', () => {
    const result = parse(`export var x = 1;`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe('x');
    expect(result.exports[0].kind).toBe('named');
  });

  it('parses export default class', () => {
    const result = parse(`export default class Foo {}`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'Foo',
      kind: 'default',
    });
  });

  it('parses export default anonymous class', () => {
    const result = parse(`export default class {}`);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]).toMatchObject({
      name: 'default',
      kind: 'default',
    });
  });
});
