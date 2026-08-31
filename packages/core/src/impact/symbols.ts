import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import type { Edge } from '../graph/types.js';
import { parseSymbolModule, type SymbolModule, type SymbolBinding } from '../parser/symbols.js';
import { changedSymbols, SymbolFallback } from './symbol-diff.js';
import type { ImpactSymbolEvidence } from './types.js';

interface Step { file: string; symbol: string }
interface Origin { file: string; name: string; chain: Step[] }

/** A conservative refinement of file reachability, never a replacement for the graph. */
export class SymbolImpactAnalyzer {
  private outgoing = new Map<string, Edge[]>();
  private incoming = new Map<string, string[]>();
  private modules = new Map<string, { source: string; module: SymbolModule }>();
  private ancestors = new Map<string, Set<string>>();
  private changes = new Map<string, string[] | SymbolFallback>();

  constructor(private root: string, edges: Edge[], private includeTypeOnly = false) {
    for (const edge of edges) {
      const outgoing = this.outgoing.get(edge.source) ?? [];
      outgoing.push(edge);
      this.outgoing.set(edge.source, outgoing);
      const incoming = this.incoming.get(edge.target) ?? [];
      incoming.push(edge.source);
      this.incoming.set(edge.target, incoming);
    }
  }

  private source(file: string): { source: string; module: SymbolModule } {
    let cached = this.modules.get(file);
    if (!cached) {
      try {
        const source = readFileSync(file, 'utf8');
        cached = { source, module: parseSymbolModule(source, file, this.includeTypeOnly) };
        this.modules.set(file, cached);
      } catch {
        throw new SymbolFallback('source-unavailable');
      }
    }
    return cached;
  }

  private module(file: string): SymbolModule {
    const { module } = this.source(file);
    if (module.fallbackReason) throw new SymbolFallback(module.fallbackReason);
    return module;
  }

  private changed(file: string, patch: string | undefined): string[] {
    let symbols = this.changes.get(file);
    if (!symbols) {
      try {
        if (!patch) throw new SymbolFallback('unsupported-diff');
        const { source, module } = this.source(file);
        symbols = changedSymbols(source, patch, file, module, this.includeTypeOnly);
      } catch (error) {
        if (!(error instanceof SymbolFallback)) throw error;
        symbols = error;
      }
      this.changes.set(file, symbols);
    }
    if (symbols instanceof SymbolFallback) throw symbols;
    return symbols;
  }

  isSemanticNoop(file: string, patch: string | undefined): boolean {
    try {
      return this.changed(file, patch).length === 0;
    } catch (error) {
      if (!(error instanceof SymbolFallback)) throw error;
      return false;
    }
  }

  private reverseReachable(file: string): Set<string> {
    const cached = this.ancestors.get(file);
    if (cached) return cached;
    const result = new Set([file]);
    const queue = [file];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const parent of this.incoming.get(queue[cursor]) ?? []) {
        if (!result.has(parent)) { result.add(parent); queue.push(parent); }
      }
    }
    this.ancestors.set(file, result);
    return result;
  }

  /** Undefined means there is no file-level path to refine. */
  evaluate(targetId: string, entries: string[], changedFile: string, patch: string | undefined): ImpactSymbolEvidence | undefined {
    const ancestors = this.reverseReachable(changedFile);
    const roots = entries.filter((file) => ancestors.has(file));
    if (roots.length === 0) return undefined;
    const relativeFile = (file: string) => relative(this.root, file).split(sep).join('/');
    const evidence: ImpactSymbolEvidence = {
      targetId, changedFile: relativeFile(changedFile), precision: 'file', affected: true,
    };
    try {
      if (entries.includes(changedFile)) throw new SymbolFallback('target-file-changed');
      const symbols = this.changed(changedFile, patch);
      evidence.changedSymbols = symbols;

      let budget = 10_000;
      const tick = () => { if (--budget < 0) throw new SymbolFallback('symbol-budget-exceeded'); };
      // Even unused reexports execute their modules. Reject effects anywhere on the
      // file corridor before considering individual declaration references.
      const corridor = [...roots];
      const seenFiles = new Set(roots);
      for (let cursor = 0; cursor < corridor.length; cursor += 1) {
        tick();
        const file = corridor[cursor];
        this.module(file);
        for (const edge of this.outgoing.get(file) ?? []) {
          if (ancestors.has(edge.target) && !seenFiles.has(edge.target)) {
            seenFiles.add(edge.target);
            corridor.push(edge.target);
          }
        }
      }

      const sourceFile = (file: string, source: string): string => {
        const files = new Set((this.outgoing.get(file) ?? [])
          .filter((edge) => edge.specifier === source).map((edge) => edge.target));
        if (files.size !== 1) throw new SymbolFallback('unresolved-source');
        return [...files][0];
      };

      const bind = (file: string, binding: SymbolBinding, members: string[], trail: Set<string>): Origin[] => {
        if (!binding.source) return local(file, binding.name, members, trail);
        const next = sourceFile(file, binding.source);
        if (binding.name === '*') {
          if (members.length === 0) throw new SymbolFallback('namespace-escape');
          return exported(next, members[0], members.slice(1), trail);
        }
        return exported(next, binding.name, members, trail);
      };

      const local = (file: string, name: string, members: string[], trail: Set<string>): Origin[] => {
        tick();
        const module = this.module(file);
        const qualified = [name, ...members].join('.');
        const declaration = module.declarations.get(name);
        if (declaration?.members) {
          if (members.length === 0) throw new SymbolFallback('object-escape');
          if (module.declarations.has(qualified)) return [{ file, name: qualified, chain: [{ file, symbol: qualified }] }];
          throw new SymbolFallback('unresolved-object-member');
        }
        if (module.declarations.has(qualified)) return [{ file, name: qualified, chain: [{ file, symbol: qualified }] }];
        if (declaration) {
          if (members.length > 0) throw new SymbolFallback('unsupported-member');
          return [{ file, name, chain: [{ file, symbol: name }] }];
        }
        const imported = module.imports.get(name);
        if (!imported) throw new SymbolFallback('unresolved-binding');
        return bind(file, imported, members, trail);
      };

      const exported = (file: string, name: string, members: string[], trail: Set<string>): Origin[] => {
        tick();
        const key = JSON.stringify([file, name, members]);
        if (trail.has(key)) throw new SymbolFallback('cyclic-export');
        if (trail.size > 100) throw new SymbolFallback('symbol-depth-exceeded');
        const nextTrail = new Set(trail).add(key);
        const module = this.module(file);
        const explicit = module.exports.get(name);
        const origins = explicit ? bind(file, explicit, members, nextTrail)
          : name === 'default' ? []
            : module.stars.flatMap((source) => exported(sourceFile(file, source), name, members, nextTrail));
        if (new Set(origins.map((origin) => JSON.stringify([origin.file, origin.name]))).size > 1) {
          throw new SymbolFallback('ambiguous-export');
        }
        return origins.slice(0, 1).map((origin) => {
          const step = { file, symbol: [name, ...members].join('.') };
          const first = origin.chain[0];
          return { ...origin, chain: first?.file === file && first.symbol === step.symbol
            ? origin.chain : [step, ...origin.chain] };
        });
      };

      const queue: Origin[] = [];
      for (const file of roots) {
        const module = this.module(file);
        // EntryTarget.symbol is a label, not a scope filter: every declaration in
        // the entry is a root. Reexport-only entries remain conservative.
        if (module.stars.length || [...module.exports.values()].some((binding) => binding.source || module.imports.has(binding.name))) {
          throw new SymbolFallback('reexport-entry');
        }
        for (const name of module.declarations.keys()) queue.push({ file, name, chain: [{ file, symbol: name }] });
      }
      const visited = new Set<string>();
      let witness: Step[] | undefined;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        tick();
        const item = queue[cursor];
        const key = JSON.stringify([item.file, item.name]);
        if (visited.has(key)) continue;
        visited.add(key);
        if (item.file === changedFile && symbols.includes(item.name)) { witness = item.chain; break; }
        const module = this.module(item.file);
        for (const ref of module.declarations.get(item.name)!.references) {
          if (!module.declarations.has(ref.name) && !module.imports.has(ref.name)) continue;
          // Dependencies outside the reverse corridor cannot reach this change.
          const imported = module.imports.get(ref.name);
          if (imported?.source && !ancestors.has(sourceFile(item.file, imported.source))) continue;
          const origins = local(item.file, ref.name, ref.members, new Set());
          if (origins.length === 0) throw new SymbolFallback('unresolved-export');
          for (const origin of origins) {
            if (ancestors.has(origin.file)) queue.push({ ...origin, chain: [...item.chain, ...origin.chain] });
          }
        }
      }
      evidence.precision = 'symbol';
      evidence.affected = Boolean(witness);
      if (witness) evidence.chain = witness.map((step) => ({ ...step, file: relativeFile(step.file) }));
    } catch (error) {
      if (!(error instanceof SymbolFallback)) throw error;
      evidence.fallbackReason = error.message;
    }
    return evidence;
  }
}
