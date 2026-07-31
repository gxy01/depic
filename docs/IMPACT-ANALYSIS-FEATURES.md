# 变更影响分析：功能清单

## 目标

给定 diff 应用后的项目工作区、标准 unified diff 和影响目标清单，识别**可能受本次变更影响的入口与 monorepo package**。结果适用于 CI、编辑器和自动化 agent。

本功能只做静态、可复现的依赖影响分析；不判断某个实现改动是否一定改变用户可见行为。

面向编码 Agent 的推荐入口是仓库中的官方
[`depic-impact-analysis`](../skills/depic-impact-analysis/SKILL.md) Skill。它负责检查项目、提出并确认目标、维护配置和解释报告；Depic Core/CLI 负责确定性的依赖分析。

## 术语

| 术语 | 含义 |
| --- | --- |
| 入口目标（`EntryTarget`） | 上游 AI skill 识别的页面、任务或其他入口，包含稳定 ID、相对项目根目录的文件路径和可选函数/class 名。 |
| 包目标（`PackageTarget`） | 以 workspace package name 标识的 monorepo package；其成员文件由 Depic 自动识别。 |
| 变更文件 | 从 unified diff 中解析出的新增或修改文件。 |
| 影响目标 | 其入口文件或包内文件直接或传递依赖某个变更文件的目标。 |
| 有效跳数 | 依赖链中除纯 re-export 外的模块跳数；barrel re-export 不增加有效跳数。 |
| 全局影响 | 命中配置类文件，无法用具体模块链路表达、应建议验证所有目标的影响。 |

## 范围与边界

- `root` 必须是 diff 应用后的工作区（diff 的新版本）。
- Depic 不读取 Git 状态，也不调用或绑定任何 AI 模型。
- 官方 Agent Skill 是 `entry` 目标识别的上游；Depic 不解析 React、Vue 或其他框架路由规则。
- `EntryTarget.file` 使用相对 `root` 的路径，Depic 标准化为绝对路径参与现有依赖图计算。
- `package` 目标根据文件最近的 `package.json` 的 `name` 匹配，无需 AI 标注每个包内文件。
- 第一版精确支持新增和修改文件。删除和重命名文件只产出诊断：精确分析需要旧版本的依赖图。
- 依赖传播默认忽略 `import type` 与 type-only re-export；可通过选项开启。

## 统一配置

Depic 从项目根目录的 `depic.config.json` 读取分析与影响配置：

```json
{
  "include": ["src/**/*.{ts,tsx}"],
  "exclude": ["src/generated/**"],
  "tsconfigPath": "./tsconfig.json",
  "impact": {
    "includeTypeOnly": false,
    "globalImpactPatterns": ["config/**"],
    "targets": [
      {
        "kind": "entry",
        "id": "/users",
        "file": "src/pages/UsersPage.tsx",
        "symbol": "UsersPage"
      },
      {
        "kind": "package",
        "id": "@acme/ui",
        "package": "@acme/ui"
      }
    ]
  }
}
```

顶层可复用 `AnalyzeOptions` 中除 `root` 外的配置；`impact` 包含目标和影响分析专属选项。相对的 `tsconfigPath` 与 `workspace.root` 均以项目根目录解析。显式 API 参数优先于配置文件；`--targets` 仅作为临时或旧格式兼容覆盖。

## API

在 `@depic/core` 中提供框架无关的 API：

```ts
interface EntryTarget {
  kind: 'entry';
  /** 稳定标识，例如路由路径或任务 ID。 */
  id: string;
  /** 相对于 analyzeImpact.root 的入口文件。 */
  file: string;
  /** 可选的组件、函数或 class 名，仅用于标识。 */
  symbol?: string;
  metadata?: Record<string, unknown>;
}

interface PackageTarget {
  kind: 'package';
  id: string;
  package: string;
  metadata?: Record<string, unknown>;
}

type ImpactTarget = EntryTarget | PackageTarget;

interface ImpactOptions extends AnalyzeOptions {
  /** 标准 unified diff 文本。 */
  diff: string;
  /** 可选覆盖 depic.config.json 中的影响目标。 */
  targets?: ImpactTarget[];
  /** 命中即触发全局影响的额外 glob 模式。 */
  globalImpactPatterns?: string[];
  /** 是否让 type-only 边参与传播，默认 false。 */
  includeTypeOnly?: boolean;
  /** 每个目标最多保留的依赖链条数。 */
  maxChainsPerTarget?: number;
  /** 全部报告最多保留的依赖链条数。 */
  maxTotalChains?: number;
}

function analyzeImpact(options: ImpactOptions): Promise<ImpactReport>;
```

`ImpactOptions` 复用 `AnalyzeOptions` 的 `include`、`exclude`、`tsconfigPath`、`extensions` 和 `workspace`，以保证依赖图构建规则与既有 `analyze()` 一致。

## 结果

`ImpactReport` 至少包含以下信息：

```ts
type ImpactKind = 'direct' | 'transitive' | 'global';

interface TargetImpact {
  target: ImpactTarget;
  impact: ImpactKind;
  changedFiles: string[];
  /** global 影响为空；其他影响至少包含一条解释链。 */
  dependencyChains: string[][];
  pathCount: number;
  truncated: boolean;
}

interface ImpactReport {
  totalTargetCount: number;
  impactedTargetCount: number;
  changedFiles: string[];
  impacts: TargetImpact[];
  diagnostics: ImpactDiagnostic[];
  truncated: boolean;
}
```

入口路径与详细报告中的路径均使用相对 `root` 的形式，方便在 CI 和不同开发机器间复用。结果顺序必须稳定：目标按 `ImpactTarget.id` 排序，链路按长度及字典序排序。`direct` 表示目标自身变更，或目标到变更文件的有效跳数不超过 1；纯 re-export barrel 对分级透明，但仍保留在 `dependencyChains` 中用于解释。

## 影响计算

1. 验证并解析 unified diff，提取新增/修改/删除/重命名文件及其变更行范围。
2. 使用既有 `analyze()` 和传入的 `AnalyzeOptions` 构建当前工作区依赖图。
3. 标准化并验证目标；相同目标去重，同一 `id` 映射到不同目标时报错。
4. 将 `entry` 解析为单个入口文件，将 `package` 解析为包内所有文件。
5. 若 diff 命中全局影响模式，将所有有效目标标记为 `global`，记录触发文件，不构造虚假依赖链。
6. 对每个可分析变更文件，沿依赖图的反向边遍历到目标文件。
7. 使用广度优先遍历，优先返回最短依赖链，再返回受限数量的同长度或更长链路；包内变更直接影响所属包。
8. 收集无法映射入口/包、删除/重命名文件、未建图文件和链路截断等诊断。

## CLI

提供对核心 API 的薄封装：

```bash
depic impact \
  --diff ./change.diff \
  --report ./depic-impact.json
```

- 标准输出：目标数量、受影响目标、影响级别、关键变更文件和诊断摘要。
- `--report`：写入完整 JSON 报告，包含依赖链和截断信息。
- `--targets`：可选的旧格式目标数组，用于临时覆盖根配置。
- CLI 不列出未受影响目标；调用方可用完整目标清单减去 `impacts` 得到该集合。

### Git 文件归属

- 根目录 `depic.config.json` 是可审查、可共享的统一项目配置，建议团队复用时提交。
- `.depic/` 只存放 diff、影响报告、缓存和临时文件等运行产物，默认整目录忽略。
- `depic init` 写入 `.depic/` 忽略规则，并把短期存在过的选择性规则迁移回整目录忽略。
- CLI 不执行 `git add` 或 `git commit`；是否提交根配置由用户决定。

## 非目标

- 不在 Depic 内部识别路由、框架组件、页面或任务入口。
- 不基于 LLM 判断代码改动是否真的改变用户可见行为。
- 第一版不以函数级依赖来过滤入口影响；`EntryTarget.symbol` 仅用于展示和稳定标识。
- 共享聚合模块只要在文件级依赖链上可达就会保守地传播影响，即使入口实际使用的是该文件中的另一个 symbol。
- 第一版不对删除/重命名提供精确影响结论。
- 第一版不生成 Markdown 详细报告；JSON 是机器可读的正式输出。
