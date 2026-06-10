# depic-vscode

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
