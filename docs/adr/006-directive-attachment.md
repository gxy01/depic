# ADR 006: Stable directive attachment and bounded documentation links

Status: accepted for the unreleased Issue #25 fix; extends ADR 005.

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
adjacent whitespace. Recognized ESLint range and TypeScript file-level directives
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
These fixes are not present in published 0.1.9.
