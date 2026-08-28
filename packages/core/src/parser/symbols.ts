import { parseSync } from '@swc/core';

interface AstNode {
  type: string;
  [key: string]: unknown;
}

export interface SymbolReference {
  name: string;
  members: string[];
}

export interface SymbolDeclaration {
  name: string;
  startLine: number;
  endLine: number;
  references: SymbolReference[];
}

export interface SymbolBinding {
  name: string;
  source?: string;
}

/** Internal proof metadata, separate from the public file-level graph. */
export interface SymbolModule {
  declarations: Map<string, SymbolDeclaration>;
  imports: Map<string, SymbolBinding>;
  exports: Map<string, SymbolBinding>;
  stars: string[];
  fallbackReason?: string;
}

function node(value: unknown): AstNode | undefined {
  return value !== null && typeof value === 'object' && 'type' in value
    ? value as AstNode : undefined;
}

function name(value: unknown): string {
  const n = node(value);
  return typeof n?.value === 'string' ? n.value : '';
}

function nodes(value: unknown): AstNode[] {
  return Array.isArray(value) ? value.flatMap((item) => node(item) ? [node(item)!] : []) : [];
}

/** Only prove precision for understood syntax; unsupported code stays file-level. */
export function parseSymbolModule(source: string, file: string): SymbolModule {
  const result: SymbolModule = { declarations: new Map(), imports: new Map(), exports: new Map(), stars: [] };
  const fallback = (reason: string) => { result.fallbackReason ??= reason; };
  const bytes = Buffer.from(source);
  const lineAt = (offset: number) => bytes.subarray(0, offset).toString('utf8').split('\n').length;

  function references(value: unknown, refs: SymbolReference[]): void {
    if (Array.isArray(value)) {
      for (const item of value) references(item, refs);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const n = node(value);
    if (n?.type === 'MemberExpression') {
      const members: string[] = [];
      let current: AstNode | undefined = n;
      while (current?.type === 'MemberExpression') {
        const property = node(current.property);
        const literal = property?.type === 'Computed' ? node(property.expression) : property;
        if (!literal || !['Identifier', 'StringLiteral'].includes(literal.type)
          || (property?.type === 'Computed' && literal.type !== 'StringLiteral')) {
          fallback('dynamic-member');
          break;
        }
        members.unshift(name(literal));
        current = node(current.object);
      }
      if (current?.type === 'Identifier') {
        refs.push({ name: name(current), members });
        return;
      }
      // Call results, optional chains and JSX namespaces need alias/value analysis.
      fallback('unsupported-member');
    }
    if (n?.type === 'Identifier') {
      refs.push({ name: name(n), members: [] });
      return;
    }
    if (n && ['Import', 'JSXMemberExpression', 'OptionalChainingExpression', 'WithStatement'].includes(n.type)) {
      fallback('unsupported-reference');
    }
    if (n?.type === 'CallExpression' && ['eval', 'require'].includes(name(n.callee))) {
      fallback('dynamic-code');
    }
    for (const [key, child] of Object.entries(value)) {
      if (!['span', 'ctxt', 'typeAnnotation', 'typeParameters', 'returnType'].includes(key)) references(child, refs);
    }
  }

  function declaration(n: AstNode, exported: boolean, location: AstNode = n, defaultName?: string): void {
    if (n.type === 'TsInterfaceDeclaration' || n.type === 'TsTypeAliasDeclaration' || n.declare === true) return;
    const items = n.type === 'VariableDeclaration' ? nodes(n.declarations) : [n];
    for (const item of items) {
      const local = defaultName ?? name(item.id ?? item.identifier);
      const value = n.type === 'VariableDeclaration' ? node(item.init) : item;
      if (!local || !value || ![
        'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
        'StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'BigIntLiteral',
      ].includes(value.type) || (n.type === 'VariableDeclaration' && n.kind !== 'const')
        || nodes(value.decorators).length > 0) {
        fallback('top-level-effects');
        continue;
      }
      const span = location.span as { start: number; end: number };
      const refs: SymbolReference[] = [];
      references(value, refs);
      if (result.declarations.has(local)) fallback('duplicate-binding');
      result.declarations.set(local, {
        name: local, startLine: lineAt(span.start - 1), endLine: lineAt(span.end - 2), references: refs,
      });
      if (exported) result.exports.set(defaultName ? 'default' : local, { name: local });
    }
  }

  try {
    const ast = parseSync(source, { syntax: 'typescript', tsx: /\.[jt]sx$/.test(file), target: 'es2022' });
    for (const statement of ast.body) {
      const n = node(statement)!;
      switch (n.type) {
        case 'ImportDeclaration': {
          if (n.typeOnly) break;
          const specifiers = nodes(n.specifiers);
          if (specifiers.length === 0) fallback('side-effect-import');
          for (const s of specifiers) {
            if (s.isTypeOnly) continue;
            const imported = s.type === 'ImportNamespaceSpecifier' ? '*'
              : s.type === 'ImportDefaultSpecifier' ? 'default' : name(s.imported ?? s.local);
            result.imports.set(name(s.local), { name: imported, source: name(n.source) });
          }
          break;
        }
        case 'ExportAllDeclaration':
          if (!n.typeOnly) result.stars.push(name(n.source));
          break;
        case 'ExportNamedDeclaration':
          if (n.typeOnly) break;
          for (const s of nodes(n.specifiers)) {
            if (s.isTypeOnly) continue;
            const namespace = s.type === 'ExportNamespaceSpecifier';
            if (!namespace && s.type !== 'ExportSpecifier') { fallback('unsupported-export'); break; }
            result.exports.set(name(namespace ? s.name : s.exported ?? s.orig), {
              name: namespace ? '*' : name(s.orig), source: name(n.source) || undefined,
            });
          }
          break;
        case 'ExportDeclaration':
          declaration(node(n.declaration)!, true, n);
          break;
        case 'ExportDefaultDeclaration': {
          const decl = node(n.decl)!;
          declaration(decl, true, n, name(decl.identifier) || '#default');
          break;
        }
        case 'ExportDefaultExpression':
          if (node(n.expression)?.type === 'Identifier') result.exports.set('default', { name: name(n.expression) });
          else fallback('unsupported-export');
          break;
        case 'EmptyStatement':
          break;
        default:
          declaration(n, false);
      }
    }
  } catch {
    fallback('symbol-parse-failed');
  }
  return result;
}
