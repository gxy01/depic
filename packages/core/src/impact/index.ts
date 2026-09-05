import { extname, resolve, relative, sep } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { analyze, DEFAULT_ANALYZE_INCLUDE, matchesAnalyzeGlob } from '../analyze.js';
import type { DependencyGraph } from '../graph/index.js';
import type { Edge } from '../graph/types.js';
import { applyDepicConfig, loadDepicConfig } from '../config.js';
import { DEFAULT_RESOLVE_EXTENSIONS } from '../resolver/index.js';
import { parseFile } from '../parser/index.js';
import { SymbolImpactAnalyzer } from './symbols.js';
import type {
  ImpactDiagnostic,
  ImpactOptions,
  ImpactReport,
  ImpactTarget,
  TargetImpact,
  ImpactSymbolEvidence,
  ImpactUnresolvedChange,
} from './types.js';

const DEFAULT_MAX_CHAINS_PER_TARGET = 20;
const DEFAULT_MAX_TOTAL_CHAINS = 10_000;
const GIT_SIMPLE_ESCAPES: Readonly<Record<string, number>> = {
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
  '\\': 0x5c,
  '"': 0x22,
};
const DEFAULT_GLOBAL_IMPACT_PATTERNS = [
  'depic.config.json',
  'package.json',
  '**/package.json',
  'tsconfig.json',
  'tsconfig.*.json',
  '**/tsconfig.json',
  '**/tsconfig.*.json',
  'jsconfig.json',
  'jsconfig.*.json',
  '**/jsconfig.json',
  '**/jsconfig.*.json',
  'pnpm-workspace.yaml',
  '**/pnpm-workspace.yaml',
  'yarn.lock',
  '**/yarn.lock',
  'package-lock.json',
  '**/package-lock.json',
  'npm-shrinkwrap.json',
  '**/npm-shrinkwrap.json',
  'bun.lockb',
  '**/bun.lockb',
  'vite.config.*',
  '**/vite.config.*',
  'webpack.config.*',
  '**/webpack.config.*',
  'next.config.*',
  '**/next.config.*',
  'nuxt.config.*',
  '**/nuxt.config.*',
  'angular.json',
  '**/angular.json',
  'rollup.config.*',
  '**/rollup.config.*',
  'tsup.config.*',
  '**/tsup.config.*',
];

interface DiffFile {
  path: string;
  oldPath?: string;
  patch: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
}

interface DiffPathPair {
  oldPath: string;
  newPath: string;
}

interface ValidTarget {
  target: ImpactTarget;
  entryFiles: string[];
  baselineEntryFiles: string[];
}

interface ImpactSearchResult {
  chains: string[][];
  truncated: boolean;
  knownMinimum: number;
  omittedWitness?: string[];
  limitCause?: 'per-target' | 'total' | 'both';
}

interface ImpactSearchEvidence {
  basis: 'head' | 'baseline';
  graph: DependencyGraph;
  root: string;
  result: ImpactSearchResult;
}

type BaselineFailure = 'baseline-root-unavailable' | 'baseline-analysis-failed';

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
  const analysisOptions = applyDepicConfig({
    root,
    include: options.include,
    exclude: options.exclude,
    tsconfigPath: options.tsconfigPath,
    extensions: options.extensions,
    workspace: options.workspace,
    symbolLevel: true,
  });
  const graph = await analyze(analysisOptions);
  const baselineRoot = options.baselineRoot ? resolve(root, options.baselineRoot) : undefined;
  let baselineGraph: DependencyGraph | undefined;
  let baselineFailure: BaselineFailure | undefined;
  if (baselineRoot) {
    if (!isDirectory(baselineRoot)) {
      baselineFailure = 'baseline-root-unavailable';
    } else {
      try {
        baselineGraph = await analyze({
          root: baselineRoot,
          include: options.include,
          exclude: options.exclude,
          tsconfigPath: options.tsconfigPath,
          extensions: options.extensions,
          workspace: options.workspace,
          symbolLevel: true,
        });
      } catch {
        baselineFailure = 'baseline-analysis-failed';
      }
    }
  }
  const targets = validateTargets(
    normalizedTargets,
    graph,
    root,
    diagnostics,
    baselineGraph,
    baselineRoot,
  );
  const includeTypeOnly = options.includeTypeOnly ?? impactConfig?.includeTypeOnly ?? false;
  const symbolAnalyzer = new SymbolImpactAnalyzer(root, graph.edges()
    .filter((edge) => graph.getFileNode(edge.target))
    .filter((edge) => includeTypeOnly || !isTypeOnlyEdge(edge, graph)), includeTypeOnly);
  const patches = new Map<string, string | undefined>();
  for (const file of diffFiles) {
    patches.set(file.path, patches.has(file.path) || file.status !== 'modified' ? undefined : file.patch);
  }

  const currentDiffFiles = diffFiles
    .map((file) => file.path);
  const globalPatterns = [
    ...DEFAULT_GLOBAL_IMPACT_PATTERNS,
    ...(options.globalImpactPatterns ?? impactConfig?.globalImpactPatterns ?? []),
  ];
  const globalChangedFiles = [...new Set(currentDiffFiles)]
    .filter((file) => globalPatterns.some((pattern) => matchGlob(file, pattern)))
    .sort();

  const changedFiles: string[] = [];
  const reportChangedFiles: string[] = [];
  const baselineChangedFiles = new Set<string>();
  const unresolvedChanges: ImpactUnresolvedChange[] = [];
  const semanticNoops = new Set<string>();
  for (const file of diffFiles) {
    if (file.status === 'deleted') {
      reportChangedFiles.push(file.path);
      if (globalChangedFiles.length > 0) {
        diagnostics.push({
          level: 'info',
          code: 'deleted-file',
          message: `Deleted file ${file.path} is covered by global impact; baseline dependency data is not required for target coverage.`,
          files: [file.path],
        });
        continue;
      }
      const baselinePath = baselineRoot ? toAbsoluteGitPath(baselineRoot, file.path) : undefined;
      const baselineFileMapped = Boolean(
        baselineGraph && baselinePath && baselineGraph.getFileNode(baselinePath),
      );
      const unmappedBaselineTargetIds = targets
        .filter((target) => target.baselineEntryFiles.length === 0)
        .map((target) => target.target.id);
      if (baselinePath && baselineFileMapped) baselineChangedFiles.add(baselinePath);
      if (baselineFileMapped && unmappedBaselineTargetIds.length === 0) {
        diagnostics.push({
          level: 'info',
          code: 'deleted-file',
          message: `Deleted file ${file.path} is analyzed using baseline reverse dependencies.`,
          files: [file.path],
        });
      } else {
        const unresolved = classifyUnresolvedDeletion(
          file.path,
          options.baselineRoot,
          baselineRoot,
          baselineFailure,
          baselineFileMapped,
          unmappedBaselineTargetIds,
        );
        diagnostics.push({
          level: 'warning',
          code: 'deleted-file',
          message: `Deleted file ${file.path} has unresolved impact (${unresolved.reason}); ${unresolved.recovery.action}, then rerun with ${unresolved.recovery.cli}.`,
          files: [file.path],
        });
        unresolvedChanges.push(unresolved);
      }
      continue;
    }
    if (file.status === 'renamed') {
      const oldPath = file.oldPath ?? file.path;
      const renameRecovery = classifyUnresolvedRename(
        file.path,
        oldPath,
        options.baselineRoot,
        baselineRoot,
        baselineGraph,
      );
      diagnostics.push({
        level: 'warning',
        code: 'renamed-file',
        message: `Renamed file ${oldPath} -> ${file.path} requires baseline comparison for old-path consumers; ${renameRecovery.recovery.action}.`,
        files: [file.path],
        reason: renameRecovery.reason,
        recovery: renameRecovery.recovery,
      });
      unresolvedChanges.push(renameRecovery);
      if (baselineRoot) {
        const baselinePath = toAbsoluteGitPath(baselineRoot, oldPath);
        if (baselineGraph && baselineGraph.getFileNode(baselinePath)) {
          baselineChangedFiles.add(baselinePath);
        }
      }
    }
    if (globalChangedFiles.includes(file.path)) {
      changedFiles.push(file.path);
      reportChangedFiles.push(file.path);
      continue;
    }
    const absolutePath = toAbsoluteGitPath(root, file.path);
    if (graph.getFileNode(absolutePath)) {
      if (symbolAnalyzer.isSemanticNoop(absolutePath, patches.get(file.path))) {
        semanticNoops.add(file.path);
        continue;
      }
      changedFiles.push(file.path);
      reportChangedFiles.push(file.path);
    } else {
      diagnostics.push(classifyUnmappedFile(file.path, absolutePath, analysisOptions));
    }
  }

  if (semanticNoops.size) {
    diagnostics.push({
      level: 'warning', code: 'semantic-noop', files: [...semanticNoops].sort(),
      message: 'Checked comment/format-only changes have identical runtime/type ASTs and preserved directive comments; omitted from impact propagation, not excluded by configuration.',
    });
  }

  const stableChangedFiles = [...new Set(changedFiles)].sort();
  const stableReportChangedFiles = [...new Set(reportChangedFiles)].sort();
  const stableUnresolvedChanges = unresolvedChanges.sort((a, b) => a.file.localeCompare(b.file));
  if (globalChangedFiles.length > 0) {
    return {
      analysisStatus: hasInvalidTargets(diagnostics) ? 'incomplete' : 'complete',
      totalTargetCount: targets.length,
      impactedTargetCount: targets.length,
      changedFiles: stableReportChangedFiles,
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
      unresolvedChanges: [],
    };
  }

  const changedAbsoluteFiles = new Set(stableChangedFiles.map((file) => toAbsoluteGitPath(root, file)));
  const maxChainsPerTarget = options.maxChainsPerTarget
    ?? impactConfig?.maxChainsPerTarget
    ?? DEFAULT_MAX_CHAINS_PER_TARGET;
  const maxTotalChains = options.maxTotalChains
    ?? impactConfig?.maxTotalChains
    ?? DEFAULT_MAX_TOTAL_CHAINS;
  if (!Number.isInteger(maxChainsPerTarget) || !Number.isInteger(maxTotalChains)
    || maxChainsPerTarget < 1 || maxTotalChains < 1) {
    throw new Error('maxChainsPerTarget and maxTotalChains must both be positive integers.');
  }

  let totalChainCount = 0;
  let reportTruncated = false;
  const impacts: TargetImpact[] = [];
  const symbolEvidence: ImpactSymbolEvidence[] = [];

  for (const target of targets) {
    const usedTotalChains = totalChainCount;
    const searches: ImpactSearchEvidence[] = [];
    const targetChanges = new Set(changedAbsoluteFiles);
    for (const file of stableChangedFiles) {
      const absolute = toAbsoluteGitPath(root, file);
      const evidence = symbolAnalyzer.evaluate(target.target.id, target.entryFiles, absolute, patches.get(file));
      if (evidence) {
        symbolEvidence.push(evidence);
        if (!evidence.affected) targetChanges.delete(absolute);
      }
    }
    const headResult = findTargetImpact(
      target,
      graph,
      targetChanges,
      includeTypeOnly,
      maxChainsPerTarget,
      maxTotalChains - totalChainCount,
    );
    searches.push({ basis: 'head', graph, root, result: headResult });

    if (baselineGraph && baselineRoot && baselineChangedFiles.size > 0 && !headResult.truncated) {
      const baselineResult = findTargetImpact(
        { ...target, entryFiles: target.baselineEntryFiles },
        baselineGraph,
        baselineChangedFiles,
        includeTypeOnly,
        maxChainsPerTarget - headResult.chains.length,
        maxTotalChains - totalChainCount - headResult.chains.length,
      );
      searches.push({
        basis: 'baseline',
        graph: baselineGraph,
        root: baselineRoot,
        result: baselineResult,
      });
    }

    const returnedEvidence = searches.flatMap((search) => search.result.chains.map((chain) => ({
      basis: search.basis,
      graph: search.graph,
      root: search.root,
      chain,
    })));
    totalChainCount += returnedEvidence.length;
    const truncatedSearch = searches.find((search) =>
      search.result.truncated && search.result.omittedWitness && search.result.limitCause,
    );
    const resultTruncated = Boolean(truncatedSearch);
    const resultKnownMinimum = returnedEvidence.length + (resultTruncated ? 1 : 0);
    reportTruncated ||= resultTruncated;

    if (truncatedSearch?.result.omittedWitness && truncatedSearch.result.limitCause) {
      const suggestedPerTarget = ['per-target', 'both'].includes(truncatedSearch.result.limitCause)
        ? Math.max(maxChainsPerTarget * 2, resultKnownMinimum)
        : maxChainsPerTarget;
      const suggestedTotal = ['total', 'both'].includes(truncatedSearch.result.limitCause)
        ? Math.max(maxTotalChains * 2, usedTotalChains + resultKnownMinimum)
        : maxTotalChains;
      const cli = `--max-chains-per-target ${suggestedPerTarget} --max-total-chains ${suggestedTotal}`;
      const config = JSON.stringify({ impact: {
        maxChainsPerTarget: suggestedPerTarget,
        maxTotalChains: suggestedTotal,
      } });
      const omittedDependencyChain = truncatedSearch.result.omittedWitness
        .map((file) => relativePath(truncatedSearch.root, file));
      diagnostics.push({
        level: 'warning',
        code: 'chain-limit-reached',
        message: `Target "${target.target.id}" returned ${returnedEvidence.length} of at least ${resultKnownMinimum} dependency chains. Active limits: maxChainsPerTarget=${maxChainsPerTarget}, maxTotalChains=${maxTotalChains}. Rerun with ${cli} or set ${config}.`,
        files: [omittedDependencyChain[omittedDependencyChain.length - 1]],
        chainLimit: {
          targetId: target.target.id,
          returnedChainCount: returnedEvidence.length,
          knownMinimumChainCount: resultKnownMinimum,
          maxChainsPerTarget,
          maxTotalChains,
          limitCause: truncatedSearch.result.limitCause,
          omittedDependencyChain,
          recovery: { cli, config },
        },
      });
    }

    const omittedEvidence = truncatedSearch?.result.omittedWitness ? [{
      basis: truncatedSearch.basis,
      graph: truncatedSearch.graph,
      root: truncatedSearch.root,
      chain: truncatedSearch.result.omittedWitness,
    }] : [];
    const evidenceChains = [...returnedEvidence, ...omittedEvidence];
    if (evidenceChains.length === 0) continue;
    const changedForTarget = [...new Set(
      evidenceChains.map((item) => relativePath(item.root, item.chain[item.chain.length - 1])),
    )].sort();
    const isDirect = evidenceChains.some((item) => isDirectImpactChain(item.chain, item.graph));
    const dependencyChains = returnedEvidence
      .map((item) => item.chain.map((file) => relativePath(item.root, file)))
      .sort(compareChains);
    const bases = new Set(evidenceChains.map((item) => item.basis));
    impacts.push({
      target: target.target,
      impact: isDirect ? 'direct' : 'transitive',
      changedFiles: changedForTarget,
      dependencyChains,
      pathCount: returnedEvidence.length,
      ...(resultTruncated ? { knownMinimumPathCount: resultKnownMinimum } : {}),
      truncated: resultTruncated,
      analysisBasis: bases.size > 1 ? 'mixed' : bases.has('baseline') ? 'baseline' : 'head',
    });
  }

  return {
    analysisStatus: hasIncompleteCoverage(diagnostics) || reportTruncated || stableUnresolvedChanges.length > 0 ? 'incomplete' : 'complete',
    totalTargetCount: targets.length,
    impactedTargetCount: impacts.length,
    changedFiles: stableReportChangedFiles,
    impacts: impacts.sort((a, b) => a.target.id.localeCompare(b.target.id)),
    diagnostics,
    truncated: reportTruncated,
    unresolvedChanges: stableUnresolvedChanges,
    symbolEvidence,
  };
}

function hasInvalidTargets(diagnostics: ImpactDiagnostic[]): boolean {
  return diagnostics.some((item) =>
    item.code === 'empty-targets'
    || item.code === 'missing-entry-file'
    || item.code === 'missing-package',
  );
}

function hasIncompleteCoverage(diagnostics: ImpactDiagnostic[]): boolean {
  return diagnostics.some((item) => item.level === 'warning' && (
    item.code === 'empty-targets'
    || item.code === 'missing-entry-file'
    || item.code === 'missing-package'
    || item.code === 'deleted-file'
    || item.code === 'renamed-file'
    || item.code === 'unmapped-file'
    || item.code === 'parse-failed'
    || item.code === 'resolution-failed'
    || item.code === 'excluded-changed-files'
    || item.code === 'chain-limit-reached'
  ));
}

function classifyUnmappedFile(
  file: string,
  absolutePath: string,
  options: ReturnType<typeof applyDepicConfig>,
): ImpactDiagnostic {
  const includePatterns = options.include ?? DEFAULT_ANALYZE_INCLUDE;
  const excluded = matchesAnalyzeGlob(absolutePath, options.exclude ?? []);
  const expectedByDiscovery = !excluded && matchesAnalyzeGlob(absolutePath, includePatterns);
  const configuredExtensions = options.extensions ?? DEFAULT_RESOLVE_EXTENSIONS;
  const sourceExtensions = new Set([
    ...DEFAULT_RESOLVE_EXTENSIONS,
    ...configuredExtensions,
  ].map(normalizeExtension));
  const sourceLike = sourceExtensions.has(extname(file).toLowerCase());
  let parseError: string | undefined;
  if (sourceLike || expectedByDiscovery) {
    try {
      parseFile(readFileSync(absolutePath, 'utf8'), absolutePath);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }

  if (parseError) {
    return {
      level: 'warning',
      code: 'parse-failed',
      message: `Changed source or analysis-included file ${file} could not be parsed and was not mapped into the dependency graph.`,
      files: [file],
      reason: parseError,
      recovery: {
        action: 'fix-parse-error',
        cli: `depic impact --diff <diff> --targets <targets.json>`,
      },
    };
  }

  if (expectedByDiscovery || sourceLike) {
    return {
      level: 'warning',
      code: 'resolution-failed',
      message: `Changed source or analysis-included file ${file} is not present in the dependency graph; check discovery configuration and resolution fallbacks.`,
      files: [file],
      recovery: {
        action: 'fix-resolution-failure',
        cli: `depic impact --diff <diff> --targets <targets.json>`,
      },
    };
  }

  return {
    level: 'info',
    code: 'non-source-file',
    message: `Changed non-source file ${file} is outside the analyzed dependency graph; it was retained for visibility but does not propagate impact.`,
    files: [file],
  };
}

function classifyUnresolvedRename(
  newPath: string,
  oldPath: string,
  baselineRootOption: string | undefined,
  baselineRoot: string | undefined,
  baselineGraph: DependencyGraph | undefined,
): ImpactUnresolvedChange {
  if (!baselineRootOption) {
    return {
      kind: 'renamed-file',
      file: newPath,
      oldPath,
      newPath,
      status: 'unknown',
      reason: 'baseline-required',
      recovery: {
        action: 'compare-rename-baseline',
        cli: `--baseline-root ${shellQuote('/path/to/baseline-checkout')}`,
      },
    };
  }

  if (!baselineRoot || !baselineGraph) {
    return {
      kind: 'renamed-file',
      file: newPath,
      oldPath,
      newPath,
      status: 'unknown',
      reason: baselineRoot ? 'baseline-analysis-failed' : 'baseline-root-unavailable',
      recovery: {
        action: baselineRoot ? 'fix-baseline-analysis' : 'fix-baseline-root',
        cli: `--baseline-root ${shellQuote(baselineRootOption)}`,
      },
    };
  }

  const baselinePath = toAbsoluteGitPath(baselineRoot, oldPath);
  if (!existsSync(baselinePath)) {
    return {
      kind: 'renamed-file',
      file: newPath,
      oldPath,
      newPath,
      status: 'unknown',
      reason: 'baseline-file-missing',
      recovery: {
        action: 'restore-baseline-file',
        cli: `--baseline-root ${shellQuote(baselineRootOption)}`,
      },
    };
  }

  if (!baselineGraph.getFileNode(baselinePath)) {
    return {
      kind: 'renamed-file',
      file: newPath,
      oldPath,
      newPath,
      status: 'unknown',
      reason: 'baseline-file-unmapped',
      recovery: {
        action: 'include-baseline-file',
        cli: `--baseline-root ${shellQuote(baselineRootOption)}`,
      },
    };
  }

  return {
    kind: 'renamed-file',
    file: newPath,
    oldPath,
    newPath,
    status: 'unknown',
    reason: 'baseline-targets-unmapped',
    recovery: {
      action: 'fix-baseline-targets',
      cli: `--baseline-root ${shellQuote(baselineRootOption)}`,
    },
  };
}

function normalizeExtension(extension: string): string {
  const normalized = extension.toLowerCase();
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

function classifyUnresolvedDeletion(
  file: string,
  baselineRootOption: string | undefined,
  baselineRoot: string | undefined,
  baselineFailure: BaselineFailure | undefined,
  baselineFileMapped: boolean,
  unmappedBaselineTargetIds: string[],
): ImpactUnresolvedChange {
  let reason: ImpactUnresolvedChange['reason'];
  let action: ImpactUnresolvedChange['recovery']['action'];

  if (!baselineRootOption) {
    reason = 'baseline-required';
    action = 'provide-baseline-root';
  } else if (baselineFailure === 'baseline-root-unavailable') {
    reason = baselineFailure;
    action = 'fix-baseline-root';
  } else if (baselineFailure === 'baseline-analysis-failed') {
    reason = baselineFailure;
    action = 'fix-baseline-analysis';
  } else {
    const baselinePath = baselineRoot ? toAbsoluteGitPath(baselineRoot, file) : undefined;
    if (!baselinePath || !existsSync(baselinePath)) {
      reason = 'baseline-file-missing';
      action = 'restore-baseline-file';
    } else {
      try {
        parseFile(readFileSync(baselinePath, 'utf8'), baselinePath);
        if (!baselineFileMapped) {
          reason = 'baseline-file-unmapped';
          action = 'include-baseline-file';
        } else {
          reason = 'baseline-targets-unmapped';
          action = 'fix-baseline-targets';
        }
      } catch {
        reason = 'baseline-parse-failed';
        action = 'fix-baseline-parse';
      }
    }
  }

  return {
    kind: 'deleted-file',
    file,
    status: 'unknown',
    reason,
    ...(reason === 'baseline-targets-unmapped' ? { targetIds: unmappedBaselineTargetIds } : {}),
    recovery: {
      action,
      cli: `--baseline-root ${shellQuote(baselineRootOption ?? '/path/to/baseline-checkout')}`,
    },
  };
}

function shellQuote(value: string): string {
  if (/^[a-z0-9_./:@+-]+$/i.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
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
    byId.set(target.id, { target: normalizedTarget, entryFiles: [], baselineEntryFiles: [] });
  }
  return [...byId.values()].sort((a, b) => a.target.id.localeCompare(b.target.id));
}

function validateTargets(
  targets: ValidTarget[],
  graph: DependencyGraph,
  root: string,
  diagnostics: ImpactDiagnostic[],
  baselineGraph?: DependencyGraph,
  baselineRoot?: string,
): ValidTarget[] {
  return targets.filter((item) => {
    const target = item.target;
    if (target.kind === 'entry') {
      const absoluteFile = toAbsolutePath(root, target.file);
      if (graph.getFileNode(absoluteFile)) {
        item.entryFiles = [absoluteFile];
      }
      if (baselineGraph && baselineRoot) {
        const baselineFile = toAbsolutePath(baselineRoot, target.file);
        if (baselineGraph.getFileNode(baselineFile)) item.baselineEntryFiles = [baselineFile];
      }
      if (item.entryFiles.length > 0 || item.baselineEntryFiles.length > 0) return true;
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
    item.baselineEntryFiles = baselineGraph?.files()
      .filter((file) => file.package === target.package)
      .map((file) => file.id)
      .sort() ?? [];
    if (item.entryFiles.length > 0 || item.baselineEntryFiles.length > 0) return true;
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
): ImpactSearchResult {
  const chains: string[][] = [];
  if (changedFiles.size === 0) return { chains, truncated: false, knownMinimum: 0 };
  const chainLimit = Math.max(0, Math.min(maxChainsPerTarget, remainingTotalChains));
  const limitCause: 'per-target' | 'total' | 'both' = maxChainsPerTarget === remainingTotalChains ? 'both'
    : maxChainsPerTarget < remainingTotalChains ? 'per-target' : 'total';
  const truncated = (omittedWitness: string[]) => ({
    chains: chains.sort(compareChains),
    truncated: true,
    knownMinimum: chains.length + 1,
    omittedWitness,
    limitCause,
  });

  const entryFiles = [...target.entryFiles].sort((a, b) =>
    Number(changedFiles.has(b)) - Number(changedFiles.has(a)) || a.localeCompare(b),
  );
  const queue: string[][] = [];
  const bestDepth = new Map<string, number>();

  for (const entryFile of entryFiles) {
    if (changedFiles.has(entryFile)) {
      const chain = [entryFile];
      if (chains.length >= chainLimit) return truncated(chain);
      chains.push(chain);
      continue;
    }
    queue.push([entryFile]);
    bestDepth.set(entryFile, 0);
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

    for (const edge of edges) {
      if (seenTargets.has(edge.target) || path.includes(edge.target)) continue;
      seenTargets.add(edge.target);
      const nextPath = [...path, edge.target];
      if (changedFiles.has(edge.target)) {
        if (chains.length >= chainLimit) return truncated(nextPath);
        chains.push(nextPath);
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
  return { chains, truncated: false, knownMinimum: chains.length };
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
    const header = stripCarriageReturn(lines[0] ?? '');
    const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
    const headerLines = lines.slice(1, firstHunk < 0 ? lines.length : firstHunk);
    const oldMarkerLine = findUniqueDiffLine(headerLines, '--- ');
    const newMarkerLine = findUniqueDiffLine(headerLines, '+++ ');
    if (Boolean(oldMarkerLine) !== Boolean(newMarkerLine)) {
      throw new Error('Invalid unified diff: incomplete "---" / "+++" marker pair.');
    }
    const oldMarker = oldMarkerLine
      ? parseMarkerPath(oldMarkerLine, '--- ', 'a/', 'old marker')
      : undefined;
    const newMarker = newMarkerLine
      ? parseMarkerPath(newMarkerLine, '+++ ', 'b/', 'new marker')
      : undefined;
    if (oldMarker === null && newMarker === null) {
      throw new Error('Invalid unified diff: both file markers cannot be /dev/null.');
    }

    const rename = parseExtendedPathPair(headerLines, 'rename');
    const copy = parseExtendedPathPair(headerLines, 'copy');
    if (rename && copy) {
      throw new Error('Invalid unified diff: a file cannot be both renamed and copied.');
    }
    if ((rename || copy) && (oldMarker === null || newMarker === null)) {
      throw new Error('Invalid unified diff: rename/copy metadata cannot use /dev/null markers.');
    }

    const markerOldHint = typeof oldMarker === 'string'
      ? oldMarker
      : oldMarker === null && typeof newMarker === 'string' ? newMarker : undefined;
    const markerNewHint = typeof newMarker === 'string'
      ? newMarker
      : newMarker === null && typeof oldMarker === 'string' ? oldMarker : undefined;
    const pair = rename ?? copy;
    const { oldPath, newPath } = parseDiffGitHeader(header, {
      oldPath: pair?.oldPath ?? markerOldHint,
      newPath: pair?.newPath ?? markerNewHint,
    });

    if (typeof oldMarker === 'string' && oldMarker !== oldPath
      || typeof newMarker === 'string' && newMarker !== newPath) {
      throw new Error('Invalid unified diff: file markers do not match the "diff --git" header.');
    }
    if (rename && (rename.oldPath !== oldPath || rename.newPath !== newPath)) {
      throw new Error('Invalid unified diff: rename metadata does not match the "diff --git" header.');
    }
    if (copy && (copy.oldPath !== oldPath || copy.newPath !== newPath)) {
      throw new Error('Invalid unified diff: copy metadata does not match the "diff --git" header.');
    }

    const isDeleted = newMarker === null;
    const isAdded = oldMarker === null;
    const isRenamed = Boolean(rename) || !copy && oldPath !== newPath;
    const isCopied = Boolean(copy);
    const path = isDeleted ? oldPath : pair?.newPath ?? newPath;
    files.push({
      path,
      oldPath: isRenamed ? rename?.oldPath ?? oldPath : undefined,
      patch: block,
      status: isRenamed
        ? 'renamed'
        : isCopied ? 'copied' : isDeleted ? 'deleted' : isAdded ? 'added' : 'modified',
    });
  }
  return files;
}

function findUniqueDiffLine(lines: string[], prefix: string): string | undefined {
  const matches = lines.filter((line) => line.startsWith(prefix));
  if (matches.length > 1) {
    throw new Error(`Invalid unified diff: duplicate ${prefix.trim()} metadata.`);
  }
  return matches[0];
}

function parseExtendedPathPair(lines: string[], kind: 'rename' | 'copy'): DiffPathPair | undefined {
  const fromLine = findUniqueDiffLine(lines, `${kind} from `);
  const toLine = findUniqueDiffLine(lines, `${kind} to `);
  if (Boolean(fromLine) !== Boolean(toLine)) {
    throw new Error(`Invalid unified diff: incomplete ${kind} metadata pair.`);
  }
  if (!fromLine || !toLine) return undefined;
  return {
    oldPath: normalizeGitRelativePath(decodeGitPathField(
      stripCarriageReturn(fromLine.slice(`${kind} from `.length)),
      `${kind} source`,
    )),
    newPath: normalizeGitRelativePath(decodeGitPathField(
      stripCarriageReturn(toLine.slice(`${kind} to `.length)),
      `${kind} destination`,
    )),
  };
}

function parseMarkerPath(
  line: string,
  marker: '--- ' | '+++ ',
  pathPrefix: 'a/' | 'b/',
  label: string,
): string | null {
  const field = stripCarriageReturn(line.slice(marker.length));
  if (field === '/dev/null') return null;
  const path = decodeGitPathField(field, label, true);
  return normalizePrefixedGitPath(path, pathPrefix, label);
}

function parseDiffGitHeader(
  header: string,
  expected: { oldPath?: string; newPath?: string },
): DiffPathPair {
  if (!header) throw new Error('Invalid unified diff: malformed "diff --git" header.');

  if (header.startsWith('"')) {
    const first = decodeCStyleQuotedPath(header, 0, 'header source');
    if (header[first.end] !== ' ') {
      throw new Error('Invalid unified diff: malformed "diff --git" header.');
    }
    const oldPath = normalizePrefixedGitPath(first.value, 'a/', 'header source');
    const newPath = normalizePrefixedGitPath(
      decodeGitPathField(header.slice(first.end + 1), 'header destination'),
      'b/',
      'header destination',
    );
    return validateHeaderCandidate({ oldPath, newPath }, expected);
  }

  const candidates = new Map<string, DiffPathPair>();
  let firstError: Error | undefined;
  for (let index = 0; index < header.length; index += 1) {
    if (header[index] !== ' ') continue;
    try {
      const candidate = {
        oldPath: normalizePrefixedGitPath(
          decodeGitPathField(header.slice(0, index), 'header source'),
          'a/',
          'header source',
        ),
        newPath: normalizePrefixedGitPath(
          decodeGitPathField(header.slice(index + 1), 'header destination'),
          'b/',
          'header destination',
        ),
      };
      candidates.set(`${candidate.oldPath}\0${candidate.newPath}`, candidate);
    } catch (error) {
      if (!firstError && error instanceof Error) firstError = error;
    }
  }

  let matches = [...candidates.values()].filter((candidate) =>
    (expected.oldPath === undefined || candidate.oldPath === expected.oldPath)
    && (expected.newPath === undefined || candidate.newPath === expected.newPath),
  );
  if (matches.length === 0 && candidates.size === 0 && firstError) throw firstError;
  if (matches.length === 0) {
    throw new Error('Invalid unified diff: header paths do not match file metadata.');
  }
  if (matches.length > 1 && expected.oldPath === undefined && expected.newPath === undefined) {
    const samePath = matches.filter((candidate) => candidate.oldPath === candidate.newPath);
    if (samePath.length === 1) matches = samePath;
  }
  if (matches.length !== 1) {
    throw new Error('Invalid unified diff: ambiguous "diff --git" header paths.');
  }
  return matches[0];
}

function validateHeaderCandidate(
  candidate: DiffPathPair,
  expected: { oldPath?: string; newPath?: string },
): DiffPathPair {
  if (expected.oldPath !== undefined && candidate.oldPath !== expected.oldPath
    || expected.newPath !== undefined && candidate.newPath !== expected.newPath) {
    throw new Error('Invalid unified diff: header paths do not match file metadata.');
  }
  return candidate;
}

function normalizePrefixedGitPath(path: string, prefix: 'a/' | 'b/', label: string): string {
  if (!path.startsWith(prefix)) {
    throw new Error(`Invalid unified diff: ${label} must start with ${prefix}.`);
  }
  return normalizeGitRelativePath(path.slice(prefix.length));
}

function decodeGitPathField(field: string, label: string, allowTabSuffix = false): string {
  if (!field) throw new Error(`Invalid unified diff: empty ${label} path.`);
  if (field.startsWith('"')) {
    const decoded = decodeCStyleQuotedPath(field, 0, label);
    const trailing = field.slice(decoded.end);
    if (trailing && (!allowTabSuffix || !trailing.startsWith('\t'))) {
      throw new Error(`Invalid unified diff: trailing data after quoted ${label} path.`);
    }
    return decoded.value;
  }
  const value = allowTabSuffix ? field.split('\t', 1)[0] : field;
  if (!value || value.includes('"') || [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  })) {
    throw new Error(`Invalid unified diff: malformed ${label} path.`);
  }
  assertValidUnicode(value, label);
  return value;
}

function decodeCStyleQuotedPath(
  input: string,
  start: number,
  label: string,
): { value: string; end: number } {
  const bytes: number[] = [];
  let index = start + 1;
  let literalStart = index;

  const appendLiteral = (end: number): void => {
    const literal = input.slice(literalStart, end);
    assertValidUnicode(literal, label);
    for (const byte of Buffer.from(literal, 'utf8')) bytes.push(byte);
  };

  while (index < input.length) {
    const character = input[index];
    if (character === '"') {
      appendLiteral(index);
      if (bytes.includes(0)) {
        throw new Error(`Invalid unified diff: NUL is not allowed in ${label} path.`);
      }
      try {
        return {
          value: new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)),
          end: index + 1,
        };
      } catch {
        throw new Error(`Invalid unified diff: ${label} path is not valid UTF-8.`);
      }
    }
    if (character !== '\\') {
      index += 1;
      continue;
    }

    appendLiteral(index);
    index += 1;
    const escape = input[index];
    if (escape in GIT_SIMPLE_ESCAPES) {
      bytes.push(GIT_SIMPLE_ESCAPES[escape]);
      index += 1;
      literalStart = index;
      continue;
    }
    const octal = input.slice(index, index + 3);
    if (!/^[0-3][0-7]{2}$/u.test(octal)) {
      throw new Error(`Invalid unified diff: invalid Git escape in ${label} path.`);
    }
    bytes.push(Number.parseInt(octal, 8));
    index += 3;
    literalStart = index;
  }

  throw new Error(`Invalid unified diff: unterminated quoted ${label} path.`);
}

function assertValidUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      throw new Error(`Invalid unified diff: ${label} path is not valid UTF-8.`);
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`Invalid unified diff: ${label} path is not valid UTF-8.`);
    }
  }
}

function stripCarriageReturn(value: string): string {
  return value.endsWith('\r') ? value.slice(0, -1) : value;
}

function toAbsolutePath(root: string, file: string): string {
  return resolveContainedPath(root, normalizeRelativePath(file), file);
}

function toAbsoluteGitPath(root: string, file: string): string {
  return resolveContainedPath(root, normalizeGitRelativePath(file), file);
}

function resolveContainedPath(root: string, normalized: string, original: string): string {
  const absolute = resolve(root, normalized);
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  if (absolute !== root && !absolute.startsWith(rootPrefix)) {
    throw new Error(`Path "${original}" is outside the analysis root.`);
  }
  return absolute;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizeRelativePath(file: string): string {
  return normalizePath(file, false);
}

function normalizeGitRelativePath(file: string): string {
  return normalizePath(file, true);
}

function normalizePath(file: string, preservePosixBackslash: boolean): string {
  if (preservePosixBackslash && sep === '\\' && file.includes('\\')) {
    throw new Error(`Path "${file}" must be relative to the analysis root.`);
  }
  const separatorNormalized = preservePosixBackslash && sep !== '\\'
    ? file
    : file.replace(/\\/g, '/');
  const normalized = separatorNormalized.replace(/^\.\//, '');
  if (!normalized || normalized === '/dev/null' || normalized.startsWith('/')
    || /^[a-z]:[\\/]/iu.test(normalized) || file.startsWith('\\\\')
    || normalized.includes('\0') || normalized.split(/[\\/]/u).includes('..')) {
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
