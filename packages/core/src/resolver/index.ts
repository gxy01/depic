import {
  statSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { resolve, dirname, extname, join, normalize } from 'node:path';
import type { AliasEntry, ResolveOptions, ResolvedTarget, ResolveSource } from './types.js';

export const DEFAULT_RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

interface TsconfigPaths {
  baseUrl: string;
  patterns: { prefix: string; replacements: string[] }[];
}

interface TsconfigCandidate {
  file: string;
  kind: 'tsconfig' | 'jsconfig';
  paths: TsconfigPaths;
}

export class Resolver {
  private root: string;
  private extensions: string[];
  private tsconfigPathsCache = new Map<string, TsconfigCandidate | null>();
  private workspaceMap: Map<string, string> = new Map();
  private aliases: AliasEntry[];
  private aliasSourceByFind = new Map<string, string | undefined>();

  constructor(options: ResolveOptions) {
    this.root = options.root;
    this.extensions = options.extensions ?? DEFAULT_RESOLVE_EXTENSIONS;
    this.aliases = [...(options.aliases ?? [])].sort((a, b) => b.find.length - a.find.length);

    // 预加载显式指定的 tsconfig
    if (options.tsconfigPath) {
      const paths = this.loadTsconfigPaths(options.tsconfigPath);
      this.tsconfigPathsCache.set(options.tsconfigPath, paths
        ? {
            file: options.tsconfigPath,
            kind: options.tsconfigPath.endsWith('jsconfig.json') ? 'jsconfig' : 'tsconfig',
            paths,
          }
        : null);
    }

    // 扫描 workspace
    if (options.workspace) {
      this.scanWorkspace(options.workspace);
    }
  }

  /**
   * 将 specifier 解析为目标。
   */
  resolve(specifier: string, fromFile: string): ResolvedTarget {
    // 1. 相对路径
    if (specifier.startsWith('.')) {
      const resolved = this.resolveRelative(specifier, fromFile);
      if (resolved) return resolved;
    }

    // 2. tsconfig/jsconfig paths — nearest first, then outward.
    const tsconfigCandidates = this.getTsconfigCandidates(fromFile);
    const tsconfigResult = this.resolveTsconfigPath(specifier, tsconfigCandidates);
    if (tsconfigResult) return tsconfigResult;

    // 3. bundler alias
    const aliased = this.resolveAlias(specifier);
    if (aliased) return aliased;

    // 4. workspace 内部包
    if (this.workspaceMap.has(specifier)) {
      return attachResolveSource({
        kind: 'internal',
        name: specifier,
        path: this.workspaceMap.get(specifier)!,
      }, { kind: 'workspace' });
    }

    // 5. 外部包（裸 specifier，不以 . 或 / 开头）
    if (isPathLikeAlias(specifier)) {
      return { kind: 'unresolved', specifier };
    }
    return { kind: 'external', name: specifier };
  }

  // ─── tsconfig ───────────────────────────────────────────────

  private loadTsconfigPaths(tsconfigPath: string): TsconfigPaths | null {
    try {
      const raw = readFileSync(tsconfigPath, 'utf-8');
      // 简单 JSON 解析（不处理注释，先用 strip-json-comments？用 SWC？）
      // 这里用简单的 strip 处理单行注释
      const stripped = raw
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const config = JSON.parse(stripped);
      const paths = config.compilerOptions?.paths;
      const baseUrl = config.compilerOptions?.baseUrl ?? '.';
      if (!paths) return null;

      const baseDir = resolve(dirname(tsconfigPath), baseUrl);
      const patterns = Object.entries(paths as Record<string, string[]>).map(
        ([pattern, targets]) => {
          // 将 tsconfig pattern 中的 * 替换为捕获组
          const prefix = pattern.replace(/\*$/, '');
          const replacements = targets.map((t: string) => {
            const resolved = resolve(baseDir, t.replace(/\*$/, ''));
            // 确保通配符路径以分隔符结尾，避免拼接时丢失路径层级
            return t.endsWith('*') ? resolved + '/' : resolved;
          });
          return { prefix, replacements };
        },
      );

      return { baseUrl: baseDir, patterns };
    } catch {
      return null;
    }
  }

  /**
   * 从 fromFile 向上查找所有可用的 tsconfig.json / jsconfig.json，按最近优先返回。
   */
  private getTsconfigCandidates(fromFile: string): TsconfigCandidate[] {
    const start = dirname(fromFile);
    const seen = new Set<string>();
    const candidates: TsconfigCandidate[] = [];
    let dir = start;

    while (true) {
      const pair: Array<{ file: string; kind: 'tsconfig' | 'jsconfig' }> = [
        { file: join(dir, 'tsconfig.json'), kind: 'tsconfig' },
        { file: join(dir, 'jsconfig.json'), kind: 'jsconfig' },
      ];
      for (const candidate of pair) {
        if (seen.has(candidate.file) || !existsSync(candidate.file)) continue;
        seen.add(candidate.file);
        const cached = this.tsconfigPathsCache.get(candidate.file);
        if (cached === null) continue;
        if (cached) {
          candidates.push(cached);
          continue;
        }
        const paths = this.loadTsconfigPaths(candidate.file);
        const record = paths
          ? { file: candidate.file, kind: candidate.kind, paths }
          : null;
        this.tsconfigPathsCache.set(candidate.file, record);
        if (record) candidates.push(record);
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return candidates;
  }

  private resolveTsconfigPath(
    specifier: string,
    candidates: TsconfigCandidate[],
  ): ResolvedTarget | null {
    for (const candidate of candidates) {
      for (const { prefix, replacements } of candidate.paths.patterns) {
        if (!specifier.startsWith(prefix)) continue;

        const remainder = specifier.slice(prefix.length);
        for (const repl of replacements) {
          const candidatePath = repl + remainder;
          const resolved = this.tryResolveFile(candidatePath);
          if (resolved) {
            return attachResolveSource(resolved, { kind: candidate.kind, file: candidate.file });
          }
        }
      }
    }
    return null;
  }

  // ─── relative ───────────────────────────────────────────────

  private resolveRelative(
    specifier: string,
    fromFile: string,
  ): ResolvedTarget | null {
    const fromDir = dirname(fromFile);
    const absPath = resolve(fromDir, specifier);

    const resolved = this.tryResolveFile(absPath);
    if (resolved) return attachResolveSource(resolved, { kind: 'relative' });
    return null;
  }

  private resolveAlias(specifier: string): ResolvedTarget | null {
    for (const alias of this.aliases) {
      if (!this.matchesAlias(specifier, alias.find)) continue;
      const remainder = specifier === alias.find
        ? ''
        : specifier.slice(alias.find.length).replace(/^\//, '');
      const candidate = this.toAbsoluteAliasPath(alias.replacement, remainder);
      const resolved = this.tryResolveFile(candidate);
      if (resolved) {
        return attachResolveSource(resolved, { kind: 'bundler-alias', find: alias.find });
      }
      return attachResolveSource({ kind: 'unresolved' as const, specifier }, { kind: 'bundler-alias', find: alias.find });
    }
    return null;
  }

  private matchesAlias(specifier: string, find: string): boolean {
    return specifier === find || specifier.startsWith(`${find}/`);
  }

  private toAbsoluteAliasPath(replacement: string, remainder: string): string {
    const base = resolve(this.root, replacement);
    return remainder ? join(base, remainder) : base;
  }

  /**
   * 尝试将路径解析为文件：扩展名补全 → index 文件。
   */
  private tryResolveFile(absPath: string): ResolvedTarget | null {
    // 1. 直接匹配（specifier 已带扩展名）
    if (extname(absPath) && existsSync(absPath)) {
      return { kind: 'file', path: normalize(absPath) };
    }

    // 2. 扩展名补全
    for (const ext of this.extensions) {
      const candidate = absPath + ext;
      if (existsSync(candidate)) {
        return { kind: 'file', path: normalize(candidate) };
      }
    }

    // 3. 目录 → index 文件
    if (existsSync(absPath)) {
      try {
        const s = statSync(absPath);
        if (s.isDirectory()) {
          for (const ext of this.extensions) {
            const indexFile = join(absPath, 'index' + ext);
            if (existsSync(indexFile)) {
              return { kind: 'file', path: normalize(indexFile) };
            }
          }
        }
      } catch {
        // stat failed
      }
    }

    return null;
  }

  // ─── workspace ──────────────────────────────────────────────

  private scanWorkspace(workspace: ResolveOptions['workspace']): void {
    const wsRoot = workspace!.root ? resolve(this.root, workspace!.root) : this.root;
    const patterns = workspace!.packagePatterns ?? ['packages/*'];

    for (const pattern of patterns) {
      // 简单处理：'packages/*' → 列出 packages/ 下的子目录
      const parts = pattern.split('/');
      if (parts.length === 2 && parts[1] === '*') {
        const parent = join(wsRoot, parts[0]);
        if (!existsSync(parent)) continue;
        try {
          const entries = readdirSync(parent, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            this.loadWorkspacePackage(join(parent, entry.name));
          }
        } catch {
          // skip
        }
      }
    }
  }

  private loadWorkspacePackage(pkgDir: string): void {
    const pkgPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgPath)) return;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const name = pkg.name;
      if (!name) return;

      // 解析入口：exports > main > src/index.ts
      let entry: string | null = null;

      if (pkg.exports) {
        // 支持简单的 exports map
        const exp =
          typeof pkg.exports === 'string'
            ? pkg.exports
            : pkg.exports['.']?.import ??
              pkg.exports['.']?.require ??
              pkg.exports['.']?.default ??
              pkg.exports['.'];
        if (typeof exp === 'string') {
          entry = resolve(pkgDir, exp);
        }
      }

      if (!entry && pkg.main) {
        entry = resolve(pkgDir, pkg.main);
      }

      if (!entry) {
        // fallback: src/index.ts
        const fallback = join(pkgDir, 'src', 'index.ts');
        if (existsSync(fallback)) entry = fallback;
      }

      if (entry) {
        const resolved = this.tryResolveFile(entry);
        if (resolved && resolved.kind === 'file') {
          this.workspaceMap.set(name, resolved.path);
        } else if (existsSync(entry)) {
          this.workspaceMap.set(name, normalize(entry));
        }
      }
    } catch {
      // skip malformed package.json
    }
  }
}

function attachResolveSource<T extends object>(target: T, via: ResolveSource): T & { via: ResolveSource } {
  Object.defineProperty(target, 'via', {
    value: via,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return target as T & { via: ResolveSource };
}

function isPathLikeAlias(specifier: string): boolean {
  return specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('#/');
}
