# ADR 003: Keep diff exclusions separate from graph exclusions

## Status

Accepted

## Context

[Issue #17](https://github.com/gxy01/depic/issues/17) demonstrates generated API
namespace/barrel fan-out. File-level reachability intentionally reports all
consumers, even if they use different exports. Removing generated modules from
discovery is not an equivalent remedy: they may connect a target to other changes.

## Decision

- Add optional `impact.excludeChangedFiles` and the matching `ImpactOptions` field.
- Filter normalized diff paths before global classification or file-status handling.
- Keep all graph construction, traversal and target discovery rules unchanged.
- Use explicit root-relative patterns; default to no exclusions. API lists replace
  configured lists, including an empty list that disables configured exclusions.
- Record sorted, unique excluded paths in an `excluded-changed-files` warning and
  expose them in the CLI summary as not analyzed, including zero-impact reports.

## Consequences

Users may deliberately omit generated changes without breaking dependency chains.
This opts out of analysis and can hide real impact; it is not evidence that a
change is harmless. The skill must not enable it merely because code is generated.
Default conservative propagation remains unchanged. Symbol-aware propagation and
generated-source semantic normalization remain separate future work.
