import { parseSync } from '@swc/core';
import type {
  Module,
  ImportDeclaration,
  ImportSpecifier,
  ExportDeclaration,
  ExportNamedDeclaration,
  ExportDefaultDeclaration,
  ExportDefaultExpression,
  ExportAllDeclaration,
  ExpressionStatement,
  CallExpression,
  VariableDeclaration,
  VariableDeclarator,
  ReturnStatement,
} from '@swc/core';
import type { ParsedFile, RawImport, RawExport, SourceLocation } from './types.js';

/**
 * specifier 后缀 → import kind 映射。对带已知非 JS 后缀的 specifier
 * 自动分类为 css-import 或 asset-import，覆盖原来的 kind。
 */
const EXTENSION_KIND: Record<string, RawImport['kind']> = {
  // CSS & preprocessors
  '.css':  'css-import',
  '.scss': 'css-import',
  '.sass': 'css-import',
  '.less': 'css-import',
  '.styl': 'css-import',
  // Images
  '.png':  'asset-import',
  '.jpg':  'asset-import',
  '.jpeg': 'asset-import',
  '.gif':  'asset-import',
  '.svg':  'asset-import',
  '.ico':  'asset-import',
  '.webp': 'asset-import',
  '.avif': 'asset-import',
  '.bmp':  'asset-import',
  // Fonts
  '.woff':  'asset-import',
  '.woff2': 'asset-import',
  '.ttf':   'asset-import',
  '.eot':   'asset-import',
  '.otf':   'asset-import',
  // Media
  '.mp4':  'asset-import',
  '.webm': 'asset-import',
  '.mp3':  'asset-import',
  '.wav':  'asset-import',
  // Binary / 3D / other
  '.wasm': 'asset-import',
  '.glb':  'asset-import',
  '.gltf': 'asset-import',
  '.pdf':  'asset-import',
};

/**
 * 根据 specifier 的后缀覆盖 import kind。
 */
function classifyByExtension(
  specifier: string,
  kind: RawImport['kind'],
): RawImport['kind'] {
  for (const ext of Object.keys(EXTENSION_KIND)) {
    if (specifier.endsWith(ext)) {
      return EXTENSION_KIND[ext];
    }
  }
  return kind;
}

/**
 * 将字节偏移量转换为行列位置。
 */
function offsetToLoc(source: string, offset: number): SourceLocation {
  let line = 1;
  let column = 0;
  for (let i = 0; i < offset; i++) {
    if (source[i] === '\n') {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  return { line, column };
}

/**
 * 将 import specifier 转换为 { imported, local, isTypeOnly } 列表。
 */
function extractImportSymbols(
  specifiers: ImportSpecifier[],
): { imported: string; local: string; isTypeOnly?: boolean }[] {
  return specifiers.map((s) => {
    if (s.type === 'ImportSpecifier') {
      const result: { imported: string; local: string; isTypeOnly?: boolean } = {
        imported: s.imported ? s.imported.value : s.local.value,
        local: s.local.value,
      };
      if (s.isTypeOnly) result.isTypeOnly = true;
      return result;
    }
    if (s.type === 'ImportDefaultSpecifier') {
      return { imported: 'default', local: s.local.value };
    }
    // ImportNamespaceSpecifier
    return { imported: '*', local: s.local.value };
  });
}

/**
 * 从 VariableDeclaration 或 FunctionDeclaration/ClassDeclaration 提取导出名。
 */
function extractDeclNames(decl: ExportDeclaration['declaration']): string[] {
  if (decl.type === 'VariableDeclaration') {
    return decl.declarations
      .filter((d): d is typeof d & { id: { type: 'Identifier'; value: string } } =>
        d.id.type === 'Identifier')
      .map((d) => d.id.value);
  }
  // FunctionDeclaration / ClassDeclaration
  if ('identifier' in decl && decl.identifier) {
    return [decl.identifier.value];
  }
  return [];
}

/**
 * 从 AST 节点中提取动态导入（CallExpression with Import callee）。
 * 检查顶层表达式语句和变量声明。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDynamicImports(
  node: any,
  source: string,
  imports: RawImport[],
): void {
  // bare import('foo')
  if (node.type === 'ExpressionStatement') {
    const es = node as unknown as ExpressionStatement;
    if (es.expression.type === 'CallExpression') {
      const call = es.expression as CallExpression;
      if (call.callee.type === 'Import') {
        const arg = call.arguments[0]?.expression;
        if (arg?.type === 'StringLiteral') {
          imports.push({
            specifier: arg.value,
            symbols: [],
            kind: classifyByExtension(arg.value, 'dynamic-import'),
            isTypeOnly: false,
            loc: offsetToLoc(source, Math.max(0, call.span.start - 1)),
          });
        }
      }
    }
    return;
  }

  // const x = import('foo') / const { a } = import('foo')
  if (node.type === 'VariableDeclaration') {
    const vd = node as unknown as VariableDeclaration;
    for (const declarator of vd.declarations) {
      collectDynamicCalls(declarator.init, source, imports);
    }
    return;
  }

  // return import('foo') — may be inside a function body
  if (node.type === 'ReturnStatement') {
    const rs = node as unknown as ReturnStatement;
    collectDynamicCalls(rs.argument, source, imports);
    return;
  }

  // function f() { return import('foo') } — recurse into function bodies
  if (node.type === 'FunctionDeclaration') {
    const fd = node as { body?: { stmts?: { type: string }[] } };
    const stmts = fd.body?.stmts ?? [];
    for (const s of stmts) extractDynamicImports(s, source, imports);
    return;
  }

  // export function f() {} (wraps FunctionDeclaration)
  // export default function f() {} (wraps FunctionDeclaration in ExportDefaultDeclaration)
  if (node.type === 'ExportDeclaration' || node.type === 'ExportDefaultDeclaration') {
    const ed = node as { declaration?: { type: string } };
    if (ed.declaration) extractDynamicImports(ed.declaration, source, imports);
    return;
  }
}

/**
 * 递归检查表达式节点，收集动态 import() 调用。
 */
function collectDynamicCalls(
  expr: unknown,
  source: string,
  imports: RawImport[],
): void {
  if (!expr || typeof expr !== 'object') return;
  const node = expr as { type: string; [key: string]: unknown };

  if (node.type === 'CallExpression') {
    const call = node as unknown as CallExpression;
    if (call.callee.type === 'Import') {
      const arg = call.arguments[0]?.expression;
      if (arg?.type === 'StringLiteral') {
        imports.push({
          specifier: arg.value,
          symbols: [],
          kind: classifyByExtension(arg.value, 'dynamic-import'),
          isTypeOnly: false,
          loc: offsetToLoc(source, Math.max(0, call.span.start - 1)),
        });
      }
      return;
    }
  }

  // 递归检查子表达式（如 await import('foo')）
  if (node.type === 'AwaitExpression') {
    const ae = node as { argument?: unknown };
    collectDynamicCalls(ae.argument, source, imports);
  }
  if (node.type === 'ParenthesisExpression') {
    const pe = node as { expression?: unknown };
    collectDynamicCalls(pe.expression, source, imports);
  }
}

/**
 * 处理 ExportDeclaration 节点，将导出的实体追加到 exports 数组。
 */
function processExport(
  stmt: { type: string },
  source: string,
  exports: RawExport[],
): void {
  // export const foo = ... / export function foo() {} / export class Foo {}
  if (stmt.type === 'ExportDeclaration') {
    const decl = stmt as ExportDeclaration;
    const names = extractDeclNames(decl.declaration);
    const loc = offsetToLoc(source, Math.max(0, decl.span.start - 1));
    for (const name of names) {
      exports.push({ name, kind: 'named', isTypeOnly: false, loc });
    }
    return;
  }

  // export { foo }, export { foo } from './bar', export * as ns from './bar'
  // export type { foo } — the `typeOnly` flag is on the declaration
  if (stmt.type === 'ExportNamedDeclaration') {
    const decl = stmt as ExportNamedDeclaration;
    const reExportFrom = decl.source?.value;
    const typeOnly = decl.typeOnly ?? false;
    const loc = offsetToLoc(source, Math.max(0, decl.span.start - 1));

    for (const s of decl.specifiers) {
      if (s.type === 'ExportSpecifier') {
        const name = s.exported ? s.exported.value : s.orig.value;
        exports.push({
          name,
          kind: 'named',
          reExportFrom,
          isTypeOnly: s.isTypeOnly || typeOnly,
          loc,
        });
      } else if (s.type === 'ExportNamespaceSpecifier') {
        exports.push({
          name: s.name.value,
          kind: 'named',
          reExportFrom,
          isTypeOnly: typeOnly,
          loc,
        });
      }
    }
    return;
  }

  // export * from './bar'
  if (stmt.type === 'ExportAllDeclaration') {
    const decl = stmt as ExportAllDeclaration;
    exports.push({
      name: '*',
      kind: 'all',
      reExportFrom: decl.source.value,
      isTypeOnly: (decl as { typeOnly?: boolean }).typeOnly ?? false,
      loc: offsetToLoc(source, Math.max(0, decl.span.start - 1)),
    });
    return;
  }

  // export default <expr>
  if (stmt.type === 'ExportDefaultExpression') {
    const decl = stmt as ExportDefaultExpression;
    exports.push({
      name: 'default',
      kind: 'default',
      isTypeOnly: false,
      loc: offsetToLoc(source, Math.max(0, decl.span.start - 1)),
    });
    return;
  }

  // export default function foo() {} / export default class Foo {}
  if (stmt.type === 'ExportDefaultDeclaration') {
    const decl = stmt as ExportDefaultDeclaration;
    let name = 'default';
    if ('identifier' in decl.decl && decl.decl.identifier) {
      name = decl.decl.identifier.value;
    }
    exports.push({
      name,
      kind: 'default',
      isTypeOnly: false,
      loc: offsetToLoc(source, Math.max(0, decl.span.start - 1)),
    });
  }
}

/**
 * 解析单个文件的源码，提取导入和导出信息。
 * 纯函数 — 输入源码和文件路径，输出 ParsedFile。
 */
export function parseFile(
  source: string,
  filePath: string,
): ParsedFile {
  const imports: RawImport[] = [];
  const exports: RawExport[] = [];

  // 空文件直接返回
  if (source.trim().length === 0) {
    return { filePath, imports, exports };
  }

  const ast: Module = parseSync(source, {
    syntax: 'typescript',
    target: 'es2022',
    comments: false,
  });

  for (const stmt of ast.body) {
    if (stmt.type === 'ImportDeclaration') {
      const decl = stmt as ImportDeclaration;
      imports.push({
        specifier: decl.source.value,
        symbols: extractImportSymbols(decl.specifiers),
        kind: classifyByExtension(decl.source.value, 'static-import'),
        isTypeOnly: decl.typeOnly ?? false,
        loc: offsetToLoc(source, Math.max(0, decl.span.start - 1)),
      });
    }

    processExport(stmt, source, exports);

    extractDynamicImports(stmt, source, imports);
  }

  return { filePath, imports, exports };
}
