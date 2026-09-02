import type { AnalyzeOptions } from '../types.js';

export interface EntryTarget {
  kind: 'entry';
  id: string;
  file: string;
  symbol?: string;
  metadata?: Record<string, unknown>;
}

export interface PackageTarget {
  kind: 'package';
  id: string;
  package: string;
  metadata?: Record<string, unknown>;
}

export type ImpactTarget = EntryTarget | PackageTarget;

export interface ImpactOptions extends AnalyzeOptions {
  diff: string;
  /** Optional checkout of the pre-change tree, used to resolve deleted files. */
  baselineRoot?: string;
  targets?: ImpactTarget[];
  globalImpactPatterns?: string[];
  /** Exclude matching diff paths only; graph nodes and edges remain available. */
  excludeChangedFiles?: string[];
  includeTypeOnly?: boolean;
  maxChainsPerTarget?: number;
  maxTotalChains?: number;
}

export type ImpactKind = 'direct' | 'transitive' | 'global';

export interface ImpactUnresolvedChange {
  kind: 'deleted-file';
  file: string;
  status: 'unknown';
  reason:
    | 'baseline-required'
    | 'baseline-root-unavailable'
    | 'baseline-analysis-failed'
    | 'baseline-file-missing'
    | 'baseline-parse-failed'
    | 'baseline-file-unmapped'
    | 'baseline-targets-unmapped';
  targetIds?: string[];
  recovery: {
    action:
      | 'provide-baseline-root'
      | 'fix-baseline-root'
      | 'fix-baseline-analysis'
      | 'restore-baseline-file'
      | 'fix-baseline-parse'
      | 'include-baseline-file'
      | 'fix-baseline-targets';
    cli: string;
  };
}

export interface ImpactChainLimitDetails {
  targetId: string;
  returnedChainCount: number;
  knownMinimumChainCount: number;
  maxChainsPerTarget: number;
  maxTotalChains: number;
  limitCause: 'per-target' | 'total' | 'both';
  /** One proven omitted chain; additional omitted chains may exist. */
  omittedDependencyChain: string[];
  recovery: {
    cli: string;
    config: string;
  };
}

export interface ImpactDiagnostic {
  level: 'warning' | 'info';
  code:
    | 'empty-targets'
    | 'missing-entry-file'
    | 'missing-package'
    | 'deleted-file'
    | 'renamed-file'
    | 'unmapped-file'
    | 'non-source-file'
    | 'excluded-changed-files'
    | 'semantic-noop'
    | 'chain-limit-reached';
  message: string;
  files?: string[];
  chainLimit?: ImpactChainLimitDetails;
}

export interface TargetImpact {
  target: ImpactTarget;
  impact: ImpactKind;
  changedFiles: string[];
  dependencyChains: string[][];
  pathCount: number;
  /** Present when truncated; the actual path count may be higher. */
  knownMinimumPathCount?: number;
  truncated: boolean;
  /** Graph checkout(s) that proved the returned impact. */
  analysisBasis?: 'head' | 'baseline' | 'mixed';
}

export interface ImpactReport {
  /** Incomplete means at least one changed file could not be mapped to target impact safely. */
  analysisStatus: 'complete' | 'incomplete';
  totalTargetCount: number;
  impactedTargetCount: number;
  changedFiles: string[];
  impacts: TargetImpact[];
  diagnostics: ImpactDiagnostic[];
  truncated: boolean;
  unresolvedChanges: ImpactUnresolvedChange[];
  /** Refinement decisions, including targets proven unrelated to a changed symbol. */
  symbolEvidence?: ImpactSymbolEvidence[];
}

export interface ImpactSymbolEvidence {
  targetId: string;
  changedFile: string;
  precision: 'symbol' | 'file';
  affected: boolean;
  changedSymbols?: string[];
  chain?: { file: string; symbol: string }[];
  fallbackReason?: string;
}
