import type { SourceLocation, ImportedSymbol } from '../parser';

/** 项目内文件节点 */
export interface FileNode {
  kind: 'file';
  id: string;
  exports: ExportInfo[];
  imports: ImportInfo[];
}

/** 外部依赖节点 */
export interface ExternalNode {
  kind: 'external';
  id: string;
}

/** 符号节点 */
export interface SymbolNode {
  kind: 'symbol';
  id: string;
  file: string;
  name: string;
}

export type GraphNode = FileNode | ExternalNode | SymbolNode;

/** 依赖边 */
export interface Edge {
  source: string;
  target: string;
  kind: 'static-import' | 'dynamic-import' | 'require' | 're-export' | 'css-import' | 'asset-import';
  specifier: string;
  symbols?: ImportedSymbol[];
  loc?: SourceLocation;
}

/** 导出信息（保持与 spec 一致） */
export interface ExportInfo {
  name: string;
  kind: 'named' | 'default' | 'all' | 'ts-namespace';
  reExportFrom?: string;
  isTypeOnly: boolean;
  loc: SourceLocation;
}

/** 导入信息（保持与 spec 一致） */
export interface ImportInfo {
  specifier: string;
  symbols: ImportedSymbol[];
  kind: 'static-import' | 'dynamic-import' | 'require' | 'css-import' | 'asset-import';
  isTypeOnly: boolean;
  resolvedFile?: string;
  resolvedExternal?: string;
  loc: SourceLocation;
}

/** Graph 统计信息 */
export interface GraphStats {
  fileCount: number;
  externalCount: number;
  edgeCount: number;
  internalEdgeCount: number;
  externalEdgeCount: number;
}

/** 可序列化的 Graph JSON */
export interface DependencyGraphJSON {
  nodes: GraphNode[];
  edges: Edge[];
}
