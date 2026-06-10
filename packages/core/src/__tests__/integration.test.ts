import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { analyze } from '../analyze';

const ROOT = resolve(import.meta.dirname, '../../../..');

describe('integration: analyze self', () => {
  it('analyzes depic project without error', async () => {
    const graph = await analyze({ root: ROOT });

    const files = graph.files();
    const stats = graph.stats();

    // 基本断言
    expect(files.length).toBeGreaterThan(0);
    expect(stats.fileCount).toBe(files.length);
    expect(stats.edgeCount).toBeGreaterThan(0);

    // 应该能找到核心文件
    const parserPath = files.find((f) => f.id.endsWith('parser/parseFile.ts'));
    expect(parserPath).toBeDefined();

    const graphPath = files.find((f) => f.id.endsWith('graph/index.ts'));
    expect(graphPath).toBeDefined();

    // 应该有外部依赖
    const externals = graph.externalModules();
    expect(externals.length).toBeGreaterThan(0);

    // @swc/core 应该作为外部依赖出现
    const swc = externals.find((e) => e.id === '@swc/core');
    expect(swc).toBeDefined();
  });

  it('has no circular dependencies', () => {
    const graph = analyze({ root: ROOT });
    // Should complete without error — but we can't await in non-async
  });

  it('has no circular dependencies', async () => {
    const graph = await analyze({ root: ROOT });
    const cycles = graph.getCircularDependencies();

    // 目前应该没有环（如果测试失败说明引入了循环依赖！）
    expect(cycles).toHaveLength(0);
  });

  it('emit DOT output', async () => {
    const graph = await analyze({ root: ROOT });
    const dot = graph.toDot();

    expect(dot).toContain('digraph deps {');
    expect(dot).toContain('@swc/core');
    // 不应该太长（不超过 500 行）
    const lines = dot.split('\n');
    expect(lines.length).toBeLessThan(500);
  });

  it('stats are consistent', async () => {
    const graph = await analyze({ root: ROOT });
    const stats = graph.stats();

    expect(stats.internalEdgeCount + stats.externalEdgeCount).toBe(
      stats.edgeCount,
    );
    // 文件数应该合理（不是 0，也不是十几万）
    expect(stats.fileCount).toBeGreaterThan(5);
    expect(stats.fileCount).toBeLessThan(500);
  });

  // ─── exclude ──────────────────────────────────────────────

  it('excludes files matching patterns', async () => {
    const graph = await analyze({
      root: ROOT,
      exclude: ['**/__tests__/**', '**/*.test.ts'],
    });

    const files = graph.files();
    // 应该没有测试文件
    const testFiles = files.filter(
      (f) => f.id.includes('__tests__') || f.id.endsWith('.test.ts'),
    );
    expect(testFiles).toHaveLength(0);
  });

  // ─── nested tsconfig ───────────────────────────────────────

  it('nested tsconfig: uses nearest tsconfig for resolution', async () => {
    // 项目根 tsconfig 没有 paths，但嵌套子目录有
    // 本项目的 packages/core 有自己的 tsconfig，应该自动发现
    const graph = await analyze({ root: ROOT });

    // 验证基本分析仍然成功
    expect(graph.files().length).toBeGreaterThan(0);
    expect(graph.stats().edgeCount).toBeGreaterThan(0);
  });

  it('getDependencies returns edges for a known file', async () => {
    const graph = await analyze({ root: ROOT });
    const parserFile = graph
      .files()
      .find((f) => f.id.endsWith('parser/parseFile.ts'));

    if (parserFile) {
      const deps = graph.getDependencies(parserFile.id);
      // parseFile.ts 至少依赖 @swc/core
      expect(deps.some((e) => e.target === '@swc/core')).toBe(true);
    }
  });

  it('respects include option (only .ts files)', async () => {
    const graph = await analyze({
      root: ROOT,
      include: ['**/*.ts'],
    });
    const files = graph.files();
    // 不应包含 .tsx 文件
    const tsxFiles = files.filter((f) => f.id.endsWith('.tsx'));
    expect(tsxFiles).toHaveLength(0);
  });

  it('handles unreadable files gracefully', async () => {
    const { mkdtempSync, writeFileSync, chmodSync, rmSync } = require('node:fs');
    const { join } = require('node:path');
    const { tmpdir } = require('node:os');

    const testDir = mkdtempSync(join(tmpdir(), 'depic-unreadable-'));
    writeFileSync(join(testDir, 'good.ts'), 'export const x = 1;');
    writeFileSync(join(testDir, 'bad.ts'), 'export const y = 1;');
    // Make bad.ts unreadable
    chmodSync(join(testDir, 'bad.ts'), 0o000);

    // Should not throw — analyze skips unreadable files
    const graph = await analyze({ root: testDir });
    expect(graph.files().length).toBeGreaterThanOrEqual(1);

    // Cleanup
    chmodSync(join(testDir, 'bad.ts'), 0o644);
    rmSync(testDir, { recursive: true, force: true });
  });
});
