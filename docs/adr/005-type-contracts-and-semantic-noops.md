# ADR 005: Type contracts and checked AST no-ops

Status: accepted for release 0.1.9, implementing Issues #22 and #23.
Extends ADR 004; its type-only file-level restriction described release 0.1.8.

## Decision

Reuse `includeTypeOnly` for interface/type-alias declarations and annotation
references. Propagate whole type declarations through existing resolved graph
edges. Keep all consumers of the same declaration, regardless of which fields
they use. Preserve type-only binding flags in structural checks: a type import
becoming a runtime import may introduce effects. Merging, name collisions,
indexed/conditional/mapped/import types and existing effect/ambiguity guards
remain conservative. This is not a TypeScript type checker.

Before own-target and dependency propagation, validate modified-file hunks and
compare reconstructed old/new full ASTs, retaining runtime/type/literal fields.
Only parser locations and contexts are normalized away. Use AST literal spans
to inspect comments without treating strings, templates, regex or JSX text as
trivia. Ordinary prose comments may differ; directives and unknown markup retain
verbatim content, code anchors and adjacent whitespace. Uncertainty never proves
a no-op. Keep global config classification and explicit exclusions ahead of this
refinement; new/deleted/renamed files retain existing behavior.

Expose whole-file no-op paths in a separate `semantic-noop` diagnostic, omit them
from propagated `changedFiles`, and retain graph nodes. This is checked AST
equivalence, distinct from an explicit not-analyzed exclusion and from universal
behavioral equivalence. No per-hunk filtering, source-reflection analysis or
field-level type precision is claimed. Published 0.1.8 lacks these extensions.
