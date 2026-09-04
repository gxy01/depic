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
    | 'unsupported-route-shape';
  message: string;
  files?: string[];
}

export interface TargetSuggestionReport {
  root: string;
  targets: SuggestedTarget[];
  unknown: UnknownTargetSuggestion[];
  diagnostics: TargetSuggestionDiagnostic[];
}
