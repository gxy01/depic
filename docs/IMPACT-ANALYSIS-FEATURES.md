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
- 新增和修改文件使用 head 图分析。重命名目标路径也沿 head 图保守传播，并输出包含旧路径
  基线限制的诊断；删除文件只产出诊断。精确分析旧路径消费者仍需要旧版本依赖图。
- 依赖传播默认忽略 `import type` 与 type-only re-export；可通过选项开启。

## 统一配置

Depic 从项目根目录的 `depic.config.json` 读取分析与影响配置：

```json
{
  "include": ["src/**/*.{ts,tsx}"],
  "exclude": ["**/*.test.ts"],
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
  /** 只过滤输入 diff 的根目录相对 glob，不修改依赖图；默认空数组。 */
  excludeChangedFiles?: string[];
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

### 主动排除变更文件（Issue #17）

可在根配置设置 `impact.excludeChangedFiles: ["src/generated/**"]`，或通过 API 同名选项覆盖。
该能力在 `0.1.6` 及更早版本中不可用。默认不排除；API 列表替换配置列表，显式 `[]` 取消配置过滤。

- 仅过滤从 diff 解析出的文件，不作为顶层 `exclude` 传给 `analyze()`，不移除节点或边。
- 模式相对于 `root`；支持 `*`（路径段内）、`**`（跨路径段）和 `**/`（零层或多层目录），
  其他字符按字面匹配，不支持取反或 brace 展开；可选 `./`、Windows 分隔符会被规范化。
- 非数组、非字符串、空模式、绝对路径及含 `..` 路径段的模式均报错。
- 过滤发生在全局影响识别及文件状态诊断之前，适用于新增、修改、删除、重命名和未建图文件。
  删除匹配旧路径，重命名匹配新路径；从生成目录移出的文件不能仅因旧路径命中而被过滤。
- 匹配文件从 `changedFiles` 和影响触发文件中移除，报告增加 `excluded-changed-files` warning，
  其 `files` 是排序、去重后的完整过滤列表。全局影响返回和全部文件被过滤时也保留该诊断。
- 被排除文件仍能作为其他变更的中间依赖节点；被排除的 entry/package 文件仍参与目标发现。
- “未分析”不等于“无影响”。该选项会主动跳过匹配文件的真实影响，不能默认开启或作为符号级分析替代品。

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
   按 `excludeChangedFiles` 过滤解析后的路径，并记录被过滤文件的诊断。
2. 使用既有 `analyze()` 和传入的 `AnalyzeOptions` 构建当前工作区依赖图。
3. 标准化并验证目标；相同目标去重，同一 `id` 映射到不同目标时报错。
4. 将 `entry` 解析为单个入口文件，将 `package` 解析为包内所有文件。
5. 若 diff 命中全局影响模式，将所有有效目标标记为 `global`，记录触发文件，不构造虚假依赖链。
6. 对每个可分析变更文件沿依赖图的反向边遍历到目标文件；重命名使用目标路径并保持文件级保守传播。
7. 使用广度优先遍历，优先返回最短依赖链，再返回受限数量的同长度或更长链路；包内变更直接影响所属包。
8. 收集无法映射入口/包、删除文件、重命名旧路径限制、未建图文件和链路截断等诊断。

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
- CLI 不列出未命中的目标；调用方可用完整目标清单减去 `impacts` 得到该集合，
  但存在过滤或其他不完整分析诊断时，不得将其视为已证明无影响。

### Git 文件归属

- 根目录 `depic.config.json` 是可审查、可共享的统一项目配置，建议团队复用时提交。
- `.depic/` 只存放 diff、影响报告、缓存和临时文件等运行产物，默认整目录忽略。
- `depic init` 写入 `.depic/` 忽略规则，并把短期存在过的选择性规则迁移回整目录忽略。
- CLI 不执行 `git add` 或 `git commit`；是否提交根配置由用户决定。

## 符号级精化（0.1.8 / Issue #20）

- 在文件可达性基础上，对实际匹配当前源码的 unified hunks 反向还原旧源码，将新增/删除行
  映射到顶层声明；旧/新模块结构必须一致。无需读取 Git 或增加配置。
- 支持函数、函数表达式/箭头函数和简单常量声明，沿局部 helper 引用、具名/别名
  re-export、`export *`、`export * as ns`、namespace 静态成员（含 `ns['member']`）追踪。
- 只有完整追踪证明不相交时才剔除目标。动态成员、namespace 整体传递、歧义/循环导出、
  顶层副作用/副作用导入、class/复杂初始化等不支持语法、结构变化、diff 失配和预算耗尽
  均保留文件级结果。`0.1.8` 类型契约分析不精化；目标自身/所属 package 文件变更仍直接命中。
- 不把 `EntryTarget.symbol` 当作过滤条件：入口文件内全部声明作为起点。
- `symbolEvidence` 按目标和变更文件输出（包括被剔除候选）：`targetId`、`changedFile`、
  `precision: 'symbol' | 'file'`、`affected`、可选 `changedSymbols`、符号 `chain` 或
  `fallbackReason`。全局影响不做符号判断，可省略此字段。
- 既有 `dependencyChains` 和图 API 保持文件级语义；符号来源看 `symbolEvidence.chain`。
  CLI 摘要显示精化/文件级判断数量与回退原因。证据不是行为正确性证明。
- 精化先于链数限制；`excludeChangedFiles` 独立且更早执行，不作为精化手段。

## 类型契约与无效变更精化（0.1.9 / Issue #22、#23）

- 复用 `includeTypeOnly`，不新增配置。开启后记录 interface/type-alias 的位置与引用，
  追踪类型注解、具名/别名/星号 type re-export、namespace 类型成员和本地类型别名。
  `changedSymbols` 精确到声明，不到字段；同一类型的所有消费者仍保守命中。
- 索引访问、条件/映射/import type、声明合并、类型/值重名、模块结构变化、副作用、导出歧义
  保留明确回退。type-only 与运行时边的切换纳入结构检查；默认运行时分析不变。
- 非全局修改文件经完整 hunk 校验后，对比旧/新完整 AST（保留运行时、类型、字面量原始内容），
  仅移除位置/解析器上下文；普通注释/格式变化在整个文件等价时不传播。
- 工具指令及未知标记注释保留原文、代码锚点和相邻空白；变化或移动触发保守回退。
  字符串、正则、模板内容和 JSX 文本中的注释样式字符不视为注释。
- `semantic-noop` 诊断列出经校验而移除的文件，与 `excluded-changed-files` 的未分析文件区分。
  前者不进入 `changedFiles`/`impacts`，不删除图节点；目标自身/所属包的此类变更也不直接命中。
- 排除规则仍最先执行，全局配置规则不被 no-op 检查覆盖；新增/删除/重命名、失配/缺失 hunk、
  解析不确定或混合有效变更保留现有保守路径。不做逐 hunk 语义过滤或通用源码反射分析。
- 以上能力需要 `0.1.9` 或更高版本，`0.1.8` 不支持。

## 指令包装与文档链接（0.1.10 / Issue #25）

- 顶层声明间的指令按边界序号及相邻声明身份归属；声明内部增长不再使末尾包装指令误判变化。
  具名声明以类型/名称识别，其他语句保留完整结构；内部指令仍使用严格代码偏移。
- 保留指令原文、顺序与相邻空白；除已识别的范围/文件级指令外，还检查相对声明边界的物理行位置，
  避免 `@ts-ignore` 与普通注释换位后错误放行。新增、删除、改写、跨声明或不确定归属仍保守处理。
- 仅明确的纯文本标签 HTTP(S) Markdown 链接按普通文档识别；未知标记、畸形/非 HTTP(S) 链接、
  带认证信息的链接、工具指令和类型注释不因此被忽略。仍需完整 AST 等价才能报告 `semantic-noop`。
- 反向还原 diff 保留未改变的 EOF 换行；涉及换行缺失标记的 diff 继续回退，不推测旧文件状态。
- 不新增配置、不改变报告结构；以上修复需要 `0.1.10` 或更高版本，`0.1.9` 不支持。

## Oxlint 控制注释（0.1.13 / Issue #31）

- 含 Oxlint 控制标记的注释按受保护指令处理，不参与普通文档注释归一化。
- `oxlint-disable` / `oxlint-enable` 的原文、规则列表、顺序和声明边界 attachment 必须一致；
  增删、改写、改序或跨声明移动均触发 `directive-comment-changed` 文件级回退。
- 未变化的范围包装允许内部声明增长，并继续使用既有的安全符号级/类型精化；
  `oxlint-disable-next-line` 等行敏感形式仍保留严格行位置。
- target 自身与 dependency 文件均不得因 Oxlint 指令变化产生 `semantic-noop`。

## 导出对象成员精化（0.1.14 / Issue #33）

- 安全的 `export const object = { ... }` 会为受支持成员建立 `object.member` 限定符号；
  静态点访问与字符串字面量键访问沿该限定符号传播。
- 成员实现变更只命中读取该成员的目标；`changedSymbols` 与
  `symbolEvidence.chain` 均保留限定成员名，文件级 `dependencyChains` 不变。
- 只接受可静态证明的函数/简单字面量成员。动态键、动态访问、成员写入/删除、整体对象
  逃逸、spread、getter/setter、不支持的值、重复成员及结构变化均保守回退。
- 支持静态对象成员调用作为目标声明初始化；普通裸函数调用仍按既有顶层副作用规则回退。

## 可操作的链路截断（0.1.15 / Issue #34）

- `chain-limit-reached` 按被截断 target 分别输出；`chainLimit` 记录 target ID、已返回链数、
  已知至少链数、当前单 target/全报告限制及实际限制来源。
- 诊断保留一条已证明遗漏的依赖链样本，并同时给出可复制的 CLI 参数和 JSON 配置恢复方式。
- 截断的影响项通过 `knownMinimumPathCount` 区分返回链数与已证明下界；实际总数可能更高。
- 全报告预算耗尽时仍继续搜索到第一条实际链再标记 target，避免把“未返回链”误写成“未受影响”。
- CLI 的 `--max-chains-per-target` / `--max-total-chains` 仅覆盖单次运行，优先于共享配置；
  两者必须是正整数，退出状态仍保持成功。

## 未映射源码与非源码变更分类（0.1.16 / Issue #35）

- configured global-impact patterns 优先；命中的 README 等非源码文件仍产生全局影响。
- 不在 head 依赖图中的变更路径会采用最终合并后的顶层 `include`、`exclude`、
  `extensions` 分类，而不是只检查固定扩展名。
- 被 `include` 命中且未被 `exclude` 排除，或属于默认/配置源码扩展名的路径，继续产生
  warning 级 `unmapped-file`。这覆盖解析失败、gitignore、配置和潜在 graph gap。
- 其余预期不入源码图的文档/产物产生 info 级 `non-source-file`。该诊断继续出现在 JSON
  和 CLI 独立摘要中，不是自动 ignore，也不表示“无影响”。
- CLI 的最终诊断摘要分别统计 warning 和 info，避免把普通非源码信息显示为 warning。

## 非目标

- 不在 Depic 内部识别路由、框架组件、页面或任务入口。
- 不基于 LLM 判断代码改动是否真的改变用户可见行为。
- 不做完整 JavaScript 数据流/类型推导；`EntryTarget.symbol` 仅用于展示和稳定标识。
- 未能通过上述符号证明的共享聚合模块仍按文件级可达性保守传播。
- 删除文件不提供影响目标；重命名只覆盖 head 图中的目标路径消费者，不宣称覆盖旧路径消费者。
- 第一版不生成 Markdown 详细报告；JSON 是机器可读的正式输出。
