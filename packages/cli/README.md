# @depic/cli

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

Command-line interface for depic. Analyze dependencies, detect cycles, find dependents, and generate interactive graphs — all from your terminal.

## Install

```bash
npm i @depic/cli
```

## Commands

```bash
depic analyze <root>     # Analyze project, output JSON
       --dot             # Output as Graphviz DOT
       --output <file>   # Write to file

depic cycles <root>      # Detect circular dependencies

depic dependents <file>  # Find files that import the given file

depic stats <root>       # Show dependency statistics

depic web <root>         # Generate interactive HTML graph
       --output <file>   # Output path (default: deps.html)

depic serve <root>       # Start local web server with live graph
       --port <n>        # Port (default: 3000)
```

## Examples

```bash
# Analyze and save as JSON
depic analyze ./src --output deps.json

# Check for circular deps
depic cycles ./src

# Generate interactive graph
depic web ./src --output graph.html

# Start live server
depic serve ./src --port 8080
```

---

<a name="chinese"></a>

depic 命令行工具。在终端中分析依赖、检测循环、查找上游引用、生成交互式依赖图。

## 安装

```bash
npm i @depic/cli
```

## 命令

```bash
depic analyze <root>     # 分析项目，输出 JSON
       --dot             # 输出 Graphviz DOT 格式
       --output <file>   # 写入文件

depic cycles <root>      # 检测循环依赖

depic dependents <file>  # 查找哪些文件引用了指定文件

depic stats <root>       # 输出统计信息

depic web <root>         # 生成交互式 HTML 依赖图
       --output <file>   # 输出路径（默认: deps.html）

depic serve <root>       # 启动本地 Web 服务器，实时查看依赖图
       --port <n>        # 端口（默认: 3000）
```

## 示例

```bash
# 分析项目并保存 JSON
depic analyze ./src --output deps.json

# 检查循环依赖
depic cycles ./src

# 生成交互式图
depic web ./src --output graph.html

# 启动实时服务
depic serve ./src --port 8080
```
