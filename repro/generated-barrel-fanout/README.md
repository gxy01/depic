# Minimal reproduction

Requires `@depic/cli` 0.1.6. Run from this directory:

```bash
depic impact . --diff change.diff --report /tmp/depic-impact-report.json
```

Only `src/generated/a.ts` changed. `page-a` calls `fetchA`; `page-b` calls only
`fetchB`. Both targets are currently reported as impacted because both import the
namespace exported through the shared barrel.
