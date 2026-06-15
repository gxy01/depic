import { describe, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '../analyze';

const RUN = process.env.RUN_BENCH === '1';
const FIXTURE_DIR = process.env.BENCH_FIXTURE ?? join(tmpdir(), 'depic-bench-nextjs');
const NEXTJS_REPO = 'https://github.com/vercel/next.js.git';

/**
 * 下载 benchmark fixture（如已存在则跳过）。
 */
async function ensureFixture(): Promise<string> {
  if (!existsSync(FIXTURE_DIR)) {
    console.log(`  Cloning next.js (depth=1) to ${FIXTURE_DIR} …`);
    execSync(`git clone --depth=1 ${NEXTJS_REPO} ${FIXTURE_DIR}`, {
      stdio: 'pipe',
      timeout: 120_000,
    });
  } else {
    console.log(`  Using cached fixture: ${FIXTURE_DIR}`);
  }
  return FIXTURE_DIR;
}

describe('benchmark', () => {
  (RUN ? it : it.skip)(
    'analyze next.js — full project with profiling',
    { timeout: 300_000 },
    async ({ expect }) => {
      const root = await ensureFixture();

      // Warm-up: 首次解析（无缓存）
      console.log(`\n  Phase          │   Time   │  Count`);
      console.log(`  ───────────────┼──────────┼───────`);
      const graph = await analyze({ root });

      const stats = graph.stats();
      console.log(`  ───────────────┼──────────┼───────`);
      console.log(
        `  Total          │  (warm)  │  ${stats.fileCount} files, ${stats.edgeCount} edges, ${stats.externalCount} externals`,
      );

      // 第二次：测量稳态（OS page cache 热）
      const t0 = performance.now();
      const graph2 = await analyze({ root });
      const elapsed = performance.now() - t0;

      console.log(`  Total (2nd)    │  ${elapsed.toFixed(0).padStart(6)}ms │  ${stats.fileCount} files`);
      console.log('');

      // 基本健康检查
      expect(stats.fileCount).toBeGreaterThan(1000);
      expect(stats.edgeCount).toBeGreaterThan(1000);
      expect(stats.externalCount).toBeGreaterThan(10);
      expect(elapsed).toBeLessThan(30_000); // Next.js 应该在 30s 以内
    },
  );
});
