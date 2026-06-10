import {
  statSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { resolve, dirname, extname, join, normalize } from 'node:path';
import type { ResolveOptions, ResolvedTarget } from './types';

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

interface TsconfigPaths {
  baseUrl: string;
  patterns: { prefix: string; replacements: string[] }[];
}

interface WorkspaceEntry {
  name: string;
  entry: string;
}

export class Resolver {
  private root: string;
  private extensions: string[];
  private tsconfigPathsCache = new Map<string, TsconfigPaths | null>();
  private workspaceMap: Map<string, string> = new Map();

  constructor(options: ResolveOptions) {
    this.root = options.root;
    this.extensions = options.extensions ?? DEFAULT_EXTENSIONS;

    // 预加载显式指定的 tsconfig
    if (options.tsconfigPath) {
      const paths = this.loadTsconfigPaths(options.tsconfigPath);
      this.tsconfigPathsCache.set(dirname(options.tsconfigPath), paths);
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
      return this.resolveRelative(specifier, fromFile);
    }

    // 2. tsconfig paths 别名 — 从 fromFile 向上查找最近的 tsconfig
    const tsconfigPaths = this.getTsconfigForFile(fromFile);
    if (tsconfigPaths) {
      const result = this.resolveTsconfigPath(specifier, tsconfigPaths);
      if (result) return result;
    }

    // 3. workspace 内部包
    if (this.workspaceMap.has(specifier)) {
      return {
        kind: 'internal',
        name: specifier,
        path: this.workspaceMap.get(specifier)!,
      };
    }

    // 4. 外部包（裸 specifier，不以 . 或 / 开头）
    return { kind: 'external', name: specifier };
  }

  // ─── tsconfig ───────────────────────────────────────────────

  private findTsconfig(dir: string): string | null {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null; // reached root
    return this.findTsconfig(parent);
  }

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
   * 从 fromFile 向上查找最近的 tsconfig.json，加载并缓存 paths。
   */
  private getTsconfigForFile(fromFile: string): TsconfigPaths | null {
    const dir = dirname(fromFile);
    // 检查缓存
    for (const [cachedDir, cached] of this.tsconfigPathsCache) {
      if (dir.startsWith(cachedDir)) {
        // 查找更近的 tsconfig
        const closer = this.findTsconfigInDir(dir, cachedDir);
        if (closer) return closer;
        return cached;
      }
    }
    // 未命中缓存：从文件目录向上查找
    const tsconfigPath = this.findTsconfig(dir);
    if (tsconfigPath) {
      const paths = this.loadTsconfigPaths(tsconfigPath);
      const tsconfigDir = dirname(tsconfigPath);
      this.tsconfigPathsCache.set(tsconfigDir, paths);
      return paths;
    }
    this.tsconfigPathsCache.set(dir, null);
    return null;
  }

  /**
   * 在 startDir 到 stopDir 之间查找 tsconfig（用于发现嵌套 tsconfig）。
   */
  private findTsconfigInDir(
    startDir: string,
    stopDir: string,
  ): TsconfigPaths | null {
    let dir = startDir;
    while (dir.length >= stopDir.length && dir.startsWith(stopDir)) {
      const candidate = join(dir, 'tsconfig.json');
      if (existsSync(candidate)) {
        // 如果就是已缓存的，跳过
        for (const [cachedDir] of this.tsconfigPathsCache) {
          if (candidate === join(cachedDir, 'tsconfig.json')) return null;
        }
        const paths = this.loadTsconfigPaths(candidate);
        if (paths) {
          this.tsconfigPathsCache.set(dir, paths);
          return paths;
        }
      }
      dir = dirname(dir);
    }
    return null;
  }

  private resolveTsconfigPath(
    specifier: string,
    tsconfigPaths: TsconfigPaths,
  ): ResolvedTarget | null {
    const { patterns } = tsconfigPaths;
    for (const { prefix, replacements } of patterns) {
      if (!specifier.startsWith(prefix)) continue;

      const remainder = specifier.slice(prefix.length);
      for (const repl of replacements) {
        const candidate = repl + remainder;
        const resolved = this.tryResolveFile(candidate);
        if (resolved) return resolved;
      }
      // 前缀匹配了但文件没找到 → unresolved（不继续尝试其他解析策略）
      return { kind: 'unresolved', specifier };
    }
    return null;
  }

  // ─── relative ───────────────────────────────────────────────

  private resolveRelative(
    specifier: string,
    fromFile: string,
  ): ResolvedTarget {
    const fromDir = dirname(fromFile);
    const absPath = resolve(fromDir, specifier);

    const resolved = this.tryResolveFile(absPath);
    if (resolved) return resolved;

    return { kind: 'unresolved', specifier };
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
