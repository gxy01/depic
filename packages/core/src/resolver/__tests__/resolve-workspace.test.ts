import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Resolver } from '../index';

describe('resolve workspace & external', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-workspace-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves workspace package as internal', () => {
    // Create workspace package
    const pkgDir = join(tmpDir, 'packages', 'ui');
    mkdirSync(pkgDir, { recursive: true });
    mkdirSync(join(pkgDir, 'src'));
    writeFileSync(join(pkgDir, 'src', 'index.ts'), 'export const Button = 1;');
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@myapp/ui', main: 'src/index.ts' }),
    );

    const resolver = new Resolver({
      root: tmpDir,
      workspace: { packagePatterns: ['packages/*'] },
    });
    const result = resolver.resolve('@myapp/ui', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'internal',
      name: '@myapp/ui',
      path: join(pkgDir, 'src/index.ts'),
    });
  });

  it('resolves bare specifier as external', () => {
    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('react', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'external',
      name: 'react',
    });
  });

  it('resolves scoped bare specifier as external', () => {
    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('@scope/pkg', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'external',
      name: '@scope/pkg',
    });
  });

  it('resolves sub-path external import', () => {
    const resolver = new Resolver({ root: tmpDir });
    const result = resolver.resolve('lodash/debounce', join(tmpDir, 'src/index.ts'));

    expect(result).toEqual({
      kind: 'external',
      name: 'lodash/debounce',
    });
  });

  it('workspace package uses exports field', () => {
    const pkgDir = join(tmpDir, 'packages', 'lib');
    mkdirSync(pkgDir, { recursive: true });
    mkdirSync(join(pkgDir, 'dist'));
    writeFileSync(join(pkgDir, 'dist', 'index.js'), '');
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@myapp/lib',
        exports: { '.': { import: './dist/index.js' } },
      }),
    );

    const resolver = new Resolver({
      root: tmpDir,
      workspace: { packagePatterns: ['packages/*'] },
    });
    const result = resolver.resolve('@myapp/lib', join(tmpDir, 'src/index.ts'));

    expect(result.kind).toBe('internal');
    expect(result.name).toBe('@myapp/lib');
  });

  it('workspace package uses main field', () => {
    const pkgDir = join(tmpDir, 'packages', 'lib');
    mkdirSync(join(pkgDir, 'src'), { recursive: true });
    writeFileSync(join(pkgDir, 'src', 'index.ts'), 'export const x = 1;');
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'mylib', main: 'src/index.ts' }),
    );

    const resolver = new Resolver({
      root: tmpDir,
      workspace: { packagePatterns: ['packages/*'] },
    });
    const result = resolver.resolve('mylib', join(tmpDir, 'src/index.ts'));
    expect(result.kind).toBe('internal');
    expect(result).toMatchObject({ name: 'mylib' });
  });

  it('workspace package uses string exports', () => {
    const pkgDir = join(tmpDir, 'packages', 'strlib');
    mkdirSync(join(pkgDir, 'dist'), { recursive: true });
    writeFileSync(join(pkgDir, 'dist', 'index.js'), '');
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'strlib', exports: './dist/index.js' }),
    );

    const resolver = new Resolver({
      root: tmpDir,
      workspace: { packagePatterns: ['packages/*'] },
    });
    const result = resolver.resolve('strlib', join(tmpDir, 'src/index.ts'));
    expect(result.kind).toBe('internal');
  });

  it('respects workspace.root override', () => {
    const wsRoot = join(tmpDir, 'custom-ws');
    const pkgDir = join(wsRoot, 'packages', 'custom-pkg');
    mkdirSync(pkgDir, { recursive: true });
    mkdirSync(join(pkgDir, 'src'));
    writeFileSync(join(pkgDir, 'src', 'index.ts'), 'export const x = 1;');
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@custom/pkg', main: 'src/index.ts' }),
    );

    const resolver = new Resolver({
      root: tmpDir,
      workspace: { root: 'custom-ws', packagePatterns: ['packages/*'] },
    });
    const result = resolver.resolve('@custom/pkg', join(tmpDir, 'src/index.ts'));
    expect(result.kind).toBe('internal');
  });

  it('workspace scan skips dirs without package.json', () => {
    mkdirSync(join(tmpDir, 'packages', 'empty'), { recursive: true });

    const resolver = new Resolver({
      root: tmpDir,
      workspace: { packagePatterns: ['packages/*'] },
    });

    // Should not throw; empty dir is skipped
    expect(resolver.resolve('react', join(tmpDir, 'src/index.ts')).kind).toBe('external');
  });
});
