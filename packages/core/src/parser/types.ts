/** 源码位置 */
export interface SourceLocation {
  line: number;
  column: number;
}

/** 导入的符号 */
export interface ImportedSymbol {
  imported: string;
  local: string;
  /** 是否为 type-only 导入（inline type modifier: `import { type Foo }`），默认 false */
  isTypeOnly?: boolean;
}

/** 解析后的导入语句 */
export interface RawImport {
  /** 代码中写的原始路径字符串，如 './bar', '@/utils/foo', 'react' */
  specifier: string;
  /** 导入的符号列表 */
  symbols: ImportedSymbol[];
  /** 导入类型 */
  kind:
    | 'static-import'
    | 'dynamic-import'
    | 'require'
    | 'css-import'
    | 'asset-import';
  /** 是否为 type-only 导入 */
  isTypeOnly: boolean;
  /** 源码位置 */
  loc: SourceLocation;
}

/** 解析后的导出 */
export interface RawExport {
  /** 导出名 */
  name: string;
  /** 导出类型 */
  kind: 'named' | 'default' | 'all' | 'ts-namespace';
  /** 如果是 re-export，记录来源 */
  reExportFrom?: string;
  /** 是否为 type-only */
  isTypeOnly: boolean;
  /** 源码位置 */
  loc: SourceLocation;
}

/** 解析后的文件 */
export interface ParsedFile {
  /** 文件路径 */
  filePath: string;
  /** 该文件中的导入 */
  imports: RawImport[];
  /** 该文件中的导出 */
  exports: RawExport[];
}
