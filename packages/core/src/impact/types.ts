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
  targets?: ImpactTarget[];
  globalImpactPatterns?: string[];
  /** Exclude matching diff paths only; graph nodes and edges remain available. */
  excludeChangedFiles?: string[];
  includeTypeOnly?: boolean;
  maxChainsPerTarget?: number;
  maxTotalChains?: number;
}

export type ImpactKind = 'direct' | 'transitive' | 'global';

export interface ImpactDiagnostic {
  level: 'warning';
  code:
    | 'empty-targets'
    | 'missing-entry-file'
    | 'missing-package'
    | 'deleted-file'
    | 'renamed-file'
    | 'unmapped-file'
    | 'excluded-changed-files'
    | 'chain-limit-reached';
  message: string;
  files?: string[];
}

export interface TargetImpact {
  target: ImpactTarget;
  impact: ImpactKind;
  changedFiles: string[];
  dependencyChains: string[][];
  pathCount: number;
  truncated: boolean;
}

export interface ImpactReport {
  totalTargetCount: number;
  impactedTargetCount: number;
  changedFiles: string[];
  impacts: TargetImpact[];
  diagnostics: ImpactDiagnostic[];
  truncated: boolean;
}
