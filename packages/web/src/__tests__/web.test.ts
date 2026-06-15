import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '@depic/core';
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
    expect(html).toContain('<title>test — Dependency Graph</title>');
    // Uses sigma.js + graphology for WebGL rendering
    expect(html).toContain('sigma@');
    expect(html).toContain('graphology');
    // Should contain graph data
    expect(html).toContain('"nodes"');
    expect(html).toContain('"edges"');
    // Should have three view tabs
    expect(html).toContain('data-view="graph"');
    expect(html).toContain('data-view="tree"');
    expect(html).toContain('data-view="file"');
    // Should have interactive features
    expect(html).toContain('switchView');
    expect(html).toContain('showFileView');
    expect(html).toContain('buildTree');
  });

  it('generateHtmlFromGraph escapes HTML in title', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, '<script>alert(1)</script>');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('generateHtml produces HTML from directory', async () => {
    const html = await generateHtml(tmpDir);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('sigma@');
    expect(html).toContain('graphology');
  });

  it('HTML contains all file nodes', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'test');

    // Check that each file appears in the embedded JSON
    expect(html).toContain(join(tmpDir, 'a.ts'));
    expect(html).toContain(join(tmpDir, 'b.ts'));
    expect(html).toContain(join(tmpDir, 'c.ts'));
  });

  it('HTML contains external nodes', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'test');

    expect(html).toContain('react');
    expect(html).toContain('"kind":"external"');
  });

  it('generateHtmlFromGraph with empty graph produces valid HTML', async () => {
    const { DependencyGraph } = await import('@depic/core');
    const g = new DependencyGraph();
    const html = generateHtmlFromGraph(g, 'empty');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('sigma@');
    expect(html).toContain('graphology');
    // Should contain empty node/edge arrays
    expect(html).toContain('"nodes":[]');
    expect(html).toContain('"edges":[]');
  });
});
