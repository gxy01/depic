# ADR 010: Analyze deletions with an explicit baseline checkout

Status: accepted for release 0.1.17, fixing Issue #40.

## Context

A deleted source file has no node in the head graph. Earlier reports removed the
path from `changedFiles`, emitted only a warning, and could return an apparently
ordinary zero-impact result even when a baseline entry imported the file.

Depic should not invoke Git or guess a revision inside the core engine. Callers
already control diff production and can materialize a trusted pre-change tree.
When that input is absent or unusable, uncertainty must be part of the stable JSON
contract rather than requiring consumers to interpret prose diagnostics.

## Decision

- Add runtime-only `ImpactOptions.baselineRoot` and CLI `--baseline-root <path>`.
- Build a second dependency graph from that checkout with the same explicit
  analysis overrides. Resolve entry/package targets independently in head and
  baseline graphs so a deleted target itself remains analyzable.
- Traverse deleted paths in the baseline graph, merge their chains with head
  evidence under the existing per-target and total budgets, and mark each impact
  as `head`, `baseline`, or `mixed` through `analysisBasis`.
- Keep deleted paths in report `changedFiles`.
- Always emit top-level `analysisStatus` and `unresolvedChanges`. Missing or
  unusable evidence produces `analysisStatus: "incomplete"`, `status: "unknown"`,
  a stable reason, and structured recovery. A globally impactful deletion is
  already conservatively covered and remains complete.
- Require both the deleted node and every configured target to be mapped in the
  baseline before treating a zero-chain result as complete.
- Preserve exit code zero when the analysis completed and wrote a report. CI must
  inspect `analysisStatus`; invalid command syntax and unrecoverable head-analysis
  errors retain non-zero behavior.

## Consequences

Deletion impact can be proven without mutating the head checkout or coupling core
to Git. Reports without proof can no longer masquerade as trustworthy zero impact.
The report schema gains required fields, so consumers should upgrade their types
and treat unknown future unresolved reasons conservatively.
