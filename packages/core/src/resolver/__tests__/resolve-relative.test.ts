import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Resolver } from '../index';

describe('resolve relative paths', () => {
  let tmpDir: string;
  let resolver: Resolver;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-resolver-'));
    // Create a basic project structure
    writeFileSync(join(tmpDir, 'foo.ts'), 'export const x = 1;');
    writeFileSync(join(tmpDir, 'bar.ts'), 'export const y = 1;');
    writeFileSync(join(tmpDir, 'baz.tsx'), 'export const w = 1;');
    // Sub-dir with index
    mkdirSync(join(tmpDir, 'utils'));
    writeFileSync(join(tmpDir, 'utils', 'index.ts'), 'export const z = 1;');
    writeFileSync(join(tmpDir, 'utils', 'helper.ts'), 'export const h = 1;');

    resolver = new Resolver({ root: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves ./bar to ./bar.ts (extension completion)', () => {
    const result = resolver.resolve('./bar', join(tmpDir, 'foo.ts'));
    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'bar.ts'),
    });
  });

  it('resolves ./baz to ./baz.tsx (tries .ts first, then .tsx)', () => {
    const result = resolver.resolve('./baz', join(tmpDir, 'foo.ts'));
    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'baz.tsx'),
    });
  });

  it('resolves ./utils to ./utils/index.ts', () => {
    const result = resolver.resolve('./utils', join(tmpDir, 'foo.ts'));
    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'utils/index.ts'),
    });
  });

  it('resolves ../parent/bar from nested file', () => {
    // Create nested file
    mkdirSync(join(tmpDir, 'nested'));
    writeFileSync(join(tmpDir, 'nested', 'child.ts'), 'import { y } from "../bar";');

    const result = resolver.resolve('../bar', join(tmpDir, 'nested/child.ts'));
    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'bar.ts'),
    });
  });

  it('resolves specifier that already has extension', () => {
    writeFileSync(join(tmpDir, 'data.json'), '{}');
    const result = resolver.resolve('./data.json', join(tmpDir, 'foo.ts'));
    expect(result).toEqual({
      kind: 'file',
      path: join(tmpDir, 'data.json'),
    });
  });

  it('returns unresolved for directory without index file', () => {
    mkdirSync(join(tmpDir, 'empty-dir'));
    const result = resolver.resolve('./empty-dir', join(tmpDir, 'foo.ts'));
    expect(result.kind).toBe('unresolved');
  });

  it('returns unresolved for non-existent file', () => {
    const result = resolver.resolve('./nonexistent', join(tmpDir, 'foo.ts'));
    expect(result).toEqual({
      kind: 'unresolved',
      specifier: './nonexistent',
    });
  });
});
