export { parseFile } from './parser/index.js';
export type {
  SourceLocation,
  ImportedSymbol,
  RawImport,
  RawExport,
  ParsedFile,
} from './parser/index.js';

export { Resolver } from './resolver/index.js';
export type {
  ResolvedTarget,
  ResolveOptions,
  WorkspaceConfig,
} from './resolver/types.js';

export { analyze } from './analyze.js';
export { DependencyGraph } from './graph/index.js';
export type { AnalyzeOptions } from './types.js';
export type {
  FileNode,
  ExternalNode,
  SymbolNode,
  GraphNode,
  Edge,
  ExportInfo,
  ImportInfo,
  GraphStats,
  DependencyGraphJSON,
} from './graph/types.js';

