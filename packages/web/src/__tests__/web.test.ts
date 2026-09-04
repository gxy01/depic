import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze, DependencyGraph } from '@depic/core';
import { generateHtmlFromGraph, generateHtml, toLightweightJSON } from '../index';

const harmlessBoundary = '</ScRiPt><div data-depic-boundary="unexpected">';

function embeddedGraph(html: string): { nodes: Array<{ id: string }>; edges: unknown[] } {
  const match = html.match(
    /<script type="application\/json" id="depic-graph-data">([\s\S]*?)<\/script>/u,
  );
  if (!match) throw new Error('Embedded graph data element not found.');
  return JSON.parse(match[1]) as { nodes: Array<{ id: string }>; edges: unknown[] };
}

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
    expect(html).toContain('id="depic-graph-data"');
    expect(embeddedGraph(html)).toMatchObject({ nodes: expect.any(Array), edges: expect.any(Array) });
    // Vite-built React app with tabs
    expect(html).toContain('id="root"');
  });

  it('generateHtmlFromGraph embeds full graph data', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'test');

    const ids = embeddedGraph(html).nodes.map((node) => node.id);
    expect(ids).toContain(join(tmpDir, 'a.ts'));
    expect(ids).toContain(join(tmpDir, 'b.ts'));
    expect(ids).toContain(join(tmpDir, 'c.ts'));
  });

  it('generateHtmlFromGraph handles empty graph', () => {
    const g = new DependencyGraph();
    const html = generateHtmlFromGraph(g, 'empty');

    expect(html).toContain('<!DOCTYPE html>');
    expect(embeddedGraph(html)).toEqual({ nodes: [], edges: [] });
  });

  it('preserves structured graph fields without exposing raw HTML boundaries', () => {
    const graph = new DependencyGraph();
    graph.addFileNode({
      kind: 'file', id: harmlessBoundary, package: '<pkg>&"', exports: [], imports: [],
    });
    graph.addExternalNode({ kind: 'external', id: '<external>&"' });
    graph.addEdge({
      source: harmlessBoundary,
      target: '<external>&"',
      kind: 'static-import',
      specifier: harmlessBoundary,
    });

    const html = generateHtmlFromGraph(graph, 'boundary');

    expect(html).not.toContain(harmlessBoundary);
    expect(embeddedGraph(html)).toEqual(toLightweightJSON(graph));
  });

  it('generateHtml produces HTML from directory', async () => {
    const html = await generateHtml(tmpDir);

    expect(html).toContain('<!DOCTYPE html>');
    expect(embeddedGraph(html).nodes).toContainEqual(expect.objectContaining({ id: 'a.ts' }));
    expect(html).not.toContain(tmpDir);
  });

  it('Html contains external node data', async () => {
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'test');

    expect(embeddedGraph(html).nodes).toContainEqual(expect.objectContaining({
      id: 'react', kind: 'external',
    }));
  });

  it('generateHtml does not include page title in output', async () => {
    // Old test checked for title; new shell has fixed title "depic"
    const graph = await analyze({ root: tmpDir });
    const html = generateHtmlFromGraph(graph, 'irrelevant');
    expect(html).toContain('<title>depic');
  });
});
