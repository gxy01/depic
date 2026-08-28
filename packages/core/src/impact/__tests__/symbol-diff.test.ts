import { describe, expect, it } from 'vitest';
import { parseSymbolModule } from '../../parser/symbols';
import { changedSymbols } from '../symbol-diff';

const classify = (source: string, diff: string) => changedSymbols(source, diff, 'test.ts', parseSymbolModule(source, 'test.ts'));

describe('checked diff to symbol mapping', () => {
  it('handles multiple hunks and inserted/deleted lines with UTF-8 source', () => {
    const source = 'const label = "中文😀";\nexport function a() {\n  const x = 2;\n  return x;\n}\nexport function b() {\n  return 3;\n}\n';
    const diff = '@@ -2,3 +2,4 @@\n export function a() {\n-  return 1;\n+  const x = 2;\n+  return x;\n }\n'
      + '@@ -5,4 +6,3 @@\n export function b() {\n-  const y = 2;\n-  return y;\n+  return 3;\n }\n';
    expect(classify(source, diff)).toEqual(['a', 'b']);
  });

  it.each([
    ['@@ -1,0 +2 @@\n+  return 1;\n', 'export function a() {\n  return 1;\n}\n'],
    ['@@ -2 +1,0 @@\n-  console.log("old");\n', 'export function a() {\n}\n'],
  ])('handles zero-context insertion/deletion: %s', (patch, source) => {
    expect(classify(source, patch)).toEqual(['a']);
  });

  it.each([
    '@@ -1 +1 @@\n-export const a = 0;\n+export const a = 2;\n',
    '@@ -1,2 +1 @@\n-export const a = 0;\n+export const a = 1;\n',
    '@@ -1 +1 @@\n-export const a = 0;\n+export const a = 1;\n+extra\n',
    '@@ -1 +1 @@\n-export const a = 0;\n+export const a = 1;\n\\ No newline at end of file\n',
    '@@ -0 +0 @@\n-export const a = 0;\n+export const a = 1;\n',
    '@@ -1 +1 @@\n export const a = 1;\n',
    '',
  ])('rejects stale, malformed, unsupported or empty hunks: %s', (patch) => {
    expect(() => classify('export const a = 1;\n', patch)).toThrow();
  });

  it('recognizes a checked comment-only change outside declarations', () => {
    expect(classify('// new\nexport const a = 1;\n', '@@ -1 +1 @@\n-// old\n+// new\n')).toEqual([]);
  });

  it.each(['', '\n', '\n\n'])('preserves EOF trivia after a trailing directive: %j', (ending) => {
    const source = '// new\nexport const a = 1;\n/* eslint-enable */' + ending;
    expect(classify(source, '@@ -1 +1 @@\n-// old\n+// new\n')).toEqual([]);
  });
});
