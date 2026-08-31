import { readFileSync, readdirSync, existsSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { parseFile } from './parser/index.js';
import { Resolver } from './resolver/index.js';
import { DependencyGraph } from './graph/index.js';
import type { AnalyzeOptions } from './types.js';
import type { FileNode, ImportInfo } from './graph/types.js';
import type { ParsedFile } from './parser/index.js';
import { applyDepicConfig } from './config.js';

export const DEFAULT_ANALYZE_INCLUDE = ['**/*.{ts,tsx,js,jsx}'];

/**
 * 分析项目依赖图。入口函数。
 */
export async function analyze(input: AnalyzeOptions): Promise<DependencyGraph> {
  const options = applyDepicConfig(input);
  const root = options.root;
  const graph = new DependencyGraph();

  // 预编译 include/exclude glob 模式
  const includeRegexes = (options.include ?? DEFAULT_ANALYZE_INCLUDE).map((p) => globToRegex(p));
  const excludeRegexes = (options.exclude ?? []).map((p) => globToRegex(p));

  // 0. 加载 .gitignore 排除模式
  const gitignorePatterns = loadGitignorePatterns(root);

  // 1. 文件发现
  let discovered = discoverFiles(root, includeRegexes, gitignorePatterns);
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
      exports: parsed.exports.map((e) => ({
        ...e,
        kind: e.kind as FileNode['exports'][number]['kind'],
      })),
      imports: resolvedInfos,
    };
    graph.addFileNode(node);
  }

  // 5. 补全 package 信息（对所有文件，包括 addMissingFile 添加的）
  const allFilePaths = graph.files().map((f) => f.id);
  const pkgMap = buildPackageMap(allFilePaths);
  for (const fileNode of graph.files()) {
    if (pkgMap.has(fileNode.id)) {
      graph.addFileNode({ ...fileNode, package: pkgMap.get(fileNode.id) });
    }
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

/** 简单文件发现：递归遍历目录，按 glob 模式匹配，跳过 gitignore 文件 */
function discoverFiles(root: string, regexes: RegExp[], gitignorePatterns: GitignorePattern[]): string[] {
  const result: string[] = [];

  function walk(dir: string): void {
    // 加载当前目录的 .gitignore
    const localPatterns = loadGitignorePatterns(dir);

    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(root, fullPath);

      // 检查是否匹配 gitignore
      if (isGitignored(relPath, entry.isDirectory(), [...gitignorePatterns, ...localPatterns])) {
        continue;
      }

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
        if (pkg?.name) { result.set(filePath, pkg.name); break; }
        // cached null → continue walking up
      } else {
        try {
          const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
          const pkg = JSON.parse(raw);
          pkgCache.set(dir, pkg);
          if (pkg.name) { result.set(filePath, pkg.name); break; }
        } catch {
          pkgCache.set(dir, null);
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return result;
}

// ─── .gitignore 支持 ─────────────────────────────────────────

interface GitignorePattern {
  /** 原始模式字符串 */
  raw: string;
  /** 转换后的正则 */
  regex: RegExp;
  /** 是否仅匹配目录 */
  directoryOnly: boolean;
  /** 是否为否定（! 模式） */
  negative: boolean;
}

function loadGitignorePatterns(dir: string): GitignorePattern[] {
  const gitignorePath = join(dir, '.gitignore');
  if (!existsSync(gitignorePath)) return [];

  try {
    const raw = readFileSync(gitignorePath, 'utf-8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const negative = line.startsWith('!');
        const pattern = negative ? line.slice(1) : line;
        const directoryOnly = pattern.endsWith('/');
        const clean = (directoryOnly ? pattern.slice(0, -1) : pattern).replace(/^\/+/, '');
        const regex = gitignoreToRegex(clean);
        return { raw: line, regex, directoryOnly, negative };
      });
  } catch {
    return [];
  }
}

function gitignoreToRegex(pattern: string): RegExp {
  let re = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR>>/g, '.*')
    .replace(/\?/g, '.');
  // Match anywhere in the path unless anchored
  return new RegExp(`(^|/)${re}($|/)`);
}

function isGitignored(
  relPath: string,
  isDir: boolean,
  patterns: GitignorePattern[],
): boolean {
  let ignored = false;
  for (const p of patterns) {
    if (p.directoryOnly && !isDir) continue;
    if (p.regex.test(relPath) || p.regex.test(relPath + '/')) {
      ignored = !p.negative;
    }
  }
  return ignored;
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

/** Match a file using the same glob semantics as analyze() discovery. */
export function matchesAnalyzeGlob(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegex(pattern).test(file));
}
