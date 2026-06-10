import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '../../analyze';
import { DependencyGraph } from '../../graph/index';

describe('DependencyGraph', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'depic-graph-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('single file, no imports → 1 file node, 0 edges', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'const x = 1;');

    const graph = await analyze({ root: tmpDir });

    expect(graph.files()).toHaveLength(1);
    expect(graph.files()[0].id).toBe(join(tmpDir, 'a.ts'));
    expect(graph.edges()).toHaveLength(0);
    expect(graph.externalModules()).toHaveLength(0);
  });

  it('two files, one import → 2 file nodes, 1 edge', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir });

    expect(graph.files()).toHaveLength(2);
    expect(graph.edges()).toHaveLength(1);

    const edge = graph.edges()[0];
    expect(edge.source).toBe(join(tmpDir, 'a.ts'));
    expect(edge.target).toBe(join(tmpDir, 'b.ts'));
    expect(edge.kind).toBe('static-import');
    expect(edge.specifier).toBe('./b');
  });

  it('import from external package → external node, edge', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import React from 'react';`);

    const graph = await analyze({ root: tmpDir });

    expect(graph.externalModules()).toHaveLength(1);
    expect(graph.externalModules()[0].id).toBe('react');
    expect(graph.edges()).toHaveLength(1);
    expect(graph.edges()[0].target).toBe('react');
  });

  // ─── getDependencyChain ───────────────────────────────────

  it('getDependencyChain: direct edge', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir });
    const chains = graph.getDependencyChain(
      join(tmpDir, 'a.ts'),
      join(tmpDir, 'b.ts'),
    );

    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual([join(tmpDir, 'a.ts'), join(tmpDir, 'b.ts')]);
  });

  it('getDependencyChain: transitive path', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './c';`);
    writeFileSync(join(tmpDir, 'c.ts'), 'export const y = 1;');

    const graph = await analyze({ root: tmpDir });
    const chains = graph.getDependencyChain(
      join(tmpDir, 'a.ts'),
      join(tmpDir, 'c.ts'),
    );

    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual([
      join(tmpDir, 'a.ts'),
      join(tmpDir, 'b.ts'),
      join(tmpDir, 'c.ts'),
    ]);
  });

  it('getDependencyChain: multiple paths', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b'; import { z } from './c';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './d';`);
    writeFileSync(join(tmpDir, 'c.ts'), `import { y } from './d';`);
    writeFileSync(join(tmpDir, 'd.ts'), 'export const y = 1;');

    const graph = await analyze({ root: tmpDir });
    const chains = graph.getDependencyChain(
      join(tmpDir, 'a.ts'),
      join(tmpDir, 'd.ts'),
    );

    expect(chains).toHaveLength(2);
  });

  it('getDependencyChain: no path returns empty', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'export const x = 1;');
    writeFileSync(join(tmpDir, 'b.ts'), 'export const y = 1;');

    const graph = await analyze({ root: tmpDir });
    const chains = graph.getDependencyChain(
      join(tmpDir, 'a.ts'),
      join(tmpDir, 'b.ts'),
    );

    expect(chains).toEqual([]);
  });

  // ─── getCircularDependencies ───────────────────────────────

  it('getCircularDependencies: no cycles', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir });
    expect(graph.getCircularDependencies()).toEqual([]);
  });

  it('getCircularDependencies: simple 2-node cycle', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './a';`);

    const graph = await analyze({ root: tmpDir });
    const cycles = graph.getCircularDependencies();

    expect(cycles).toHaveLength(1);
    // 环的起点和终点是同一个文件
    expect(cycles[0][0]).toBe(cycles[0][cycles[0].length - 1]);
  });

  it('getCircularDependencies: 3-node cycle', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './c';`);
    writeFileSync(join(tmpDir, 'c.ts'), `import { z } from './a';`);

    const graph = await analyze({ root: tmpDir });
    const cycles = graph.getCircularDependencies();

    expect(cycles).toHaveLength(1);
    expect(cycles[0].length).toBe(4); // a → b → c → a
  });

  // ─── hasCycle ──────────────────────────────────────────────

  it('hasCycle: file in cycle returns true', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './a';`);

    const graph = await analyze({ root: tmpDir });
    expect(graph.hasCycle(join(tmpDir, 'a.ts'))).toBe(true);
    expect(graph.hasCycle(join(tmpDir, 'b.ts'))).toBe(true);
  });

  it('hasCycle: file not in cycle returns false', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir });
    expect(graph.hasCycle(join(tmpDir, 'a.ts'))).toBe(false);
  });

  // ─── getTransitiveDependencies ─────────────────────────────

  it('getTransitiveDependencies: all reachable files', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './c'; import { z } from './d';`);
    writeFileSync(join(tmpDir, 'c.ts'), 'export const y = 1;');
    writeFileSync(join(tmpDir, 'd.ts'), 'export const z = 1;');

    const graph = await analyze({ root: tmpDir });
    const deps = graph.getTransitiveDependencies(join(tmpDir, 'a.ts'));

    expect(deps.size).toBe(3);
    expect(deps.has(join(tmpDir, 'b.ts'))).toBe(true);
    expect(deps.has(join(tmpDir, 'c.ts'))).toBe(true);
    expect(deps.has(join(tmpDir, 'd.ts'))).toBe(true);
  });

  it('getTransitiveDependencies: leaf file has none', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir });
    const deps = graph.getTransitiveDependencies(join(tmpDir, 'b.ts'));

    expect(deps.size).toBe(0);
  });

  // ─── resolvedFile / resolvedExternal ────────────────────────

  it('FileNode.imports has resolvedFile for internal imports', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir });
    const a = graph.getFileNode(join(tmpDir, 'a.ts'))!;

    expect(a.imports).toHaveLength(1);
    expect(a.imports[0].resolvedFile).toBe(join(tmpDir, 'b.ts'));
    expect(a.imports[0].resolvedExternal).toBeUndefined();
  });

  it('FileNode.imports has resolvedExternal for external imports', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import React from 'react';`);

    const graph = await analyze({ root: tmpDir });
    const a = graph.getFileNode(join(tmpDir, 'a.ts'))!;

    expect(a.imports).toHaveLength(1);
    expect(a.imports[0].resolvedExternal).toBe('react');
    expect(a.imports[0].resolvedFile).toBeUndefined();
  });

  // ─── symbolLevel ───────────────────────────────────────────

  it('symbolLevel: Edge has symbols populated', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir, symbolLevel: true });

    const edge = graph.edges()[0];
    expect(edge.symbols).toBeDefined();
    expect(edge.symbols).toHaveLength(1);
    expect(edge.symbols![0]).toMatchObject({
      imported: 'x',
      local: 'x',
    });
  });

  it('symbolLevel: creates SymbolNode', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir, symbolLevel: true });

    const symbolId = `${join(tmpDir, 'b.ts')}#x`;
    expect(graph.getSymbolNode(symbolId)).toBeDefined();
    expect(graph.getSymbolNode(symbolId)).toMatchObject({
      kind: 'symbol',
      id: symbolId,
      file: join(tmpDir, 'b.ts'),
      name: 'x',
    });
  });

  // ─── resolveSymbol ─────────────────────────────────────────

  it('resolveSymbol: traces re-export chain', async () => {
    // a.ts imports formatDate from b.ts
    // b.ts re-exports it from c.ts
    // c.ts defines formatDate
    writeFileSync(join(tmpDir, 'a.ts'), `import { formatDate } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `export { formatDate } from './c';`);
    writeFileSync(join(tmpDir, 'c.ts'), 'export const formatDate = () => {};');

    const graph = await analyze({ root: tmpDir });
    const chain = graph.resolveSymbol(join(tmpDir, 'a.ts'), 'formatDate');

    expect(chain).toBeDefined();
    expect(chain).toHaveLength(3);
    expect(chain![0]).toBe(join(tmpDir, 'a.ts'));
    expect(chain![chain!.length - 1]).toBe(join(tmpDir, 'c.ts'));
  });

  it('resolveSymbol: locally defined symbol returns single file', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'export const formatDate = () => {};');

    const graph = await analyze({ root: tmpDir });
    const chain = graph.resolveSymbol(join(tmpDir, 'a.ts'), 'formatDate');

    expect(chain).toEqual([join(tmpDir, 'a.ts')]);
  });

  it('resolveSymbol: traces through export *', async () => {
    // a.ts imports formatDate from b.ts
    // b.ts does export * from c.ts
    // c.ts defines formatDate
    writeFileSync(join(tmpDir, 'a.ts'), `import { formatDate } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `export * from './c';`);
    writeFileSync(join(tmpDir, 'c.ts'), 'export const formatDate = () => {};');

    const graph = await analyze({ root: tmpDir });
    const chain = graph.resolveSymbol(join(tmpDir, 'a.ts'), 'formatDate');

    expect(chain).toBeDefined();
    expect(chain![chain!.length - 1]).toBe(join(tmpDir, 'c.ts'));
  });

  it('resolveSymbol: returns undefined for unknown symbol', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'export const x = 1;');

    const graph = await analyze({ root: tmpDir });
    const chain = graph.resolveSymbol(join(tmpDir, 'a.ts'), 'nonexistent');

    expect(chain).toBeUndefined();
  });

  // ─── stats ─────────────────────────────────────────────────

  // ─── cycle edge cases ──────────────────────────────────────

  it('getCircularDependencies: detects self-loop', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './a';`);

    const graph = await analyze({ root: tmpDir });
    const cycles = graph.getCircularDependencies();
    expect(cycles.length).toBe(1);
  });

  it('getCircularDependencies: detects multiple independent cycles', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './a';`);
    writeFileSync(join(tmpDir, 'c.ts'), `import { z } from './d';`);
    writeFileSync(join(tmpDir, 'd.ts'), `import { w } from './c';`);

    const graph = await analyze({ root: tmpDir });
    const cycles = graph.getCircularDependencies();
    expect(cycles.length).toBe(2);
  });

  it('getCircularDependencies: cache invalidates on addEdge', () => {
    const g = new DependencyGraph();
    g.addFileNode({ kind: 'file', id: '/a.ts', exports: [], imports: [] });
    g.addFileNode({ kind: 'file', id: '/b.ts', exports: [], imports: [] });

    // No edges → no cycles
    expect(g.getCircularDependencies()).toHaveLength(0);

    // Add edge creating a cycle → cache should be invalidated
    g.addEdge({ source: '/a.ts', target: '/b.ts', kind: 'static-import', specifier: './b' });
    g.addEdge({ source: '/b.ts', target: '/a.ts', kind: 'static-import', specifier: './a' });

    const cycles = g.getCircularDependencies();
    expect(cycles.length).toBe(1);
  });

  it('getDependencyChain: handles cycle without infinite loop', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import { y } from './a';`);

    const graph = await analyze({ root: tmpDir });
    // a → b, but there's a cycle a→b→a
    // Asking for chain from a to b should return [a, b] without infinite loop
    const chains = graph.getDependencyChain(join(tmpDir, 'a.ts'), join(tmpDir, 'b.ts'));
    expect(chains.length).toBeGreaterThanOrEqual(1);
    expect(chains[0]).toEqual([join(tmpDir, 'a.ts'), join(tmpDir, 'b.ts')]);
  });

  // ─── empty graph ────────────────────────────────────────────

  it('empty graph: stats returns zeros', () => {
    const g = new DependencyGraph();
    const s = g.stats();
    expect(s.fileCount).toBe(0);
    expect(s.edgeCount).toBe(0);
    expect(s.externalCount).toBe(0);
  });

  it('empty graph: toJSON returns empty arrays', () => {
    const g = new DependencyGraph();
    const json = g.toJSON();
    expect(json.nodes).toEqual([]);
    expect(json.edges).toEqual([]);
  });

  it('empty graph: toDot returns minimal digraph', () => {
    const g = new DependencyGraph();
    const dot = g.toDot();
    expect(dot).toBe('digraph deps {\n}');
  });

  it('empty graph: getDependencyChain returns empty', () => {
    const g = new DependencyGraph();
    expect(g.getDependencyChain('/a.ts', '/b.ts')).toEqual([]);
  });

  it('empty graph: getCircularDependencies returns empty', () => {
    const g = new DependencyGraph();
    expect(g.getCircularDependencies()).toEqual([]);
  });

  it('empty graph: getTransitiveDependencies returns empty', () => {
    const g = new DependencyGraph();
    expect(g.getTransitiveDependencies('/a.ts').size).toBe(0);
  });

  it('empty graph: getFileNode returns undefined', () => {
    const g = new DependencyGraph();
    expect(g.getFileNode('/nonexistent')).toBeUndefined();
  });

  it('empty graph: getExternalNode returns undefined', () => {
    const g = new DependencyGraph();
    expect(g.getExternalNode('react')).toBeUndefined();
  });

  it('stats returns correct counts', async () => {
    writeFileSync(join(tmpDir, 'a.ts'), `import { x } from './b';`);
    writeFileSync(join(tmpDir, 'b.ts'), `import React from 'react';`);

    const graph = await analyze({ root: tmpDir });

    const s = graph.stats();
    expect(s.fileCount).toBe(2);
    expect(s.externalCount).toBe(1);
    expect(s.edgeCount).toBe(2);
    expect(s.internalEdgeCount).toBe(1);
    expect(s.externalEdgeCount).toBe(1);
  });
});
