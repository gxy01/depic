import { parseSymbolModule, type SymbolModule } from '../parser/symbols.js';
import { compareSourceStructure } from '../parser/semantic.js';

export class SymbolFallback extends Error {}

/** Reverse a checked unified patch. Never infer changed symbols from hunk headers alone. */
export function changedSymbols(source: string, patch: string, file: string, current: SymbolModule, includeTypeOnly = false): string[] {
  const lines = source.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const old: string[] = [];
  const oldChanged: number[] = [];
  const newChanged: number[] = [];
  const patchLines = patch.split('\n');
  let cursor = 0;
  let hunks = 0;
  for (let i = 0; i < patchLines.length; i += 1) {
    const header = patchLines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!header) {
      if (patchLines[i].startsWith('@@') || patchLines[i].startsWith('\\')) throw new SymbolFallback('unsupported-diff');
      if (hunks > 0 && /^[ +-]/.test(patchLines[i])) throw new SymbolFallback('unsupported-diff');
      continue;
    }
    hunks += 1;
    const oldCount = Number(header[2] ?? 1);
    const newCount = Number(header[4] ?? 1);
    if ((oldCount > 0 && Number(header[1]) === 0) || (newCount > 0 && Number(header[3]) === 0)) {
      throw new SymbolFallback('unsupported-diff');
    }
    const start = Number(header[3]) - (newCount === 0 ? 0 : 1);
    if (start < cursor || start > lines.length) throw new SymbolFallback('diff-source-mismatch');
    old.push(...lines.slice(cursor, start));
    cursor = start;
    if (old.length !== Number(header[1]) - (oldCount === 0 ? 0 : 1)) throw new SymbolFallback('diff-source-mismatch');
    let consumedOld = 0;
    let consumedNew = 0;
    while (consumedOld < oldCount || consumedNew < newCount) {
      const line = patchLines[++i];
      if (!line || ![' ', '+', '-'].includes(line[0])) throw new SymbolFallback('unsupported-diff');
      const text = line.slice(1);
      if (line[0] !== '-') {
        if (lines[cursor] !== text) throw new SymbolFallback('diff-source-mismatch');
        cursor += 1;
        consumedNew += 1;
        if (line[0] === '+') newChanged.push(cursor);
      }
      if (line[0] !== '+') {
        old.push(text);
        consumedOld += 1;
        if (line[0] === '-') oldChanged.push(old.length);
      }
      if (consumedOld > oldCount || consumedNew > newCount) throw new SymbolFallback('unsupported-diff');
    }
  }
  if (hunks === 0 || oldChanged.length + newChanged.length === 0) throw new SymbolFallback('missing-diff-hunks');
  old.push(...lines.slice(cursor));
  const previousSource = old.join('\n');
  try {
    const comparison = compareSourceStructure(previousSource, source, file);
    if (comparison.protectedCommentsChanged) throw new SymbolFallback('directive-comment-changed');
    // An empty set is a checked AST no-op, not a missing/unmapped declaration.
    if (comparison.equivalent) return [];
  } catch (error) {
    if (error instanceof SymbolFallback) throw error;
    throw new SymbolFallback('semantic-parse-failed');
  }
  const previous = parseSymbolModule(previousSource, file, includeTypeOnly);
  if (previous.fallbackReason) throw new SymbolFallback(previous.fallbackReason);
  if (current.fallbackReason) throw new SymbolFallback(current.fallbackReason);
  const shape = (m: SymbolModule) => JSON.stringify({
    imports: [...m.imports], exports: [...m.exports], stars: m.stars, typeStars: m.typeStars,
    declarations: [...m.declarations.values()].map((decl) => [decl.name, decl.kind]).sort(),
  });
  if (shape(previous) !== shape(current)) throw new SymbolFallback('module-shape-changed');
  const changed = new Set<string>();
  for (const [module, touched] of [[previous, oldChanged], [current, newChanged]] as const) {
    for (const line of touched) {
      const declarations = [...module.declarations.values()].filter((decl) => decl.startLine <= line && line <= decl.endLine);
      if (declarations.length === 0) throw new SymbolFallback('change-outside-declaration');
      for (const decl of declarations) changed.add(decl.name);
    }
  }
  return [...changed].sort();
}
