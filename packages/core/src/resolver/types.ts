/** 解析目标 */
export type ResolvedTarget =
  | { kind: 'file'; path: string }
  | { kind: 'external'; name: string }
  | { kind: 'internal'; name: string; path: string }
  | { kind: 'unresolved'; specifier: string };

/** Resolver 配置 */
export interface ResolveOptions {
  /** 项目根目录（绝对路径），必填 */
  root: string;

  /** tsconfig 路径，不填则自动查找 */
  tsconfigPath?: string;

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
