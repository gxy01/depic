import { describe, expect, it } from 'vitest';
import { compareSourceStructure } from '../semantic';

describe('checked source structure equivalence', () => {
  it.each([
    'export const url = "https://example.com/* not a comment */";',
    'export const text = `// @ts-ignore ${1} /* not a comment */`;',
    String.raw`export const pattern = /https?:\/\/[a-z]+/;`,
    'export const node = <div>// @ts-ignore</div>;',
  ])('does not mistake literal contents for comments: %s', (source) => {
    expect(compareSourceStructure('// old\n' + source, '// changed documentation\n' + source, 'test.tsx')).toEqual({ equivalent: true, protectedCommentsChanged: false });
  });

  it.each([
    ['"/user"', '"/admin"'],
    ['`hello ${1}`', '`bye ${1}`'],
    ['String.raw`a\\n`', 'String.raw`a\n`'],
    ['/foo/', '/bar/'],
  ])('preserves runtime literal data: %s', (before, after) => {
    expect(compareSourceStructure(`export const x = ${before};`, `export const x = ${after};`, 'test.ts').equivalent).toBe(false);
  });

  it.each([
    ['export interface X { name: string }', 'export interface X { name?: string }'],
    ['export type X = string;', 'export type X = number;'],
    ['import { X } from "./a";', 'import { X } from "./b";'],
    ['export { X } from "./a";', 'export { Y as X } from "./a";'],
    ['function f() { return 1; }', 'function f() { return\n1; }'],
    ['"use strict"; const x = 1;', '"use client"; const x = 1;'],
  ])('retains type contracts, module structure and ASI semantics', (before, after) => {
    expect(compareSourceStructure(before, after, 'test.ts').equivalent).toBe(false);
  });

  it.each([
    ['// @ts-ignore\nconst x = 1;', '// @ts-expect-error\nconst x = 1;'],
    ['/* @__PURE__ */ f();', 'f(/* @__PURE__ */);'],
    ['/* @ts-ignore */\nconst x = 1;', '/* @ts-ignore */ const x = 1;'],
    ['/** @type {string} */ let x;', '/** @type {number} */ let x;'],
    ['/// <reference path="a.d.ts"/>', '/// <reference path="b.d.ts"/>'],
    ['// custom[old]\nconst x = 1;', '// custom[new]\nconst x = 1;'],
    ['const x = `${/* @old */ 1}`;', 'const x = `${/* @new */ 1}`;'],
  ])('protects directive content, placement and unknown markup', (before, after) => {
    expect(compareSourceStructure(before, after, 'test.ts')).toEqual({ equivalent: false, protectedCommentsChanged: true });
  });

  it('allows ordinary documentation edits while retaining identical JSDoc contracts', () => {
    const suffix = '\n/** @param {string} name */\nexport const f = (name) => name;';
    expect(compareSourceStructure('// old' + suffix, '// updated docs' + suffix, 'test.js').equivalent).toBe(true);
  });
});
