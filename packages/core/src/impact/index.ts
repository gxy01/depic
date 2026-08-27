import { resolve, relative, sep } from 'node:path';
import { analyze } from '../analyze.js';
import type { DependencyGraph } from '../graph/index.js';
import type { Edge } from '../graph/types.js';
import { loadDepicConfig } from '../config.js';
import type {
  ImpactDiagnostic,
  ImpactOptions,
  ImpactReport,
  ImpactTarget,
  TargetImpact,
} from './types.js';

const DEFAULT_MAX_CHAINS_PER_TARGET = 20;
const DEFAULT_MAX_TOTAL_CHAINS = 10_000;
const DEFAULT_GLOBAL_IMPACT_PATTERNS = [
  'depic.config.json',
  'package.json',
  'tsconfig.json',
  'tsconfig.*.json',
  'vite.config.*',
  'webpack.config.*',
  'next.config.*',
  'nuxt.config.*',
  'angular.json',
];

interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

interface ValidTarget {
  target: ImpactTarget;
  entryFiles: string[];
}

/**
 * 根据 unified diff 和上游提供的影响目标，计算可能受影响的入口或 package。
 */
export async function analyzeImpact(options: ImpactOptions): Promise<ImpactReport> {
  const root = resolve(options.root);
  const impactConfig = loadDepicConfig(root)?.impact;
  const diagnostics: ImpactDiagnostic[] = [];
  const excludePatterns = normalizeChangedFilePatterns(
    options.excludeChangedFiles ?? impactConfig?.excludeChangedFiles ?? [],
  );
  const excludedFiles = new Set<string>();
  const diffFiles = parseUnifiedDiff(options.diff).filter((file) => {
    if (!excludePatterns.some((pattern) => matchGlob(file.path, pattern))) return true;
    excludedFiles.add(file.path);
    return false;
  });
  if (excludedFiles.size > 0) {
    diagnostics.push({
      level: 'warning',
      code: 'excluded-changed-files',
      message: 'Changes matching excludeChangedFiles were not analyzed; excluded does not mean unaffected.',
      files: [...excludedFiles].sort(),
    });
  }
  const suppliedTargets = options.targets ?? impactConfig?.targets ?? [];

  if (suppliedTargets.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'empty-targets',
      message: 'No impact targets were provided; no impacted targets can be identified.',
    });
  }

  const normalizedTargets = normalizeTargets(suppliedTargets, root);
  const graph = await analyze({
    root,
    include: options.include,
    exclude: options.exclude,
    tsconfigPath: options.tsconfigPath,
    extensions: options.extensions,
    workspace: options.workspace,
    symbolLevel: true,
  });
  const targets = validateTargets(normalizedTargets, graph, root, diagnostics);

  const currentDiffFiles = diffFiles
    .filter((file) => file.status === 'added' || file.status === 'modified')
    .map((file) => file.path);
  const globalPatterns = [
    ...DEFAULT_GLOBAL_IMPACT_PATTERNS,
    ...(options.globalImpactPatterns ?? impactConfig?.globalImpactPatterns ?? []),
  ];
  const globalChangedFiles = [...new Set(currentDiffFiles)]
    .filter((file) => globalPatterns.some((pattern) => matchGlob(file, pattern)))
    .sort();

  const changedFiles: string[] = [];
  for (const file of diffFiles) {
    if (file.status === 'deleted' || file.status === 'renamed') {
      diagnostics.push({
        level: 'warning',
        code: file.status === 'deleted' ? 'deleted-file' : 'renamed-file',
        message: `${file.status === 'deleted' ? 'Deleted' : 'Renamed'} file ${file.path} requires a baseline dependency graph for precise impact analysis.`,
        files: [file.path],
      });
      continue;
    }
    if (globalChangedFiles.includes(file.path)) {
      changedFiles.push(file.path);
      continue;
    }
    const absolutePath = toAbsolutePath(root, file.path);
    if (graph.getFileNode(absolutePath)) {
      changedFiles.push(file.path);
    } else {
      diagnostics.push({
        level: 'warning',
        code: 'unmapped-file',
        message: `Changed file ${file.path} is not present in the dependency graph.`,
        files: [file.path],
      });
    }
  }

  const stableChangedFiles = [...new Set(changedFiles)].sort();
  if (globalChangedFiles.length > 0) {
    return {
      totalTargetCount: targets.length,
      impactedTargetCount: targets.length,
      changedFiles: stableChangedFiles,
      impacts: targets.map(({ target }) => ({
        target,
        impact: 'global',
        changedFiles: globalChangedFiles,
        dependencyChains: [],
        pathCount: 0,
        truncated: false,
      })),
      diagnostics,
      truncated: false,
    };
  }

  const changedAbsoluteFiles = new Set(stableChangedFiles.map((file) => toAbsolutePath(root, file)));
  const maxChainsPerTarget = options.maxChainsPerTarget
    ?? impactConfig?.maxChainsPerTarget
    ?? DEFAULT_MAX_CHAINS_PER_TARGET;
  const maxTotalChains = options.maxTotalChains
    ?? impactConfig?.maxTotalChains
    ?? DEFAULT_MAX_TOTAL_CHAINS;
  if (maxChainsPerTarget < 1 || maxTotalChains < 1) {
    throw new Error('maxChainsPerTarget and maxTotalChains must both be at least 1.');
  }

  let totalChainCount = 0;
  let reportTruncated = false;
  const impacts: TargetImpact[] = [];

  for (const target of targets) {
    const result = findTargetImpact(
      target,
      graph,
      changedAbsoluteFiles,
      options.includeTypeOnly ?? impactConfig?.includeTypeOnly ?? false,
      maxChainsPerTarget,
      maxTotalChains - totalChainCount,
    );
    totalChainCount += result.chains.length;
    reportTruncated ||= result.truncated;

    if (result.chains.length === 0) continue;
    const changedForTarget = [...new Set(
      result.chains.map((chain) => relativePath(root, chain[chain.length - 1])),
    )].sort();
    const isDirect = result.chains.some((chain) => isDirectImpactChain(chain, graph));
    impacts.push({
      target: target.target,
      impact: isDirect ? 'direct' : 'transitive',
      changedFiles: changedForTarget,
      dependencyChains: result.chains.map((chain) => chain.map((file) => relativePath(root, file))),
      pathCount: result.chains.length,
      truncated: result.truncated,
    });
  }

  if (reportTruncated) {
    diagnostics.push({
      level: 'warning',
      code: 'chain-limit-reached',
      message: 'Dependency chain limits were reached; the report is truncated.',
    });
  }

  return {
    totalTargetCount: targets.length,
    impactedTargetCount: impacts.length,
    changedFiles: stableChangedFiles,
    impacts: impacts.sort((a, b) => a.target.id.localeCompare(b.target.id)),
    diagnostics,
    truncated: reportTruncated,
  };
}

function normalizeTargets(targets: ImpactTarget[], root: string): ValidTarget[] {
  const byId = new Map<string, ValidTarget>();
  for (const target of targets) {
    if (!target.id) throw new Error('Every impact target must provide a non-empty id.');
    const normalizedTarget: ImpactTarget = target.kind === 'entry'
      ? { ...target, file: relativePath(root, toAbsolutePath(root, target.file)) }
      : { ...target };
    const existing = byId.get(target.id);
    if (existing) {
      if (JSON.stringify(existing.target) !== JSON.stringify(normalizedTarget)) {
        throw new Error(`Conflicting impact targets for id "${target.id}".`);
      }
      continue;
    }
    byId.set(target.id, { target: normalizedTarget, entryFiles: [] });
  }
  return [...byId.values()].sort((a, b) => a.target.id.localeCompare(b.target.id));
}

function validateTargets(
  targets: ValidTarget[],
  graph: DependencyGraph,
  root: string,
  diagnostics: ImpactDiagnostic[],
): ValidTarget[] {
  return targets.filter((item) => {
    const target = item.target;
    if (target.kind === 'entry') {
      const absoluteFile = toAbsolutePath(root, target.file);
      if (graph.getFileNode(absoluteFile)) {
        item.entryFiles = [absoluteFile];
        return true;
      }
      diagnostics.push({
        level: 'warning',
        code: 'missing-entry-file',
        message: `Entry target "${target.id}" points to ${target.file}, which is not present in the dependency graph.`,
        files: [target.file],
      });
      return false;
    }

    item.entryFiles = graph.files()
      .filter((file) => file.package === target.package)
      .map((file) => file.id)
      .sort();
    if (item.entryFiles.length > 0) return true;
    diagnostics.push({
      level: 'warning',
      code: 'missing-package',
      message: `Package target "${target.id}" (${target.package}) has no files in the dependency graph.`,
    });
    return false;
  });
}

function findTargetImpact(
  target: ValidTarget,
  graph: DependencyGraph,
  changedFiles: Set<string>,
  includeTypeOnly: boolean,
  maxChainsPerTarget: number,
  remainingTotalChains: number,
): { chains: string[][]; truncated: boolean } {
  const chains: string[][] = [];
  if (changedFiles.size === 0) return { chains, truncated: false };
  const chainLimit = Math.min(maxChainsPerTarget, remainingTotalChains);
  if (chainLimit < 1) return { chains, truncated: true };

  const entryFiles = [...target.entryFiles].sort((a, b) =>
    Number(changedFiles.has(b)) - Number(changedFiles.has(a)) || a.localeCompare(b),
  );
  const queue: string[][] = [];
  const bestDepth = new Map<string, number>();

  for (const entryFile of entryFiles) {
    if (changedFiles.has(entryFile)) {
      if (chains.length >= chainLimit) return { chains, truncated: true };
      chains.push([entryFile]);
      continue;
    }
    queue.push([entryFile]);
    bestDepth.set(entryFile, 0);
  }

  if (chains.length >= chainLimit) {
    return { chains, truncated: queue.length > 0 };
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const path = queue[cursor];
    cursor += 1;
    const current = path[path.length - 1];
    const seenTargets = new Set<string>();
    const edges = graph.getDependencies(current)
      .filter((edge) => graph.getFileNode(edge.target))
      .filter((edge) => includeTypeOnly || !isTypeOnlyEdge(edge, graph))
      .sort((a, b) => a.target.localeCompare(b.target));

    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const edge = edges[edgeIndex];
      if (seenTargets.has(edge.target) || path.includes(edge.target)) continue;
      seenTargets.add(edge.target);
      const nextPath = [...path, edge.target];
      if (changedFiles.has(edge.target)) {
        chains.push(nextPath);
        if (chains.length >= chainLimit) {
          const hasUnexploredPaths = edgeIndex < edges.length - 1 || cursor < queue.length;
          chains.sort(compareChains);
          return { chains, truncated: hasUnexploredPaths };
        }
        continue;
      }

      const depth = nextPath.length - 1;
      const knownDepth = bestDepth.get(edge.target);
      if (knownDepth !== undefined && knownDepth < depth) continue;
      if (knownDepth === undefined || depth < knownDepth) {
        bestDepth.set(edge.target, depth);
      }
      queue.push(nextPath);
    }
  }

  chains.sort(compareChains);
  return { chains, truncated: false };
}

function isTypeOnlyEdge(edge: Edge, graph: DependencyGraph): boolean {
  const source = graph.getFileNode(edge.source);
  if (!source) return false;
  if (edge.kind === 're-export') {
    const exports = source.exports.filter((exp) => exp.reExportFrom === edge.specifier);
    return exports.length > 0 && exports.every((exp) => exp.isTypeOnly);
  }
  const imports = source.imports.filter(
    (imp) => imp.resolvedFile === edge.target && imp.specifier === edge.specifier,
  );
  return imports.length > 0 && imports.every((imp) => imp.isTypeOnly);
}

function isDirectImpactChain(chain: string[], graph: DependencyGraph): boolean {
  let effectiveHopCount = 0;
  for (let index = 0; index < chain.length - 1; index += 1) {
    const source = chain[index];
    const target = chain[index + 1];
    const isReExportHop = graph.getDependencies(source)
      .some((edge) => edge.target === target && edge.kind === 're-export');
    if (!isReExportHop) effectiveHopCount += 1;
  }
  return effectiveHopCount <= 1;
}

function compareChains(a: string[], b: string[]): number {
  return a.length - b.length || a.join('\0').localeCompare(b.join('\0'));
}

function parseUnifiedDiff(diff: string): DiffFile[] {
  if (!diff.trim()) return [];
  const blocks = diff.split(/^diff --git /m).filter(Boolean);
  if (blocks.length === 0) {
    throw new Error('Invalid unified diff: expected one or more "diff --git" headers.');
  }

  const files: DiffFile[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const header = lines[0]?.trim();
    const headerMatch = header.match(/^a\/(.+) b\/(.+)$/);
    if (!headerMatch) {
      throw new Error('Invalid unified diff: malformed "diff --git" header.');
    }
    const oldPath = headerMatch[1];
    const defaultNewPath = headerMatch[2];
    const oldMarker = lines.find((line) => line.startsWith('--- '));
    const newMarker = lines.find((line) => line.startsWith('+++ '));
    const renameFrom = lines.find((line) => line.startsWith('rename from '));
    const renameTo = lines.find((line) => line.startsWith('rename to '));
    const isDeleted = newMarker === '+++ /dev/null';
    const isAdded = oldMarker === '--- /dev/null';
    const isRenamed = Boolean(renameFrom || renameTo) || oldPath !== defaultNewPath;
    const path = isDeleted ? oldPath : defaultNewPath;
    files.push({
      path: normalizeRelativePath(path),
      status: isRenamed ? 'renamed' : isDeleted ? 'deleted' : isAdded ? 'added' : 'modified',
    });
  }
  return files;
}

function toAbsolutePath(root: string, file: string): string {
  const normalized = normalizeRelativePath(file);
  const absolute = resolve(root, normalized);
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  if (absolute !== root && !absolute.startsWith(rootPrefix)) {
    throw new Error(`Path "${file}" is outside the analysis root.`);
  }
  return absolute;
}

function normalizeRelativePath(file: string): string {
  const normalized = file.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!normalized || normalized === '/dev/null' || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Path "${file}" must be relative to the analysis root.`);
  }
  return normalized;
}

function relativePath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
}

function normalizeChangedFilePatterns(patterns: unknown): string[] {
  if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== 'string')) {
    throw new Error('excludeChangedFiles must be an array of root-relative glob strings.');
  }
  return patterns.map((pattern: string) => {
    const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized.trim() || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)
      || normalized.split('/').includes('..')) {
      throw new Error(`excludeChangedFiles pattern "${pattern}" must be a non-empty root-relative glob.`);
    }
    return normalized;
  });
}

function matchGlob(file: string, pattern: string): boolean {
  let regex = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') {
        regex += '(?:.*/)?';
        index += 1;
      } else {
        regex += '.*';
      }
    } else if (character === '*') {
      regex += '[^/]*';
    } else {
      regex += character.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${regex}$`).test(file);
}
