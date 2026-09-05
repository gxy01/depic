import type { SourceLocation } from '../parser/index.js';

export type TargetConfidence = 'high' | 'medium' | 'low';

export interface TargetEvidence {
  kind:
    | 'workspace-manifest'
    | 'package-json'
    | 'file-route'
    | 'route-declaration'
    | 'lazy-import'
    | 'component-binding'
    | 'alias-config';
  file: string;
  detail?: string;
  loc?: SourceLocation;
  specifier?: string;
  resolved?: string;
  source?: string;
}

export interface SuggestedEntryTarget {
  kind: 'entry';
  id: string;
  file: string;
  symbol?: string;
  source: 'file-route' | 'route-declaration' | 'bootstrap' | 'cli' | 'task';
  confidence: TargetConfidence;
  evidence: TargetEvidence[];
  diagnostics?: string[];
}

export interface SuggestedPackageTarget {
  kind: 'package';
  id: string;
  package: string;
  source: 'workspace-manifest';
  confidence: TargetConfidence;
  evidence: TargetEvidence[];
  diagnostics?: string[];
}

export type SuggestedTarget = SuggestedEntryTarget | SuggestedPackageTarget;

export interface UnknownTargetSuggestion {
  kind: 'unknown';
  id: string;
  source: 'route-declaration' | 'file-route' | 'manifest' | 'bootstrap' | 'cli' | 'task';
  reason:
    | 'unresolved-alias'
    | 'dynamic-import'
    | 'non-static-path'
    | 'resolution-failed'
    | 'malformed-manifest'
    | 'duplicate-package-name'
    | 'out-of-root'
    | 'symlink'
    | 'missing-component'
    | 'unsupported-route-shape';
  confidence: 'low';
  file: string;
  evidence: TargetEvidence[];
  diagnostics: string[];
  aliasSource?: string;
  specifier?: string;
  expression?: string;
  recovery?: {
    action: string;
    cli?: string;
    config?: string;
  };
}

export interface TargetSuggestionDiagnostic {
  level: 'warning' | 'info';
  code:
    | 'malformed-manifest'
    | 'duplicate-package-name'
    | 'unresolved-alias'
    | 'unknown-route'
    | 'out-of-root'
    | 'symlink'
    | 'unsupported-route-shape'
    | 'parse-failed'
    | 'resolution-failed'
    | 'truncated';
  message: string;
  files?: string[];
  reason?: string;
  recovery?: {
    action: string;
    cli?: string;
    config?: string;
  };
}

export interface TargetSuggestionState {
  git: {
    isRepo: boolean;
    branch?: string;
    head?: string;
    clean: boolean;
  };
  ignore: {
    hasDepicRule: boolean;
    proposedDelta: string[];
  };
  config: {
    existingPath?: string;
    existingState: 'missing' | 'present' | 'malformed';
    legacyPaths: string[];
    mergedConfig: Record<string, unknown>;
  };
  confirmation: {
    required: boolean;
    action: 'confirm-proposal';
  };
}

export interface TargetSuggestionReport {
  schemaVersion: 1;
  root: string;
  state: TargetSuggestionState;
  targets: SuggestedTarget[];
  unknown: UnknownTargetSuggestion[];
  diagnostics: TargetSuggestionDiagnostic[];
}
