import type { WorkspaceConfig } from './resolver/types.js';

/** analyze() 输入选项 */
export interface AnalyzeOptions {
  /** 项目根目录（绝对路径），必填 */
  root: string;

  /** 需要分析的文件 glob 模式 */
  include?: string[];

  /** 排除的文件 glob 模式 */
  exclude?: string[];

  /** tsconfig 路径，不填则自动查找 */
  tsconfigPath?: string;

  /** 扩展名补全顺序 */
  extensions?: string[];

  /** 是否启用符号级分析 */
  symbolLevel?: boolean;

  /** Monorepo workspace 配置 */
  workspace?: WorkspaceConfig;
}
