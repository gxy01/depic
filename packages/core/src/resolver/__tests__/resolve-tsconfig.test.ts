import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Resolver } from '../index';

describe('resolve tsconfig paths', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-tsconfig-'));
    // 创建 tsconfig.json
    writeFileSync(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['./src/*'],
            '@lib/*': ['./src/lib/*', './src/vendor/*'],
            '@styles': ['./src/styles/index.ts'],
          },
        },
      }),
    );
    // 创建实际文件
    mkdirSync(join(tmpDir, 'src', 'utils'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'utils', 'foo.ts'), 'export const foo = 1;');
    writeFileSync(join(tmpDir, 'src', 'utils', 'bar.tsx'), 'export const bar = 1;');
    // tsconfig paths fallback
    mkdirSync(join(tmpDir, 'src', 'vendor'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'vendor', 'helper.ts'), 'export const h = 1;');
    // no-extension path
    mkdirSync(join(tmpDir, 'src', 'styles'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'styles', 'index.ts'), 'export const styles = 1;');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves @/utils/foo to src/utils/foo.ts', () => {
    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('@/utils/foo', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'src/utils/foo.ts'),
    });
  });

  it('completes extension for tsconfig path', () => {
    const resolver = new Resolver({ root: tmpDir });
    // bar.tsx exists, not bar.ts
    const result = resolver.resolve('@/utils/bar', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'src/utils/bar.tsx'),
    });
  });

  it('tries multiple fallback patterns in order', () => {
    const resolver = new Resolver({ root: tmpDir });
    // @lib/helper → first tries ./src/lib/* then ./src/vendor/*
    const result = resolver.resolve('@lib/helper', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'src/vendor/helper.ts'),
    });
  });

  it('resolves no-wildcard tsconfig path', () => {
    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('@styles', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'src/styles/index.ts'),
    });
  });

  it('returns unresolved for tsconfig path with no match', () => {
    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('@/nonexistent', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'unresolved',
      specifier: '@/nonexistent',
    });
  });

  it('auto-finds tsconfig.json from root', () => {
    // resolver should find tsconfig.json without explicit path
    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('@/utils/foo', join(tmpDir, 'src/index.ts'));

    expect(result.kind).toBe('file');
  });

  it('uses explicit tsconfigPath', () => {
    const resolver = new Resolver({
      root: tmpDir,
      tsconfigPath: join(tmpDir, 'tsconfig.json'),
    });
    const result = resolver.resolve('@/utils/foo', join(tmpDir, 'src/index.ts'));

    expect(result.kind).toBe('file');
  });

  it('uses tsconfig nearest to fromFile (nested tsconfig)', () => {
    // Root tsconfig: no paths
    const { writeFileSync, mkdirSync } = require('node:fs');
    writeFileSync(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.' } }),
    );
    // Nested tsconfig: has @app/* paths
    mkdirSync(join(tmpDir, 'nested'), { recursive: true });
    mkdirSync(join(tmpDir, 'nested', 'lib'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'nested', 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@app/*': ['./lib/*'] } },
      }),
    );
    writeFileSync(
      join(tmpDir, 'nested', 'lib', 'helper.ts'),
      'export const h = 1;',
    );

    const resolver = new Resolver({ root: tmpDir });

    // 从 nested/ 下的文件解析 @app/helper → 使用 nested/tsconfig.json
    const result = resolver.resolve(
      '@app/helper',
      join(tmpDir, 'nested', 'index.ts'),
    );
    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'nested/lib/helper.ts'),
    });

    // 从根目录下的文件解析 @app/helper → 没有匹配的 tsconfig paths → external
    const result2 = resolver.resolve(
      '@app/helper',
      join(tmpDir, 'root-file.ts'),
    );
    expect(result2.kind).toBe('external');
  });

  it('parses tsconfig with comments', () => {
    writeFileSync(
      join(tmpDir, 'tsconfig.json'),
      `{
        // base URL for paths
        "compilerOptions": {
          "baseUrl": ".",
          /* paths configuration */
          "paths": {
            "@/*": ["./src/*"]
          }
        }
      }`,
    );

    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('@/utils/foo', join(tmpDir, 'src/index.ts'));
    expect(result.kind).toBe('file');
  });

  it('respects tsconfig baseUrl', () => {
    // baseUrl = "src" means paths are resolved relative to src/
    writeFileSync(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { baseUrl: 'src', paths: { '@app/*': ['./lib/*'] } },
      }),
    );
    mkdirSync(join(tmpDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib', 'util.ts'), 'export const u = 1;');

    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('@app/util', join(tmpDir, 'src/index.ts'));
    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'src/lib/util.ts'),
    });
  });

  it('uses custom extensions option', () => {
    const resolver = new Resolver({
      root: tmpDir,
      extensions: ['.js', '.ts'],
    });

    // .tsx should NOT be tried → unresolved
    writeFileSync(join(tmpDir, 'src', 'utils', 'baz.tsx'), 'export const b = 1;');
    const result = resolver.resolve('@/utils/baz', join(tmpDir, 'src/index.ts'));
    expect(result.kind).toBe('unresolved');
  });

  it('works without tsconfig (no paths configured)', () => {
    const noTsconfigDir = mkdtempSync(join(tmpdir(), 'depic-no-tsconfig-'));
    const resolver = new Resolver({ root: noTsconfigDir });

    // relative paths still work
    writeFileSync(join(noTsconfigDir, 'a.ts'), '');
    const result = resolver.resolve('./a', join(noTsconfigDir, 'b.ts'));
    expect(result.kind).toBe('file');

    rmSync(noTsconfigDir, { recursive: true, force: true });
  });
});
