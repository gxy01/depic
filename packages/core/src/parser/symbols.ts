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
  kind: 'value' | 'type';
  startLine: number;
  endLine: number;
  references: SymbolReference[];
  /** Statically modeled members for a safe object-literal declaration. */
  members?: string[];
}

export interface SymbolBinding {
  name: string;
  source?: string;
  isTypeOnly?: boolean;
}

/** Internal proof metadata, separate from the public file-level graph. */
export interface SymbolModule {
  declarations: Map<string, SymbolDeclaration>;
  imports: Map<string, SymbolBinding>;
  exports: Map<string, SymbolBinding>;
  stars: string[];
  typeStars: string[];
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

function supportedDeclarationValue(value: AstNode): boolean {
  if ([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
    'StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'BigIntLiteral', 'ObjectExpression',
  ].includes(value.type)) return true;
  // A static member call is traceable to that member. Bare calls remain
  // conservative because they can hide arbitrary module-initialization effects.
  return value.type === 'CallExpression' && node(value.callee)?.type === 'MemberExpression';
}

/** Only prove precision for understood syntax; unsupported code stays file-level. */
export function parseSymbolModule(source: string, file: string, includeTypeOnly = false): SymbolModule {
  const result: SymbolModule = { declarations: new Map(), imports: new Map(), exports: new Map(), stars: [], typeStars: [] };
  const fallback = (reason: string) => { result.fallbackReason ??= reason; };
  const bind = (bindings: Map<string, SymbolBinding>, key: string, binding: SymbolBinding) => {
    if (bindings.has(key)) fallback('duplicate-binding');
    if (bindings === result.imports && result.declarations.has(key)) fallback('duplicate-binding');
    bindings.set(key, binding);
  };
  const bytes = Buffer.from(source);
  const lineAt = (offset: number) => bytes.subarray(0, offset).toString('utf8').split('\n').length;

  function references(value: unknown, refs: SymbolReference[]): void {
    if (Array.isArray(value)) {
      for (const item of value) references(item, refs);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const n = node(value);
    if (n?.type === 'AssignmentExpression' && node(n.left)?.type === 'MemberExpression') fallback('member-mutation');
    if (n?.type === 'UpdateExpression' && node(n.argument)?.type === 'MemberExpression') fallback('member-mutation');
    if (n?.type === 'UnaryExpression' && n.operator === 'delete' && node(n.argument)?.type === 'MemberExpression') {
      fallback('member-mutation');
    }
    if (n && ['ThisExpression', 'Super'].includes(n.type)) fallback('object-escape');
    if (includeTypeOnly && n && [
      'TsIndexedAccessType', 'TsConditionalType', 'TsMappedType', 'TsInferType', 'TsImportType',
    ].includes(n.type)) fallback('unsupported-type');
    if (includeTypeOnly && n?.type === 'TsQualifiedName') {
      const members: string[] = [];
      let current: AstNode | undefined = n;
      while (current?.type === 'TsQualifiedName') {
        members.unshift(name(current.right));
        current = node(current.left);
      }
      if (current?.type === 'Identifier') refs.push({ name: name(current), members });
      else fallback('unsupported-type');
      return;
    }
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
      if (includeTypeOnly) references(n.typeAnnotation, refs);
      return;
    }
    if (n && ['Import', 'JSXMemberExpression', 'OptionalChainingExpression', 'WithStatement'].includes(n.type)) {
      fallback('unsupported-reference');
    }
    if (n?.type === 'CallExpression' && ['eval', 'require'].includes(name(n.callee))) {
      fallback('dynamic-code');
    }
    for (const [key, child] of Object.entries(value)) {
      if (['span', 'ctxt'].includes(key)) continue;
      if (!includeTypeOnly && ['typeAnnotation', 'typeParameters', 'typeParams', 'returnType', 'typeArguments'].includes(key)) continue;
      references(child, refs);
    }
  }

  function declaration(n: AstNode, exported: boolean, location: AstNode = n, defaultName?: string): void {
    const isType = n.type === 'TsInterfaceDeclaration' || n.type === 'TsTypeAliasDeclaration';
    if (isType && !includeTypeOnly) return;
    if (n.declare === true && !isType) { if (includeTypeOnly) fallback('unsupported-type'); return; }
    const items = n.type === 'VariableDeclaration' ? nodes(n.declarations) : [n];
    for (const item of items) {
      const local = defaultName ?? name(item.id ?? item.identifier);
      const value = n.type === 'VariableDeclaration' ? node(item.init) : item;
      if (!local || !value || (!isType && !supportedDeclarationValue(value))
        || (n.type === 'VariableDeclaration' && n.kind !== 'const')
        || nodes(value.decorators).length > 0) {
        fallback('top-level-effects');
        continue;
      }
      const span = location.span as { start: number; end: number };
      const refs: SymbolReference[] = [];
      const memberNames: string[] = [];
      if (value.type === 'ObjectExpression') {
        for (const property of nodes(value.properties)) {
          if (['GetterProperty', 'SetterProperty'].includes(property.type)) {
            fallback('object-accessor');
            continue;
          }
          if (property.type === 'SpreadElement') {
            fallback('object-spread');
            continue;
          }
          if (!['KeyValueProperty', 'MethodProperty'].includes(property.type)) {
            fallback('unsupported-object-member');
            continue;
          }
          const propertyKey = node(property.key);
          const literal = propertyKey?.type === 'Computed' ? node(propertyKey.expression) : propertyKey;
          if (!literal || !['Identifier', 'StringLiteral'].includes(literal.type)
            || (propertyKey?.type === 'Computed' && literal.type !== 'StringLiteral')) {
            fallback('dynamic-member');
            continue;
          }
          const member = name(literal);
          const memberValue = property.type === 'KeyValueProperty' ? node(property.value) : property;
          if (!member || !memberValue || (property.type === 'KeyValueProperty' && ![
            'FunctionExpression', 'ArrowFunctionExpression',
            'StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'BigIntLiteral',
          ].includes(memberValue.type)) || memberNames.includes(member)) {
            fallback(memberNames.includes(member) ? 'duplicate-binding' : 'unsupported-object-member');
            continue;
          }
          const memberRefs: SymbolReference[] = [];
          references(property.type === 'MethodProperty' ? property.body : memberValue, memberRefs);
          const keySpan = literal.span as { start: number; end: number };
          const valueSpan = memberValue.span as { start: number; end: number };
          const qualified = `${local}.${member}`;
          result.declarations.set(qualified, {
            name: qualified,
            kind: 'value',
            startLine: lineAt(keySpan.start - 1),
            endLine: lineAt(valueSpan.end - 2),
            references: memberRefs,
          });
          memberNames.push(member);
        }
      } else {
        references(value, refs);
      }
      if (includeTypeOnly && n.type === 'VariableDeclaration') references(node(item.id)?.typeAnnotation, refs);
      if (result.declarations.has(local) || result.imports.has(local)) fallback('duplicate-binding');
      result.declarations.set(local, {
        name: local, kind: isType ? 'type' : 'value', startLine: lineAt(span.start - 1), endLine: lineAt(span.end - 2), references: refs,
        ...(value.type === 'ObjectExpression' ? { members: memberNames } : {}),
      });
      if (exported) bind(result.exports, defaultName ? 'default' : local, { name: local });
    }
  }

  try {
    const ast = parseSync(source, { syntax: 'typescript', tsx: /\.[jt]sx$/.test(file), target: 'es2022' });
    for (const statement of ast.body) {
      const n = node(statement)!;
      switch (n.type) {
        case 'ImportDeclaration': {
          if (n.typeOnly && !includeTypeOnly) break;
          const specifiers = nodes(n.specifiers);
          if (specifiers.length === 0) fallback('side-effect-import');
          for (const s of specifiers) {
            if (s.isTypeOnly && !includeTypeOnly) continue;
            const imported = s.type === 'ImportNamespaceSpecifier' ? '*'
              : s.type === 'ImportDefaultSpecifier' ? 'default' : name(s.imported ?? s.local);
            bind(result.imports, name(s.local), {
              name: imported, source: name(n.source),
              ...(n.typeOnly || s.isTypeOnly ? { isTypeOnly: true } : {}),
            });
          }
          break;
        }
        case 'ExportAllDeclaration':
          if (!n.typeOnly || includeTypeOnly) result.stars.push(name(n.source));
          if (n.typeOnly && includeTypeOnly) result.typeStars.push(name(n.source));
          break;
        case 'ExportNamedDeclaration':
          if (n.typeOnly && !includeTypeOnly) break;
          for (const s of nodes(n.specifiers)) {
            if (s.isTypeOnly && !includeTypeOnly) continue;
            const namespace = s.type === 'ExportNamespaceSpecifier';
            if (!namespace && s.type !== 'ExportSpecifier') { fallback('unsupported-export'); break; }
            bind(result.exports, name(namespace ? s.name : s.exported ?? s.orig), {
              name: namespace ? '*' : name(s.orig), source: name(n.source) || undefined,
              ...(n.typeOnly || s.isTypeOnly ? { isTypeOnly: true } : {}),
            });
          }
          break;
        case 'ExportDeclaration':
          declaration(node(n.declaration)!, true, n);
          break;
        case 'ExportDefaultDeclaration': {
          const decl = node(n.decl)!;
          declaration(decl, true, n, name(decl.identifier ?? decl.id) || '#default');
          break;
        }
        case 'ExportDefaultExpression':
          if (node(n.expression)?.type === 'Identifier') bind(result.exports, 'default', { name: name(n.expression) });
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
