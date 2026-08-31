# ADR 004: Conservative symbol refinement for impact

Status: accepted for 0.1.8 (Issue #20), amended for 0.1.12 (Issue #27).

## Context

File reachability overapproximates consumers of generated barrels. The explicit
`excludeChangedFiles` escape hatch skips genuine changes too; it is not a
precision mechanism. Namespace exports also require preserving exported/local
names, not merely walking re-export edges.

## Decision

Keep the public graph and its queries file-level. Within core impact analysis,
parse proof metadata on demand, cache it for the report, and refine each candidate
target/change pair before chain truncation. Validate hunks against post-change
source and reconstruct the old module. Only declaration edits with stable module
structure are eligible. Track references through local declarations, aliased
exports, star exports and static namespace members. Entry symbols remain labels;
all declarations in an entry are roots, and own-package changes remain direct.

Proof fails closed to existing file-level impact for unsupported syntax, effects,
namespace escapes, unresolved/ambiguous/cyclic exports, unverified hunks, structural
edits or exhausted work/depth budgets. This is a deliberately limited subset,
not a type checker, tree shaker or general alias/value-flow engine. False positives
are acceptable when provenance cannot be established. Type-contract analysis is
file-level. Deleted files retain the baseline-graph limitation. A renamed
destination is propagated conservatively through the head graph without symbol
refinement; the diagnostic preserves the old-path baseline limitation.

Expose decisions in additive `symbolEvidence`, including negative refinements.
Symbol witnesses are distinct from the existing file `dependencyChains`. CLI
shows counts/reasons; the published skill explains the confidence boundary.
`excludeChangedFiles` remains an independent, explicit pre-analysis exclusion.

## Consequences

The generatedClient A/B regression can narrow to A without losing graph nodes.
Consumers can audit both pruning and fallback. More complex applications may
still report broad impact, notably with classes, complex initialization, dynamic
namespaces and reexport-only target files. Future support must extend proof and
regression cases together rather than weakening fallback behavior.
