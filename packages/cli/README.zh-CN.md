# @depic/cli

JS/TS 代码依赖分析命令行工具。

[English](https://github.com/gxy01/depic/blob/main/packages/cli/README.md) | 中文

## 安装

```bash
npm install @depic/cli
```

## Agent 辅助的变更影响分析

当用户想知道某次变更可能影响哪些页面、路由、任务或 monorepo package 时，推荐先安装官方
[`depic-impact-analysis`](https://github.com/gxy01/depic/blob/main/skills/depic-impact-analysis/SKILL.md) Skill：

```bash
npx skills add gxy01/depic --skill depic-impact-analysis
```

Skill 负责检查仓库和首次目标发现：提出框架相关的 `entry` 目标与 workspace
`package` 目标，询问用户确认，并将共享结果写入 `depic.config.json`。CLI
负责可复现的执行：读取已确认目标和 unified diff，调用 `@depic/core`，
写入详细 JSON 报告并输出简短摘要。Depic 本身不读取 Git 状态，也不调用 AI 模型。

## 命令

```bash
depic init [root]          配置 .depic 运行产物的 Git 忽略规则
depic analyze <root>       分析项目，输出 JSON（--dot 输出 Graphviz 格式）
depic cycles <root>        检测循环依赖
depic dependents <file>    查看谁依赖了某个文件
depic stats <root>         输出统计信息
depic impact [root] --diff <path> [--targets <path>] --report <path>
                            根据 unified diff 输出可能受影响的入口和 package
depic web <root> [output]  生成交互式 HTML 可视化
depic serve <root> [port]  启动本地 Web 服务器
```

默认从项目根目录统一的 `depic.config.json` 读取影响目标：

```json
{
  "impact": {
    "targets": [
      { "kind": "entry", "id": "/users", "file": "src/pages/UsersPage.tsx", "symbol": "UsersPage" },
      { "kind": "package", "id": "@acme/ui", "package": "@acme/ui" }
    ]
  }
}
```

同一配置还可以包含 `include`、`exclude`、`tsconfigPath`、`extensions`、
`symbolLevel`、`workspace` 和影响分析选项。显式 API/CLI 参数优先；
`--targets` 仅作为临时或旧配置兼容覆盖。

## CI

在使用方项目中将固定版本的 `@depic/cli` 加入 `devDependencies` 并提交 lockfile；CI 通过包管理器执行，不使用全局安装：

```bash
pnpm install --frozen-lockfile
pnpm exec depic impact . \
  --diff .depic/change.diff \
  --report .depic/impact-report.json
```

在 Git 仓库中首次使用时运行一次 `depic init .`。它会让整个 `.depic/`
运行产物目录保持忽略。需要团队共享时，请审查并提交根目录的
`depic.config.json`。

无法修改依赖清单的临时任务可使用 `pnpm dlx @depic/cli@0.1.5 impact ...`，并显式固定版本。

## License

MIT
