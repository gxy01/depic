import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAnalyze, runCycles, runDependents, runStats, runWeb } from '../index';

describe('CLI commands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-cli-'));
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('analyze outputs valid JSON', async () => {
    const output = await runAnalyze(tmpDir);

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('edges');
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.edges.length).toBe(1);
  });

  it('analyze --dot outputs DOT format', async () => {
    const output = await runAnalyze(tmpDir, true);

    expect(output).toContain('digraph deps {');
    expect(output).toContain('->');
  });

  it('cycles reports no cycles for acyclic project', async () => {
    const output = await runCycles(tmpDir);

    expect(output).toBe('No circular dependencies found.');
  });

  it('cycles detects circular dependency', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './a';`);

    const output = await runCycles(tmpDir);

    expect(output).not.toBe('No circular dependencies found.');
    expect(output).toContain('→');
  });

  it('dependents shows files that import the target', async () => {
    const output = await runDependents(join(tmpDir, 'b.ts'), tmpDir);

    expect(output).toContain('a.ts');
    expect(output).toContain('static-import');
  });

  it('dependents reports none when no dependents', async () => {
    const output = await runDependents(join(tmpDir, 'a.ts'), tmpDir);

    expect(output).toContain('No files depend on');
  });

  it('stats outputs valid JSON with expected keys', async () => {
    const output = await runStats(tmpDir);

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('fileCount');
    expect(parsed).toHaveProperty('edgeCount');
    expect(parsed).toHaveProperty('externalCount');
    expect(parsed.fileCount).toBe(2);
    expect(parsed.edgeCount).toBe(1);
  });

  it('web generates HTML file', async () => {
    const outFile = join(tmpDir, 'deps.html');
    const output = await runWeb(tmpDir, outFile);

    expect(output).toContain('Written to');
    // File should exist and contain HTML
    const { readFileSync } = require('node:fs');
    const content = readFileSync(outFile, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('vis-network');
  });
});
