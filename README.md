# Depic

A JavaScript/TypeScript dependency analysis toolkit powered by SWC. Depic turns
source code into a module dependency graph for exploration, architecture checks,
interactive visualization, and explainable change impact analysis.

🌐 **[Live Demo →](https://gxy01.github.io/depic/)** — Try depic analyzing itself, with interactive WebGL graph, tree view, and search.

## Use cases

| Scenario | What Depic provides | Recommended surface |
|---|---|---|
| Explore an unfamiliar codebase | Searchable module graph, tree and file views | Web UI or VS Code |
| Guard architecture | Circular dependency detection, dependents, package boundaries and symbol tracing | CLI or `@depic/core` |
| Review a code change | Potentially affected pages, routes, jobs or workspace packages with dependency chains | Official Agent Skill + CLI |
| Build custom tooling | Stable graph and impact-analysis APIs | `@depic/core` |

## Architecture

```
Agent Skill ──discovers confirmed targets──> depic.config.json
                                                     │
Unified diff ──> CLI / API ──────────────────────────┤
                                                     ▼
┌────────────────────────────────────────────────────────────┐
│ @depic/core: parser → resolver → dependency graph → impact │
└────────────────────────────────────────────────────────────┘
             │                 │                 │
             ▼                 ▼                 ▼
           CLI              Web UI           VS Code
```

## Packages

| Package | Description | Install |
|---|---|---|
| `@depic/core` | Core engine: parsing, resolution, graph operations | `npm i @depic/core` |
| `@depic/cli` | Command-line tool | `npm i @depic/cli` |
| `@depic/web` | Interactive web UI & server | `npm i @depic/web` |
| `depic-vscode` | VS Code extension | VS Code Marketplace |

## Official Agent Skill

[`depic-impact-analysis`](./skills/depic-impact-analysis/SKILL.md) teaches a
coding agent how to discover and confirm framework-specific application entries
and monorepo package targets, store them in `depic.config.json`, run Depic against
a unified diff, and explain the resulting dependency chains.

```bash
npx skills add gxy01/depic --skill depic-impact-analysis
npm install --save-dev @depic/cli
```

On first use, ask the agent to analyze the impact of a change. The Skill inspects
the repository and proposes targets such as React pages, routes, commands, jobs,
or workspace packages. It must ask for confirmation before writing shared
targets. Depic then performs the deterministic dependency analysis; it does not
delegate graph reachability to the AI model.

Commit `depic.config.json` when the target map should be shared by the team.
Generated diffs and reports belong under the ignored `.depic/` directory. See the
[`@depic/cli` guide](./packages/cli/README.md) for commands and the
[impact-analysis contract](./docs/IMPACT-ANALYSIS-FEATURES.md) for behavior and
limitations.

## Development

```bash
pnpm install   # Install dependencies
pnpm build     # Build all packages
pnpm test:run  # Run tests once
pnpm typecheck # Type-check
```

## Tech Stack

**TypeScript** · **SWC** · **Vitest** · **pnpm** monorepo
