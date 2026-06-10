# depic-vscode

VS Code extension for JS/TS dependency analysis. Visualize dependency graphs, detect circular dependencies, and explore dependents — right inside your editor.

## Features

- **Dependency Graph** — Interactive visualization in a webview panel
- **Circular Dependencies** — Detect and list cycles in your codebase
- **Dependents** — Find all files that import the current file
- **Statistics** — File counts, edges, external modules at a glance

## Commands

| Command | Description |
|---|---|
| `Depic: Show Dependency Graph` | Open interactive graph for the workspace |
| `Depic: Check Circular Dependencies` | Scan and report circular deps |
| `Depic: Show Dependents of Current File` | List files that depend on active file |
| `Depic: Show Dependency Statistics` | Overall stats for the workspace |

## Requirements

- VS Code `>= 1.85.0`
- A workspace with JS/TS source files
