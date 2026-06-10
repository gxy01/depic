export { parseFile } from './parser';
export type {
  SourceLocation,
  ImportedSymbol,
  RawImport,
  RawExport,
  ParsedFile,
} from './parser';

export { Resolver } from './resolver';
export type {
  ResolvedTarget,
  ResolveOptions,
  WorkspaceConfig,
} from './resolver/types';

export { analyze } from './analyze';
export { DependencyGraph } from './graph';
export type { AnalyzeOptions } from './types';
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
} from './graph/types';

