# ADR 008: Make dependency-chain truncation actionable

Status: accepted for release 0.1.15, fixing Issue #34.

## Context

The impact report exposed only boolean `truncated` flags and a generic warning.
Users could not tell which target was incomplete, whether a 20-chain result meant
20 or more paths, which configured limit applied, or how to rerun once with a
larger budget. Exhausting the report-wide budget could also omit later impacted
targets entirely.

## Decision

Search until either all paths are exhausted or one real path beyond the active
capacity is found. The extra path is not added to `dependencyChains`; it proves a
known-minimum count and becomes an omitted-chain sample. Emit one structured
`chain-limit-reached` diagnostic per target with counts, active limits, limiting
scope, the sample, and CLI/config recovery settings. Add optional
`knownMinimumPathCount` to truncated impacts.

If report-wide capacity is zero, continue only until one actual chain is found.
Keep that target in `impacts` with zero returned chains and the proven lower
bound. Add positive-integer CLI overrides for one-off recovery.

## Consequences

The configured chain caps still bound returned chain volume. Truncated reports
are self-explanatory and do not silently imply that later targets are unaffected.
The known minimum is a lower bound, not an exact count, and only one omitted
chain is retained as evidence.
