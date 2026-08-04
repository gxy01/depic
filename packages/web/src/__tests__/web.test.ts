import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze, DependencyGraph } from '@depic/core';
import { generateHtmlFromGraph, generateHtml } from '../index';

describe('Web visualization', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-web-'));
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');
    writeFileSync(join(tmpDir, 'c.ts'), `import React from 'react';`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generateHtmlFromGraph produces valid HTML', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'test');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('__GRAPH__');
    expect(html).toContain('"nodes"');
    expect(html).toContain('"edges"');
    // Vite-built React app with tabs
    expect(html).toContain('id="root"');
  });

  it('generateHtmlFromGraph embeds full graph data', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'test');

    expect(html).toContain(join(tmpDir, 'a.ts'));
    expect(html).toContain(join(tmpDir, 'b.ts'));
    expect(html).toContain(join(tmpDir, 'c.ts'));
  });

  it('generateHtmlFromGraph handles empty graph', () => {
    const g = new DependencyGraph();
    const html = generateHtmlFromGraph(g, 'empty');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('"nodes":[]');
    expect(html).toContain('"edges":[]');
  });

  it('generateHtml produces HTML from directory', async () => {
    const html = await generateHtml(tmpDir);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('__GRAPH__');
    expect(html).toContain('"id":"a.ts"');
    expect(html).not.toContain(tmpDir);
  });

  it('Html contains external node data', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'test');

    expect(html).toContain('react');
    expect(html).toContain('"kind":"external"');
  });

  it('generateHtml does not include page title in output', async () => {
    // Old test checked for title; new shell has fixed title "depic"
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'irrelevant');
    expect(html).toContain('<title>depic');
  });
});
