import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '@depic/core';
import { generateHtmlFromGraph } from '@depic/web';

describe('VS Code extension logic', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-vscode-'));
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');
    writeFileSync(join(tmpDir, 'c.ts'), `import React from 'react';`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('analyze works for vscode workspace scenario', async () => {
    const graph = await analyze({ root: tmpDir });

    expect(graph.files().length).toBe(3);
    expect(graph.edges().length).toBeGreaterThan(0);
  });

  it('cycles detection returns results', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './a';`); // cycle!

    const graph = await analyze({ root: tmpDir });
    const cycles = graph.getCircularDependencies();

    expect(cycles.length).toBe(1); // one cycle found
  });

  it('dependents analysis works', async () => {
    const graph = await analyze({ root: tmpDir });
    const dependents = graph.getDependents(join(tmpDir, 'b.ts'));

    expect(dependents.length).toBe(1);
    expect(dependents[0].source).toBe(join(tmpDir, 'a.ts'));
  });

  it('stats are computable', async () => {
    const graph = await analyze({ root: tmpDir });
    const stats = graph.stats();

    expect(stats.fileCount).toBe(3);
    expect(stats.edgeCount).toBe(2); // a→b, c→react
    expect(stats.externalCount).toBe(1);
  });

  it('generates webview HTML', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'Workspace');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('vis-network');
    expect(html).toContain('Workspace — Dependency Graph');
  });
});
