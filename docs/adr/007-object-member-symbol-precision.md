# ADR 007: Qualify safe exported object members

Status: accepted for release 0.1.14, fixing Issue #33.

## Context

The symbol-impact proof previously understood static member reads, but an
exported object literal was classified as `top-level-effects`. A change to one
property therefore retained every file-level consumer, including consumers that
only read an unrelated static property.

## Decision

For a `const` exported object literal with a statically known, supported shape,
record each member as a qualified declaration such as `client.fetchA`. Diff
lines map to the most specific overlapping declaration, and static dot or
string-key reads preserve that qualified path through imports and re-exports.

The proof remains deliberately narrow. Dynamic/computed access, mutation or
deletion, whole-object escape, spread, accessors, unsupported member values,
duplicates, `this`/`super`, and shape changes fall back to file precision. A
static member call may initialize a target declaration because its dependency
is explicit; a bare top-level call remains an effectful fallback.

## Consequences

Supported changes can prune unrelated object-member consumers without changing
the file graph or `dependencyChains`. `changedSymbols` and symbol chains expose
qualified names. Any uncertainty preserves the existing conservative result.
