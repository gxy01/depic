import { describe, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '../analyze';

function generateProject(dir: string, fileCount: number): void {
  for (let i = 0; i < fileCount; i++) {
    const lines: string[] = [];
    if (i + 1 < fileCount) {
      lines.push(`import { x${i + 1} } from './a${i + 1}';`);
    }
    if (i % 10 === 0) {
      lines.push(`import React from 'react';`);
    }
    lines.push(`export const x${i} = ${i};`);
    writeFileSync(join(dir, `a${i}.ts`), lines.join('\n'));
  }
}

const RUN = process.env.RUN_BENCH === '1';

describe('benchmark', () => {
  (RUN ? it : it.skip)('analyze performance: 100 files', async ({ expect }) => {
    const dir = mkdtempSync(join(tmpdir(), 'depic-bench-'));
    generateProject(dir, 100);

    const start = performance.now();
    const graph = await analyze({ root: dir });
    const elapsed = performance.now() - start;

    console.log(`  100 files: ${elapsed.toFixed(0)}ms (${graph.files().length} files, ${graph.edges().length} edges)`);
    expect(elapsed).toBeLessThan(2000);
    rmSync(dir, { recursive: true, force: true });
  });

  (RUN ? it : it.skip)('analyze performance: 500 files', async ({ expect }) => {
    const dir = mkdtempSync(join(tmpdir(), 'depic-bench-'));
    generateProject(dir, 500);

    const start = performance.now();
    const graph = await analyze({ root: dir });
    const elapsed = performance.now() - start;

    console.log(`  500 files: ${elapsed.toFixed(0)}ms (${graph.files().length} files, ${graph.edges().length} edges)`);
    expect(elapsed).toBeLessThan(5000);
    rmSync(dir, { recursive: true, force: true });
  });

  (RUN ? it : it.skip)('analyze performance: 1000 files', async ({ expect }) => {
    const dir = mkdtempSync(join(tmpdir(), 'depic-bench-'));
    generateProject(dir, 1000);

    const start = performance.now();
    const graph = await analyze({ root: dir });
    const elapsed = performance.now() - start;

    console.log(`  1000 files: ${elapsed.toFixed(0)}ms (${graph.files().length} files, ${graph.edges().length} edges)`);
    expect(elapsed).toBeLessThan(10000);
    rmSync(dir, { recursive: true, force: true });
  });
});
