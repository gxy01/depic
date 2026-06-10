# depic-vscode

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

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

---

<a name="chinese"></a>

VS Code 插件，用于 JS/TS 依赖分析。在编辑器中可视化依赖图、检测循环依赖、查看上游引用。

## 功能

- **依赖图** — 在 Webview 面板中交互式查看依赖关系
- **循环依赖检测** — 扫描并列出代码中的循环引用
- **上游引用** — 找出所有引用了当前文件的文件
- **统计信息** — 文件数、边数、外部模块一览

## 命令

| 命令 | 说明 |
|---|---|
| `Depic: Show Dependency Graph` | 打开工作区的交互式依赖图 |
| `Depic: Check Circular Dependencies` | 扫描并报告循环依赖 |
| `Depic: Show Dependents of Current File` | 列出依赖当前文件的文件 |
| `Depic: Show Dependency Statistics` | 工作区整体统计 |
