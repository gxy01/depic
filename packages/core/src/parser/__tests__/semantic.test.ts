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

  it('keeps unchanged generated-file wrappers attached after a type grows', () => {
    const before = '/* eslint-disable */\n// @ts-nocheck\nexport interface UserConfig { name?: string }\nexport interface OtherConfig { label?: string }\n/* eslint-enable */';
    const after = before.replace('name?: string', 'name?: string; enabled?: boolean');
    expect(compareSourceStructure(before, after, 'test.ts')).toEqual({ equivalent: false, protectedCommentsChanged: false });
  });

  it('keeps unchanged Oxlint wrappers attached after a declaration grows', () => {
    const before = '// oxlint-disable no-console\nexport interface UserConfig { name?: string }\nexport interface OtherConfig { label?: string }\n// oxlint-enable no-console';
    const after = before.replace('name?: string', 'name?: string; enabled?: boolean');
    expect(compareSourceStructure(before, after, 'test.ts')).toEqual({ equivalent: false, protectedCommentsChanged: false });
  });

  it('anchors a directive between declarations independently of preceding code length', () => {
    const before = 'export interface A { name: string }\n/* eslint-disable */\nexport interface B { x: string }\n/* eslint-enable */';
    expect(compareSourceStructure(before, before.replace('name: string', 'name: string; age: number'), 'test.ts').protectedCommentsChanged).toBe(false);
  });

  it('keeps UTF-8 spans correct when a preceding declaration grows', () => {
    const before = 'export const text = "中文😀";\n/* eslint-disable */\nexport interface A { x: string }\n/* eslint-enable */';
    expect(compareSourceStructure(before, before.replace('中文😀', '更多中文😀😀'), 'test.ts').protectedCommentsChanged).toBe(false);
  });

  it('keeps nested expression directives on the strict fallback path', () => {
    const before = 'export function f() { const a = 1; /* @__PURE__ */ return g(); }';
    expect(compareSourceStructure(before, before.replace('a = 1', 'a = 123'), 'test.ts').protectedCommentsChanged).toBe(true);
  });

  it.each([
    '[API docs](https://example.com/docs?version=1)',
    '[中文文档](https://example.com/docs?version=1&lang=zh#api)',
    'Read [API docs](http://example.com/v1) for details.',
  ])('recognizes a bounded documentation link: %s', (text) => {
    const before = `/**\n * ${text}\n */\nexport function f() { return 1; }`;
    expect(compareSourceStructure(before, before.replace('1', '2'), 'test.ts')).toEqual({ equivalent: true, protectedCommentsChanged: false });
  });

  it.each([
    ['/* eslint-disable */\nconst a = 1;\n/* eslint-enable */\nconst b = 2;', '/* eslint-disable */\nconst a = 1;\nconst b = 2;\n/* eslint-enable */'],
    ['/* eslint-disable */\nconst a = 1;\nconst b = 2;', 'const a = 1;\n/* eslint-disable */\nconst b = 2;'],
    ['// @ts-ignore\nconst a = 1;\nconst b = 2;', 'const a = 1;\n// @ts-ignore\nconst b = 2;'],
    ['// @ts-ignore\n// docs\nconst a = 1;', '// docs\n// @ts-ignore\nconst a = 1;'],
    ['/* eslint-disable */\n// @ts-nocheck\nconst a = 1;', '// @ts-nocheck\n/* eslint-disable */\nconst a = 1;'],
    ['const a = 1;', '/* eslint-disable */\nconst a = 1;'],
    ['/* eslint-disable */\nconst a = 1;', 'const a = 1;'],
    ['/* eslint-disable */\nconst a = 1;', '/* eslint-enable */\nconst a = 1;'],
    ['// oxlint-disable no-console\nconst a = 1;', '// oxlint-enable no-console\nconst a = 1;'],
    ['// oxlint-disable no-console\nconst a = 1;', '// oxlint-disable no-debugger\nconst a = 1;'],
    ['const a = 1;', '// oxlint-disable no-console\nconst a = 1;'],
    ['// oxlint-disable no-console\nconst a = 1;', 'const a = 1;'],
    ['// oxlint-disable no-console\nconst a = 1;\nconst b = 2;', 'const a = 1;\n// oxlint-disable no-console\nconst b = 2;'],
    ['// oxlint-disable-next-line no-console\nconst a = 1;', '// oxlint-disable-next-line no-console\n// docs\nconst a = 1;'],
    ['// @ts-ignore\nconst a = 1;\nconst b = 2;', '// @ts-ignore\nconst b = 2;\nconst a = 1;'],
  ])('protects directive identity, ordering and controlled ranges', (before, after) => {
    expect(compareSourceStructure(before, after, 'test.ts').protectedCommentsChanged).toBe(true);
  });

  it.each([
    '[docs](javascript:custom1)',
    'custom[old1]',
    '[docs](https://example.com/1) @custom',
    '[docs](https://example.com/1) eslint-disable',
    '[docs](https://example.com/1#@__PURE__)',
    '[docs](https://example.com/1#__PURE__)',
    '[docs](https://example.com/1/@__NO_SIDE_EFFECTS__)',
    '[docs](https://user:pass@example.com/1)',
    '[docs](https://)',
    '[docs](https://example.com/1',
    '<custom value="1">',
  ])('keeps unrecognized or directive-bearing markup protected: %s', (text) => {
    const before = `/** ${text} */\nexport const a = 1;`;
    expect(compareSourceStructure(before, before.replace('docs', 'reference').replace('1', '2'), 'test.ts').protectedCommentsChanged).toBe(true);
  });
});
