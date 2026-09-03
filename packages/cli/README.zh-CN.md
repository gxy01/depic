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
npx skills@latest add gxy01/depic --skill depic-impact-analysis
```

Skill 负责检查仓库和首次目标发现：提出框架相关的 `entry` 目标与 workspace
`package` 目标，询问用户确认，并将共享结果写入 `depic.config.json`。CLI
负责可复现的执行：读取已确认目标和 unified diff，调用 `@depic/core`，
写入详细 JSON 报告并输出简短摘要。Depic 本身不读取 Git 状态，也不调用 AI 模型。

## 命令

```bash
depic --version             输出已安装的 CLI 版本
depic init [root]          配置 .depic 运行产物的 Git 忽略规则
depic analyze <root>       分析项目，输出 JSON（--dot 输出 Graphviz 格式）
depic cycles <root>        检测循环依赖
depic dependents <file>    查看谁依赖了某个文件
depic stats <root>         输出统计信息
depic impact [root] --diff <path> [--targets <path>] --report <path> [--baseline-root <path>]
                            根据 unified diff 输出可能受影响的入口和 package
depic web <root> [output]  生成交互式 HTML 可视化
depic serve <root> [port]  启动本地 Web 服务器
```

运行 `depic --help` 查看命令概览，或运行 `depic <command> --help` 查看某个命令的
参数和选项。`impact` 帮助还会列出 `depic.config.json` 配置，包括
`impact.maxChainsPerTarget` 和 `impact.maxTotalChains`。

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

`impact` 会统一解析 `diff --git`、`---` / `+++`、rename 和 copy 字段中的 Git
C-style quoted UTF-8 pathname，包括空格、引号和 POSIX 反斜杠。非法 escape、
无效 UTF-8、绝对路径或 traversal 会在写 report 前失败；当前不支持任意非 UTF-8
Git 文件名。

### 符号级影响精化（0.1.8+）

对支持的代码，影响分析自动沿具名/别名 re-export、星号 barrel 和静态 namespace
成员追踪变更声明。只修改 `fetchA`，不再必然影响只调用 `generatedClient.fetchB()`
的页面。diff 必须与变更后源码一致；无法确认来源、动态访问/整体传递 namespace、
副作用、结构变化和不支持的语法均保留文件级影响。`EntryTarget.symbol` 仍是标识，
不会限制为只分析入口文件中的某个函数。

CLI 摘要按“目标/变更文件”显示精化/文件级数量及回退原因；JSON 的 `symbolEvidence`
记录受影响和被剔除的判断，包含 `precision`、`affected`、`changedSymbols`、符号
`chain` 或 `fallbackReason`。原 `dependencyChains` 仍是文件级链路。无需配置排除规则，
也不改变依赖图查询的语义。

### 类型契约与纯注释/格式变更（0.1.9+）

在已有 `depic.config.json` 中设置 `impact.includeTypeOnly: true`，启用受支持的
interface/type-alias 传播。`changedSymbols` 标识声明，不是字段；两个目标都使用
`UserConfig` 时仍会同时命中。不支持的类型、声明合并、副作用或来源歧义保持明确的文件级回退。

经校验的纯注释/排版文件会输出 `Semantic no-op files (checked AST equivalence): ...`
和 `semantic-noop` 诊断，表示“已检查”，不同于排除规则的“未分析”。运行时/类型变更和
指令注释变化不能被忽略。这是整个文件的 AST 对比，不是通用语义等价或混合 hunk 过滤。
这两项新增能力需要 `0.1.9` 或更高版本。

未改变的顶层指令包装及纯文本标签 HTTP(S) Markdown 文档链接场景请使用 `0.1.10+`：
前面的声明增长或文档 URL 变化不再单独阻断受支持的精化；指令改动和归属不确定仍回退。
无需新增配置。

### 重命名文件（0.1.12+）

重命名后的目标路径会作为 head 工作区依赖图中的保守文件级变更参与分析；即使当前消费者
没有出现在 diff 中，也能进入 `impacts`。报告同时输出 `renamed-file` warning，并在消息中
指出旧路径：缺少基线图时，仍无法精确分析继续引用旧路径的消费者。删除文件仍只输出诊断，
重命名目标不参与符号级精化或 no-op 剔除。

### Oxlint 控制注释（0.1.13+）

Oxlint 指令不会再被检查型 no-op 剔除。`oxlint-disable` / `oxlint-enable` 切换、
规则列表修改、增删、改序和控制范围移动均保留保守文件级影响；未变化且 attachment
稳定的范围包装仍允许在文件内部进行受支持的符号级/类型精化。

### 导出对象成员（0.1.14+）

受支持的导出对象字面量会在 `changedSymbols` 和符号链中使用 `client.fetchA`
这类限定名称。静态点访问和字符串键访问可剔除只消费其他成员的目标；动态访问、写入、
整体对象逃逸、spread、getter/setter 和不确定结构仍按文件级传播，并在
`symbolEvidence` 中给出 `fallbackReason`。

### 可操作的链路截断（0.1.15+）

达到链路上限时，摘要会逐一指出被截断 target，显示“已返回 / 已知至少”链数和当前限制，
给出一条已证明遗漏的链，并输出可复制的恢复设置。可用以下参数仅覆盖本次运行：

```bash
depic impact . --diff change.diff --report report.json \
  --max-chains-per-target 40 --max-total-chains 20000
```

### 非源码变更与 graph gap（0.1.16+）

紧凑输出会把普通文档/产物列为 `Non-source changed files (outside analyzed graph)`。
JSON 报告使用 `level: "info"` 的 `non-source-file`，文件仍然可见但不在源码图中传播。
缺失的源码类路径或按配置本应进入分析的路径仍为 `unmapped-file` warning。分类采用
最终生效的顶层 `include`、`exclude` 和 `extensions`，全局影响规则仍然优先。

### 删除文件与 baseline checkout（0.1.17+）

纯删除在 head 图中没有节点。请把变更前源码放在独立目录，并显式传入：

```bash
git worktree add --detach /tmp/depic-baseline <base-revision>
depic impact . --diff change.diff --report report.json \
  --baseline-root /tmp/depic-baseline
```

Depic 会构建两张图，旧图证明的链标记 `analysisBasis: "baseline"`，与 head 证据合并时
标记 `"mixed"`。baseline 不可用时，JSON 仍在 `changedFiles` 保留删除路径，把顶层
`analysisStatus` 设为 `"incomplete"`，并在 `unresolvedChanges` 中提供
`status: "unknown"`、reason 与 recovery action。CLI 会醒目输出
`INCOMPLETE impact analysis`。分析本身成功时命令仍返回 0；CI 必须读取
`analysisStatus`，不能仅凭退出码或空 `impacts` 判断覆盖完整。

### 只忽略生成文件的变更

把下面的可选设置合并到已有配置，保留原来的 `impact.targets`：

```json
{
  "impact": {
    "excludeChangedFiles": ["src/generated/**"]
  }
}
```

与顶层 `exclude` 不同，该设置只过滤 diff 路径，不删除图中的模块；分析其他变更时，
依赖链仍可经过这些生成文件。模式相对于项目根目录，支持 `*`（不跨目录）、`**`（跨目录）
和 `**/`（零层或多层目录），其他字符按字面匹配。过滤优先于全局影响判断；删除取旧路径，
重命名取新路径。

CLI 摘要会输出 `Excluded changed files (not analyzed): ...`；JSON 报告通过
`excluded-changed-files` warning 的 `files` 列出被过滤文件。“被排除”不等于“无影响”，
它可能跳过真实影响，不是符号级 barrel 分析。`0.1.6` 及更早版本不支持该选项；
使用支持版本时，也应检查对应诊断以确认过滤确实生效。

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

无法修改依赖清单的临时任务可使用 `pnpm dlx @depic/cli@0.1.18 impact ...`，并显式固定版本。

## License

MIT
