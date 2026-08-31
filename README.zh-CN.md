# Depic

[English](./README.md) | 简体中文

一个基于 SWC 的 JavaScript/TypeScript 依赖分析工具集。Depic 将源码转换为模块依赖图，用于代码库探索、架构检查、交互式可视化和可解释的变更影响分析。

🌐 **[在线演示 →](https://gxy01.github.io/depic/demo.html)** — 使用 Depic 分析自身，体验 WebGL 依赖图、树形视图和搜索。

## 使用场景

| 场景 | Depic 提供的能力 | 推荐入口 |
|---|---|---|
| 理解陌生代码库 | 可搜索的模块依赖图、树形视图和文件视图 | Web UI 或 VS Code |
| 架构治理 | 循环依赖、被依赖关系、Package 边界和符号溯源 | CLI 或 `@depic/core` |
| 评估代码变更 | 找出可能受影响的页面、路由、任务或 workspace package，并给出依赖链 | 官方 Agent Skill + CLI |
| 构建自定义工具 | 稳定的依赖图与影响分析 API | `@depic/core` |

## 架构

```
Agent Skill ──发现并确认目标──> depic.config.json
                                      │
Unified diff ──> CLI / API ───────────┤
                                      ▼
┌────────────────────────────────────────────────────────────┐
│ @depic/core：解析 → 路径解析 → 依赖图 → 影响计算            │
└────────────────────────────────────────────────────────────┘
             │                 │                 │
             ▼                 ▼                 ▼
            CLI              Web UI           VS Code
```

## 包列表

| 包 | 说明 | 安装 |
|---|---|---|
| `@depic/core` | 核心引擎：解析、路径解析、图操作 | `npm i @depic/core` |
| `@depic/cli` | 命令行工具 | `npm i @depic/cli` |
| `@depic/web` | 交互式 Web 界面与服务器 | `npm i @depic/web` |
| `depic-vscode` | VS Code 插件 | VS Code Marketplace |

## 官方 Agent Skill

[`depic-impact-analysis`](./skills/depic-impact-analysis/SKILL.md) 告诉编码 Agent
如何发现并确认框架相关的应用入口和 monorepo package 目标，将其写入
`depic.config.json`，再使用 unified diff 运行 Depic 并解释依赖链。

```bash
npx skills@latest add gxy01/depic --skill depic-impact-analysis
npm install --save-dev @depic/cli
```

第一次使用时，只需让 Agent 分析某个变更的影响。Skill 会检查仓库并提出
React 页面、路由、命令、任务或 workspace package 等候选目标；写入共享配置前必须让用户确认。之后由 Depic 进行确定性的依赖分析，依赖图的可达性不会交给 AI 模型猜测。

从 `0.1.8` 起，影响分析可沿具名/星号 re-export 和静态 namespace 成员追踪变更声明，
减少 barrel 带来的无关目标。不确定时仍保留文件级影响；`symbolEvidence` 记录精化判断
和回退原因。现有文件级依赖图查询不变。

从 `0.1.9` 起，经校验的纯注释/格式变更可记录为 `semantic-noop`；开启 `includeTypeOnly`
后还可按声明精化 interface/type-alias 的影响。这两项新增能力需要 `0.1.9` 或更高版本。

从 `0.1.10` 起，未改变的顶层指令包装不再因前面的声明增长而阻断受支持的精化；
纯文本标签的 HTTP(S) Markdown 链接可参与经校验的纯文档变更识别。指令变化和不确定情况仍保守处理。

从 `0.1.12` 起，重命名后的目标路径会沿 head 依赖图保守传播，不再被直接丢弃；
`renamed-file` 诊断仍会指出需要基线图分析的旧路径消费者。删除文件仍只输出诊断。

从 `0.1.13` 起，Oxlint 控制注释不会再被 `semantic-noop` 剔除；指令变化保守传播，
未变化且 attachment 不变的 `oxlint-disable` / `oxlint-enable` 包装仍可安全进行符号/类型精化。

从 `0.1.14` 起，受支持的导出对象字面量可按静态成员精化。修改 `client.fetchA` 时，
只读取 `client.fetchB` 的消费者可被安全剔除；动态访问、写入、对象逃逸、spread、
getter/setter 和不确定结构仍保留文件级影响。

从 `0.1.15` 起，每个被截断的 target 都会报告“已返回 / 已知至少”链数、当前限制、
一条已证明遗漏的链样本和可复制的恢复设置；CLI 可用 `--max-chains-per-target` 与
`--max-total-chains` 做单次覆盖。

从 `0.1.16` 起，配置源码图之外的变更路径会被分类但不会静默隐藏。预期进入分析或
具有源码扩展名的 graph gap 继续产生 `unmapped-file` warning；普通文档和产物变更
使用机器可区分的 info 级 `non-source-file` 诊断，并显示在紧凑摘要中。分类会采用
最终生效的 `include`、`exclude` 和 `extensions` 配置。

需要主动忽略生成文件的变更时，可使用 `impact.excludeChangedFiles` 只过滤输入 diff，
保留依赖图中的模块。报告会明确记录“未分析”，不能解释成“无影响”；用法见下方 CLI 文档
（`0.1.6` 及更早版本不支持该选项）。

需要团队共享时提交 `depic.config.json`；生成的 diff 和报告放在已忽略的
`.depic/` 目录。命令用法见 [`@depic/cli` 文档](./packages/cli/README.zh-CN.md)，完整行为与限制见[变更影响分析功能清单](./docs/IMPACT-ANALYSIS-FEATURES.md)。

## 开发

```bash
pnpm install   # 安装依赖
pnpm build     # 构建所有包
pnpm test:run  # 单次运行全部测试
pnpm typecheck # 类型检查
```

## 技术栈

**TypeScript** · **SWC** · **Vitest** · **pnpm** monorepo
