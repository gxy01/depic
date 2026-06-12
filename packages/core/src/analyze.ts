import { readFileSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from './parser/index.js';
import { Resolver } from './resolver/index.js';
import { DependencyGraph } from './graph/index.js';
import type { AnalyzeOptions } from './types.js';
import type { FileNode, ImportInfo } from './graph/types.js';

const DEFAULT_INCLUDE = ['**/*.{ts,tsx,js,jsx}'];

/**
 * 分析项目依赖图。入口函数。
 */
export async function analyze(options: AnalyzeOptions): Promise<DependencyGraph> {
  const root = options.root;
  const graph = new DependencyGraph();

  // 1. 文件发现
  let discovered = discoverFiles(root, options.include ?? DEFAULT_INCLUDE);

  // 1.5 排除文件
  if (options.exclude && options.exclude.length > 0) {
    discovered = discovered.filter(
      (f) => !options.exclude!.some((pattern) => matchGlob(f, pattern)),
    );
  }

  // 2. 创建 Resolver
  const resolver = new Resolver({
    root,
    tsconfigPath: options.tsconfigPath,
    extensions: options.extensions,
    workspace: options.workspace,
  });

  // 3. 解析每个文件 → FileNode（不含 resolved info）
  for (const filePath of discovered) {
    addFileToGraph(filePath, graph);
  }

  // 4. 解析 import → Edge，并收集 resolved info
  const resolvedImports = new Map<string, ImportInfo[]>();

  for (const fileNode of graph.files()) {
    const source = readFileSync(fileNode.id, 'utf-8');
    const parsed = parseFile(source, fileNode.id);
    const resolvedInfos: ImportInfo[] = [];

    for (const imp of parsed.imports) {
      const resolved = resolver.resolve(imp.specifier, fileNode.id);

      if (resolved.kind === 'file' || resolved.kind === 'internal') {
        if (!graph.getFileNode(resolved.path)) {
          addFileToGraph(resolved.path, graph);
        }
        graph.addEdge({
          source: fileNode.id,
          target: resolved.path,
          kind: imp.kind,
          specifier: imp.specifier,
          symbols: options.symbolLevel ? imp.symbols : undefined,
          loc: imp.loc,
        });
        resolvedInfos.push({
          ...imp,
          resolvedFile: resolved.path,
        });
      } else if (resolved.kind === 'external') {
        if (!graph.getExternalNode(resolved.name)) {
          graph.addExternalNode({ kind: 'external', id: resolved.name });
        }
        graph.addEdge({
          source: fileNode.id,
          target: resolved.name,
          kind: imp.kind,
          specifier: imp.specifier,
          symbols: options.symbolLevel ? imp.symbols : undefined,
          loc: imp.loc,
        });
        resolvedInfos.push({
          ...imp,
          resolvedExternal: resolved.name,
        });
      }
      // unresolved → 不创建边，也不记录 resolved info
    }

    // 为 re-export 创建边
    for (const exp of parsed.exports) {
      if (exp.reExportFrom) {
        const resolved = resolver.resolve(exp.reExportFrom, fileNode.id);
        if (resolved.kind === 'file' || resolved.kind === 'internal') {
          if (!graph.getFileNode(resolved.path)) {
            addFileToGraph(resolved.path, graph);
          }
          graph.addEdge({
            source: fileNode.id,
            target: resolved.path,
            kind: 're-export',
            specifier: exp.reExportFrom,
            loc: exp.loc,
          });
        }
      }
    }

    resolvedImports.set(fileNode.id, resolvedInfos);
  }

  // 5. 更新 FileNode 的 imports（填充 resolvedFile/resolvedExternal）
  for (const fileNode of graph.files()) {
    const infos = resolvedImports.get(fileNode.id) ?? [];
    const updatedNode: FileNode = {
      ...fileNode,
      imports: infos,
    };
    // Replace via remove + add
    graph.addFileNode(updatedNode);
  }

  return graph;
}

/** 将单个文件解析并添加到图中 */
function addFileToGraph(filePath: string, graph: DependencyGraph): void {
  if (graph.getFileNode(filePath)) return;

  try {
    const source = readFileSync(filePath, 'utf-8');
    const parsed = parseFile(source, filePath);

    const node: FileNode = {
      kind: 'file',
      id: filePath,
      exports: parsed.exports.map((e) => ({
        ...e,
        kind: e.kind as FileNode['exports'][number]['kind'],
      })),
      imports: parsed.imports.map((i) => ({
        ...i,
        kind: i.kind as FileNode['imports'][number]['kind'],
      })),
    };
    graph.addFileNode(node);
  } catch {
    // 文件无法解析，跳过
  }
}

/** 简单文件发现：递归遍历目录，按 glob 模式匹配 */
function discoverFiles(root: string, patterns: string[]): string[] {
  const result: string[] = [];

  function walk(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (matchPattern(fullPath, patterns)) {
          result.push(fullPath);
        }
      }
    }
  }

  walk(root);
  return result;
}

/** 简单模式匹配 */
function matchPattern(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const regex = globToRegex(pattern);
    if (regex.test(filePath)) {
      return true;
    }
  }
  return false;
}

/** 检查文件路径是否匹配单个 glob 模式 */
function matchGlob(filePath: string, pattern: string): boolean {
  return globToRegex(pattern).test(filePath);
}

/** 简化 glob → regex */
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<STARSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<STARSTAR>>/g, '.*')
    .replace(/\{([^}]+)\}/g, (_: string, group: string) =>
      `(${group.split(',').map((s) => s.trim()).join('|')})`,
    );
  regex = `${regex}$`;
  return new RegExp(regex);
}
