/** 解析目标 */
export type ResolvedTarget =
  | { kind: 'file'; path: string; via?: ResolveSource }
  | { kind: 'external'; name: string; via?: ResolveSource }
  | { kind: 'internal'; name: string; path: string; via?: ResolveSource }
  | { kind: 'unresolved'; specifier: string; via?: ResolveSource };

export type ResolveSource =
  | { kind: 'relative' }
  | { kind: 'tsconfig'; file: string }
  | { kind: 'jsconfig'; file: string }
  | { kind: 'bundler-alias'; file?: string; find?: string }
  | { kind: 'workspace'; file?: string };

/** Resolver 配置 */
export interface ResolveOptions {
  /** 项目根目录（绝对路径），必填 */
  root: string;

  /** tsconfig 路径，不填则自动查找 */
  tsconfigPath?: string;

  /** 静态 bundler alias，按字面前缀匹配。 */
  aliases?: AliasEntry[];

  /** 扩展名补全顺序 */
  extensions?: string[];

  /** Monorepo workspace 配置 */
  workspace?: WorkspaceConfig;
}

export interface WorkspaceConfig {
  /** workspace 根目录（默认为 root） */
  root?: string;
  /** glob 模式，如 ['packages/*'] */
  packagePatterns?: string[];
}

export interface AliasEntry {
  find: string;
  replacement: string;
}
