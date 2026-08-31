# ADR 006: Stable directive attachment and bounded documentation links

Status: accepted for release 0.1.10, fixing Issue #25; amended for 0.1.13,
fixing Issue #31; extends ADR 005.

## Context

Absolute non-trivia byte offsets incorrectly classify an unchanged trailing
`eslint-enable` as edited when an earlier interface grows. A punctuation-only
prose allowlist also treats Markdown documentation links as unknown directives.
Separately, reverse-diff reconstruction lost unchanged EOF newlines, making
trailing directive whitespace differ even when its source did not change.

## Decision

For comments in gaps between top-level AST items, compare boundary ordinal and
neighbor identities. Named declarations use node kind and binding names; other
items keep their full normalized AST. Keep raw directive contents, ordering and
adjacent whitespace. Recognized ESLint/Oxlint range and TypeScript file-level directives
can tolerate line-count changes inside their unchanged gap. All other protected
comments additionally retain line distances to both gap boundaries, protecting
next-line directives across intervening prose. Comments inside AST items retain
the strict code-offset fallback; uncertain cases are not guessed.

Recognize only inline Markdown links with plain labels and valid HTTP(S) URLs
without credentials. Check tool keywords before link normalization; do not relax
the general markup allowlist. JSDoc annotations, triple-slash directives,
malformed links and unknown markup stay protected. This recognizes Markdown
prose inside JSDoc, not every JSDoc tag or arbitrary Markdown syntax.

Preserve unchanged EOF newlines when reconstructing the old source. Existing
unsupported-diff handling still rejects missing-newline markers.

## Consequences

The Issue #25 wrappers no longer block supported declaration refinement, and
documentation-link churn can yield checked whole-file AST no-ops. Nested
directives, line-sensitive placement changes and ambiguous identities can still
conservatively fall back. No config or report schema changes, no type-field
precision, and no universal claim about source-reading tools are introduced.
These fixes require 0.1.10 or later; they are not present in 0.1.9.

The 0.1.13 amendment classifies Oxlint control comments as protected and gives
bare `oxlint-disable` / `oxlint-enable` ranges the same stable attachment as
ESLint ranges. Raw directive identity and rule lists remain exact; line-specific
forms retain strict placement. This fixes Issue #31 without weakening no-op
proofs or disabling refinement inside unchanged wrappers.
