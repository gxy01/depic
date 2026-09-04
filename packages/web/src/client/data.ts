export interface LightNode {
  kind: 'file' | 'external';
  id: string;
  package?: string;
}

export interface LightEdge {
  source: string;
  target: string;
  kind: string;
  specifier: string;
}

export interface LightweightGraph {
  nodes: LightNode[];
  edges: LightEdge[];
}

export interface FileDetails {
  id: string;
  package?: string;
  exports: ExportInfo[];
  imports: ImportInfo[];
  dependents: DepInfo[];
  inCycle: boolean;
}

export interface DepInfo { source: string; kind: string; specifier: string; }

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

export interface ImportedSymbol {
  imported: string;
  local: string;
  isTypeOnly?: boolean;
}

export function getData(): LightweightGraph {
  const element = document.getElementById('depic-graph-data');
  if (element?.textContent) {
    try {
      return JSON.parse(element.textContent) as LightweightGraph;
    } catch {
      // Development shells may not have an injected payload yet.
    }
  }
  return { nodes: [], edges: [] };
}

/** 检测环 */
export function detectCycles(data: LightweightGraph): Set<string> {
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
export function getPackageNames(data: LightweightGraph): string[] {
  return [...new Set(data.nodes.filter(n => n.package).map(n => n.package!))].sort();
}

/** 通过 VS Code postMessage 获取文件详情 */
const vscodeApi = typeof acquireVsCodeApi !== 'undefined'
  ? acquireVsCodeApi<{ type: string; fileId?: string; data?: FileDetails }>()
  : null;

const pendingRequests = new Map<string, (d: FileDetails | null) => void>();

if (vscodeApi) {
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'fileDetails' && msg.fileId) {
      const resolve = pendingRequests.get(msg.fileId);
      if (resolve) {
        pendingRequests.delete(msg.fileId);
        resolve(msg.data ?? null);
      }
    }
  });
}

export function fetchFileDetails(fileId: string): Promise<FileDetails | null> {
  // If no vscode API (browser mode), return null
  if (!vscodeApi) return Promise.resolve(null);

  return new Promise((resolve) => {
    pendingRequests.set(fileId, resolve);
    vscodeApi.postMessage({ type: 'getFileDetails', fileId });
    // Timeout after 5s
    setTimeout(() => {
      if (pendingRequests.has(fileId)) {
        pendingRequests.delete(fileId);
        resolve(null);
      }
    }, 5000);
  });
}
