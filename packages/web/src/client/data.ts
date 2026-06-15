declare global {
  interface Window { __GRAPH__?: DependencyGraphJSON }
}

export interface GraphNode {
  kind: 'file' | 'external' | 'symbol';
  id: string;
  package?: string;
  exports?: ExportInfo[];
  imports?: ImportInfo[];
}

export interface Edge {
  source: string;
  target: string;
  kind: string;
  specifier: string;
  symbols?: ImportedSymbol[];
  loc?: { line: number; column: number };
}

export interface ImportedSymbol {
  imported: string;
  local: string;
  isTypeOnly?: boolean;
}

export interface ExportInfo {
  name: string;
  kind: string;
  reExportFrom?: string;
  isTypeOnly: boolean;
  loc: { line: number; column: number };
}

export interface ImportInfo {
  specifier: string;
  symbols: ImportedSymbol[];
  kind: string;
  isTypeOnly: boolean;
  resolvedFile?: string;
  resolvedExternal?: string;
  loc: { line: number; column: number };
}

export interface DependencyGraphJSON {
  nodes: GraphNode[];
  edges: Edge[];
}

export function getData(): DependencyGraphJSON {
  return window.__GRAPH__ ?? { nodes: [], edges: [] };
}

/** 检测环（client-side） */
export function detectCycles(data: DependencyGraphJSON): Set<string> {
  const cycleSet = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const n of data.nodes) { if (n.kind === 'file') adj.set(n.id, []); }
  for (const e of data.edges) {
    if (adj.has(e.source) && adj.has(e.target)) adj.get(e.source)!.push(e.target);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const k of adj.keys()) color.set(k, WHITE);
  function dfs(u: string) {
    color.set(u, GRAY);
    for (const v of (adj.get(u) || [])) {
      if ((color.get(v) ?? WHITE) === GRAY) { cycleSet.add(u); cycleSet.add(v); }
      else if (color.get(v) === WHITE) dfs(v);
    }
    color.set(u, BLACK);
  }
  for (const k of adj.keys()) { if (color.get(k) === WHITE) dfs(k); }
  return cycleSet;
}

/** 提取所有 package 名 */
export function getPackageNames(data: DependencyGraphJSON): string[] {
  return [...new Set(data.nodes.filter(n => n.package).map(n => n.package!))].sort();
}
