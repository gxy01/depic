# Depic

A JavaScript/TypeScript dependency analysis toolkit powered by SWC. Parse source code into module dependency graphs, with circular dependency detection, topological sorting, and interactive visualization.

🌐 **[Live Demo →](https://gxy01.github.io/depic/)** — Try depic analyzing itself, with interactive WebGL graph, tree view, and search.

## Architecture

```
┌──────────────────────────────┐
│           CLI                │  Command-line interface
├──────────────────────────────┤
│         VS Code              │  IDE integration
├──────────────────────────────┤
│         Web UI / API         │  Interactive visualization
├──────────────────────────────┤
│                              │
│           core               │  Core engine
│   ┌─────┐ ┌──────┐ ┌──────┐ │
│   │parser│ │resolv│ │graph │ │
│   └─────┘ └──────┘ └──────┘ │
│                              │
└──────────────────────────────┘
```

## Packages

| Package | Description | npm |
|---|---|---|
| `@depic/core` | Core engine: parsing, resolution, graph operations | `npm i @depic/core` |
| `@depic/cli` | Command-line tool | `npm i @depic/cli` |
| `@depic/web` | Interactive web UI & server | `npm i @depic/web` |
| `depic-vscode` | VS Code extension | VS Code Marketplace |
| `depic-impact-analysis` | Official agent skill for change impact analysis | `npx skills add https://github.com/gxy01/depic --skill depic-impact-analysis` |

## Development

```bash
pnpm install   # Install dependencies
pnpm build     # Build all packages
pnpm test      # Run tests
pnpm typecheck # Type-check
```

## Tech Stack

**TypeScript** · **SWC** · **Vitest** · **pnpm** monorepo
