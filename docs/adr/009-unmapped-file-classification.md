# ADR 009: Classify unmapped changed files by effective analysis scope

Status: accepted for release 0.1.16, fixing Issue #35.

## Context

Impact analysis previously emitted `unmapped-file` for every changed path absent
from the dependency graph. That made an expected README or build artifact look
identical to a TypeScript parse, include, alias, or graph gap. Silently ignoring
non-source files would remove useful evidence from machine-readable reports.

Classification cannot rely on a fixed extension list. Depic supports top-level
`include`, `exclude`, and resolver `extensions` overrides, and a matching file can
still be absent because it was gitignored, unreadable, or failed to parse.

## Decision

Use the effective analysis options after API/config merging:

1. A path matched by `include` and not `exclude` is expected in discovery.
2. A path with a default or configured resolver extension is source-like. Default
   TS/TSX/JS/JSX extensions remain source-like even when extensions are replaced.
3. If either condition is true and the graph has no node, emit the existing
   `unmapped-file` warning.
4. Otherwise emit `non-source-file` at `info` level.

Both diagnostics remain in `ImpactReport.diagnostics`; neither path is added to
`changedFiles` or propagated. The CLI gives `non-source-file` its own compact
summary and reports warning/info counts separately. Global-impact patterns
continue to take precedence.

## Consequences

Documentation and artifact diffs remain observable without obscuring suspicious
source graph gaps. Consumers can distinguish the categories by stable diagnostic
code and level. The new diagnostic is additive, but consumers that assumed every
diagnostic level was `warning` must accept `info` as well.
