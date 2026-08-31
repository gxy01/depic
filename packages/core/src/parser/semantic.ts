import { parseSync, type ModuleItem } from '@swc/core';

interface LiteralRange { start: number; end: number }
interface DeclarationRange extends LiteralRange { identity: string }

/** Keep literal spelling and all runtime/type fields; remove only parser positions. */
function normalize(value: unknown, literals: LiteralRange[]): unknown {
  if (Array.isArray(value)) return value.map((item) => normalize(item, literals));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (['StringLiteral', 'RegExpLiteral', 'TemplateElement', 'JSXText'].includes(String(record.type))) {
    const span = record.span as { start: number; end: number };
    literals.push({ start: span.start - 1, end: span.end - 1 });
  }
  return Object.fromEntries(Object.entries(record)
    .filter(([key]) => key !== 'span' && key !== 'ctxt')
    .map(([key, child]) => [key, normalize(child, literals)]));
}

/** Named declarations keep their identity when their body/type grows. */
function declarationRange(item: ModuleItem): DeclarationRange {
  const node = item.type === 'ExportDeclaration' ? item.declaration : item;
  let names: string[] | undefined;
  switch (node.type) {
    case 'TsInterfaceDeclaration':
    case 'TsTypeAliasDeclaration':
      names = [node.id.value];
      break;
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      names = [node.identifier.value];
      break;
    case 'VariableDeclaration':
      if (node.declarations.every((decl) => decl.id.type === 'Identifier')) {
        names = node.declarations.map((decl) => (decl.id as { value: string }).value);
      }
      break;
  }
  // Unrecognized/anonymous statements keep their entire structure: no guessed identity.
  const identity = JSON.stringify(names ? [item.type, node.type, names] : normalize(item, []));
  return { start: item.span.start - 1, end: item.span.end - 1, identity };
}

function ordinaryComment(text: string, raw: string): boolean {
  if (raw.startsWith('///') || /@|#__\w+__/.test(text)
    || /\b(?:webpack\w*|vite\w*|rollup\w*|eslint\w*|oxlint\w*|jshint|jslint|global|globals|exported|prettier|biome|istanbul|c8|v8|coverage|sourceMappingURL|sourceURL|jsx\w*|flow|deno|bun|pure|pragma)\b/i.test(text)) return false;
  // Only inline HTTP(S) links with plain labels. Do not whitelist [] or other
  // markup wholesale; annotations, malformed links and unknown syntax stay protected.
  const prose = text.replace(/\[([\p{L}\p{N}\s.,:;/?=()'"-]+)\]\((https?:\/\/[^\s()[\]{}<>\\]+)\)/gu, (link, label: string, href: string) => {
    try {
      const url = new URL(href);
      return url.hostname && !url.username && !url.password ? label : link;
    } catch {
      return link;
    }
  });
  return /^[\p{L}\p{N}\s.,:;/?=()'"-]*$/u.test(prose);
}

/**
 * Scan trivia outside AST-identified literals. Do not strip comments with regex:
 * URLs, regular expressions, template quasis and JSX text are not comments.
 */
function protectedComments(source: string, literals: LiteralRange[], declarations: DeclarationRange[]): string {
  const bytes = Buffer.from(source);
  const ranges = literals.sort((a, b) => a.start - b.start);
  const comments: unknown[] = [];
  let rangeIndex = 0;
  let declarationIndex = 0;
  let codeOffset = 0;
  const whitespace = (index: number) => [9, 10, 11, 12, 13, 32].includes(bytes[index]);
  for (let index = 0; index < bytes.length;) {
    while (ranges[rangeIndex]?.end <= index) rangeIndex += 1;
    const range = ranges[rangeIndex];
    if (range && range.start <= index && index < range.end) {
      codeOffset += range.end - index;
      index = range.end;
      continue;
    }
    if (bytes[index] === 47 && [47, 42].includes(bytes[index + 1])) {
      const start = index;
      const block = bytes[index + 1] === 42;
      index += 2;
      if (block) {
        while (index < bytes.length && !(bytes[index] === 42 && bytes[index + 1] === 47)) index += 1;
        if (index === bytes.length) throw new Error('Unterminated comment');
        index += 2;
      } else {
        while (index < bytes.length && ![10, 13].includes(bytes[index])) index += 1;
      }
      const raw = bytes.subarray(start, index).toString('utf8');
      const text = raw.slice(2, block ? -2 : undefined).replace(/^\s*\* ?/gm, '').trim();
      if (!ordinaryComment(text, raw)) {
        let before = start;
        let after = index;
        while (before > 0 && whitespace(before - 1)) before -= 1;
        while (after < bytes.length && whitespace(after)) after += 1;
        while (declarations[declarationIndex]?.end <= start) declarationIndex += 1;
        const previous = declarations[declarationIndex - 1];
        const next = declarations[declarationIndex];
        // Only gaps between top-level declarations have a proven attachment.
        // Inside expressions/bodies retain the strict code-offset fallback.
        const inGap = !next || index <= next.start;
        const rangeDirective = /^(?:(?:eslint|oxlint)-(?:disable|enable)|@ts-(?:nocheck|check))(?:\s|$)/.test(text);
        const lines = (from: number, to: number) => bytes.subarray(from, to).toString('utf8').split(/\r\n|[\r\n]/).length - 1;
        const attachment = inGap ? {
          boundary: declarationIndex,
          previous: previous?.identity ?? null,
          next: next?.identity ?? null,
          // Next-line directives and unknown markup also retain physical-line
          // placement across intervening prose comments, not just whitespace.
          linesBefore: rangeDirective ? null : lines(previous?.end ?? 0, start),
          linesAfter: rangeDirective ? null : lines(index, next?.start ?? bytes.length),
        } : { codeOffset };
        comments.push({
          raw, attachment,
          before: bytes.subarray(before, start).toString('utf8'),
          after: bytes.subarray(index, after).toString('utf8'),
        });
      }
      continue;
    }
    if (!whitespace(index)) codeOffset += 1;
    index += 1;
  }
  return JSON.stringify(comments);
}

export function compareSourceStructure(before: string, after: string, file: string): {
  equivalent: boolean;
  protectedCommentsChanged: boolean;
} {
  const parse = (source: string) => {
    const ast = parseSync(source, { syntax: 'typescript', tsx: /\.[jt]sx$/.test(file), target: 'es2022' });
    const literals: LiteralRange[] = [];
    const structure = JSON.stringify(normalize(ast, literals));
    return { structure, comments: protectedComments(source, literals, ast.body.map(declarationRange)) };
  };
  const previous = parse(before);
  const current = parse(after);
  return {
    equivalent: previous.structure === current.structure && previous.comments === current.comments,
    protectedCommentsChanged: previous.comments !== current.comments,
  };
}
