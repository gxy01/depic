import { readFileSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseFile } from './parser/index.js';
import { Resolver } from './resolver/index.js';
import { DependencyGraph } from './graph/index.js';
import type { AnalyzeOptions } from './types.js';
import type { FileNode, ImportInfo } from './graph/types.js';
import type { ParsedFile } from './parser/index.js';

const DEFAULT_INCLUDE = ['**/*.{ts,tsx,js,jsx}'];

/**
 * 分析项目依赖图。入口函数。
 */
export async function analyze(options: AnalyzeOptions): Promise<DependencyGraph> {
  const root = options.root;
  const graph = new DependencyGraph();

  // 预编译 include/exclude glob 模式
  const includeRegexes = (options.include ?? DEFAULT_INCLUDE).map((p) => globToRegex(p));
  const excludeRegexes = (options.exclude ?? []).map((p) => globToRegex(p));

  // 1. 文件发现
  let discovered = discoverFiles(root, includeRegexes);
  if (excludeRegexes.length > 0) {
    discovered = discovered.filter(
      (f) => !excludeRegexes.some((re) => re.test(f)),
    );
  }

  // 2. 创建 Resolver
  const resolver = new Resolver({
    root,
    tsconfigPath: options.tsconfigPath,
    extensions: options.extensions,
    workspace: options.workspace,
  });

  // 3. 解析所有文件一次，缓存结果
  const parsedCache = new Map<string, ParsedFile>();
  for (const filePath of discovered) {
    try {
      const source = readFileSync(filePath, 'utf-8');
      parsedCache.set(filePath, parseFile(source, filePath));
    } catch {
      // 文件无法解析，跳过
    }
  }

  // 3.5 检测 monorepo 包结构
  const pkgMap = buildPackageMap(discovered);

  // 4. 单趟遍历：建 FileNode + 解析 import + 建 Edge + 填充 resolved info
  for (const [filePath, parsed] of parsedCache) {
    const resolvedInfos: ImportInfo[] = [];

    for (const imp of parsed.imports) {
      const resolved = resolver.resolve(imp.specifier, filePath);

      if (resolved.kind === 'file' || resolved.kind === 'internal') {
        // 确保目标文件存在于缓存中
        if (!parsedCache.has(resolved.path)) {
          addMissingFile(resolved.path, parsedCache, graph);
        }
        graph.addEdge({
          source: filePath,
          target: resolved.path,
          kind: imp.kind,
          specifier: imp.specifier,
          symbols: options.symbolLevel ? imp.symbols : undefined,
          loc: imp.loc,
        });
        resolvedInfos.push({ ...imp, resolvedFile: resolved.path });
      } else if (resolved.kind === 'external') {
        if (!graph.getExternalNode(resolved.name)) {
          graph.addExternalNode({ kind: 'external', id: resolved.name });
        }
        graph.addEdge({
          source: filePath,
          target: resolved.name,
          kind: imp.kind,
          specifier: imp.specifier,
          symbols: options.symbolLevel ? imp.symbols : undefined,
          loc: imp.loc,
        });
        resolvedInfos.push({ ...imp, resolvedExternal: resolved.name });
      }
    }

    // re-export 边
    for (const exp of parsed.exports) {
      if (exp.reExportFrom) {
        const resolved = resolver.resolve(exp.reExportFrom, filePath);
        if (resolved.kind === 'file' || resolved.kind === 'internal') {
          if (!parsedCache.has(resolved.path)) {
            addMissingFile(resolved.path, parsedCache, graph);
          }
          graph.addEdge({
            source: filePath,
            target: resolved.path,
            kind: 're-export',
            specifier: exp.reExportFrom,
            loc: exp.loc,
          });
        }
      }
    }

    // 构建 FileNode（含 resolved imports）
    const node: FileNode = {
      kind: 'file',
      id: filePath,
      package: pkgMap.get(filePath),
      exports: parsed.exports.map((e) => ({
        ...e,
        kind: e.kind as FileNode['exports'][number]['kind'],
      })),
      imports: resolvedInfos,
    };
    graph.addFileNode(node);
  }

  return graph;
}

/**
 * 添加文件发现阶段遗漏的目标文件到缓存，并创建 FileNode。
 */
function addMissingFile(
  filePath: string,
  cache: Map<string, ParsedFile>,
  graph: DependencyGraph,
): void {
  try {
    const source = readFileSync(filePath, 'utf-8');
    const parsed = parseFile(source, filePath);
    cache.set(filePath, parsed);
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
    // 跳过
  }
}

/** 简单文件发现：递归遍历目录，按 glob 模式匹配 */
function discoverFiles(root: string, regexes: RegExp[]): string[] {
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
        if (regexes.some((re) => re.test(fullPath))) {
          result.push(fullPath);
        }
      }
    }
  }

  walk(root);
  return result;
}

function buildPackageMap(filePaths: string[]): Map<string, string | undefined> {
  const pkgCache = new Map<string, { name?: string } | null>();
  const result = new Map<string, string | undefined>();

  for (const filePath of filePaths) {
    let dir = dirname(filePath);
    while (true) {
      if (pkgCache.has(dir)) {
        const pkg = pkgCache.get(dir);
        if (pkg?.name) result.set(filePath, pkg.name);
        break;
      }
      try {
        const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
        const pkg = JSON.parse(raw);
        pkgCache.set(dir, pkg);
        if (pkg.name) result.set(filePath, pkg.name);
        break;
      } catch {
        pkgCache.set(dir, null);
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return result;
}

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
