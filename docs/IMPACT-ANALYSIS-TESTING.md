# 变更影响分析：测试计划

## 测试目标

验证通用变更影响分析能够从统一 diff 和目标清单中稳定地产生保守、可解释的 entry/package 影响结果；同时验证其不会将输入错误、不可分析文件或配置类变更伪装成普通依赖关系。

## Issue #20 回归与发布验真

- `parser/__tests__/symbols.test.ts`：导出来源、别名、namespace、UTF-8 行号及不支持语法。
- `impact/__tests__/symbol-diff.test.ts`：多 hunk、零上下文增删行、失配/畸形/缺失 hunk、声明外变更。
- `impact/__tests__/symbol-impact.test.ts`：A/B namespace 复现、私有 helper、具名/默认导出、
  动态访问/整体传递、歧义/循环、副作用、模块结构变化、package 自身变更及精化先于链数限制。
- `cli/__tests__/cli.test.ts`：摘要和 JSON 同时呈现符号判断与回退，排除规则仍独立生效。
- 发布前执行 `pnpm build`、`pnpm test:run`、`pnpm typecheck`、`pnpm lint`。
- 构建后以及 npm 发布后，分别运行 Issue #20 链接的原始
  `repro/generated-barrel-fanout`（`chore/impact-generated-barrel-repro` 分支）。使用其
  当前源码和 diff，不配置排除，应只命中 page-a；将 page-b 改成动态 namespace 访问后，
  应恢复 2/2 并给出 `precision: 'file'` 与 `fallbackReason`。
- 验证 `excludeChangedFiles` 仍产生“未分析”诊断，不能充当符号精度证明。

## Issue #22/#23 回归（0.1.9）

- `type-noop-impact.test.ts`：interface/type-alias、类型别名/namespace/inline 导入、返回值注解，
  同类型两个字段仍都命中，不同类型消费者被剔除；复杂类型、合并、类型/运行时切换、副作用回退。
- `parser/__tests__/semantic.test.ts`：普通注释/格式、运行时及类型结构保留、字面量边界、
  指令内容/锚点/空白、JSDoc 契约和未知标记注释保护。
- CLI：从统一配置读取 `includeTypeOnly`；JSON 与摘要均区分 `semantic-noop` 与主动排除。
- 复验 Issue #20 的 runtime 精化、图查询不变、全局规则、混合文件变更、过期 diff 及新增文件。
- 验证构建后及从 npm 全新安装的 `0.1.9` CLI 输出，不能只依赖单元测试；`0.1.8` 不支持这些新增能力。

## Issue #25 后续回归（0.1.10）

- 类型增长前后保留 `eslint-disable` / `@ts-nocheck` / `eslint-enable` 包装，只命中对应类型消费者。
- HTTP(S) Markdown 文档链接版本变化在包装内产生 `semantic-noop`，包括目标自身文件；验证序列化报告。
- 指令移动、改序、增删、修改、跨声明及 `@ts-ignore` 跨普通注释移动仍被保护。
- 保留 UTF-8 字节定位、嵌套表达式严格回退、未知标记与不安全/畸形链接保护。
- 反向 diff 还原覆盖无末尾换行、一个末尾换行、多个末尾换行；缺失换行标记仍回退。
- 构建后及从 npm 全新安装的 `0.1.10` CLI 使用两个原始复现生成摘要与 JSON 报告；`0.1.9` 不支持此次修复。

## 分层策略

| 层级 | 位置 | 覆盖内容 |
| --- | --- | --- |
| diff 解析单元测试 | `packages/core/src/impact/__tests__/` | unified diff 文件状态、路径规范化、变更行范围、非法输入。 |
| 影响算法单元测试 | `packages/core/src/impact/__tests__/` | 反向遍历、级别判定、去重、链路上限、排序和诊断。 |
| 核心集成测试 | `packages/core/src/__tests__/` | `analyzeImpact()` 与 parser/resolver/graph、tsconfig paths、workspace 配置的组合。 |
| CLI 测试 | `packages/cli/src/__tests__/` | 参数读取、目标 JSON、报告写入、摘要和失败退出码。 |

所有测试使用 Vitest。应优先通过 `mkdtempSync` 创建小型临时项目，并在测试结束后使用 `rmSync(..., { recursive: true, force: true })` 清理。

## 测试夹具

为影响分析建立最小项目夹具。entry 目标由测试直接提供，不测试 AI skill：

```text
src/
  pages/
    HomePage.tsx       -> components/Card.tsx
    AdminPage.tsx      -> components/Card.tsx
  components/
    Card.tsx           -> utils/format.ts
  utils/
    format.ts
```

目标清单：

```json
[
  { "kind": "entry", "id": "/", "file": "src/pages/HomePage.tsx", "symbol": "HomePage" },
  { "kind": "entry", "id": "/admin", "file": "src/pages/AdminPage.tsx", "symbol": "AdminPage" }
]
```

每个 diff fixture 都必须与该临时项目的“新版本”文件一致。

## 必测场景

### 1. Diff 与输入验证

- 解析单文件修改、新增、删除、重命名和多文件 unified diff。
- 支持带 `a/`、`b/` 前缀的标准 Git diff 路径。
- 拒绝缺少文件头、内容不完整或路径越出 `root` 的 diff。
- 为空 diff、空目标清单、重复目标、冲突目标 ID 分别断言其规定行为。
- 验证根目录 `depic.config.json` 可提供分析选项和 `impact.targets`，显式参数可以覆盖配置。
- 验证所有返回路径均相对于 `root`，不泄漏临时目录绝对路径。

### 2. 正常依赖传播

- 直接修改 entry 文件：仅该 entry 为 `direct`。
- 修改 entry 直接依赖：entry 为 `direct`，链为两节点。
- 修改深层工具模块：两个 entry 均为 `transitive`，链经过 `Card.tsx`。
- entry 通过纯 re-export barrel 引用变更实现：完整链保留 barrel，但分级仍为 `direct`。
- 同一 entry 由两个变更文件影响：entry 仅出现一次，变更文件集合完整。
- 一个文件包含两个 entry：修改该文件时两者均受影响。
- 无任何目标可达的文件变更：影响目标为空，没有错误。
- 建立两个 workspace package：变更 provider package 文件时，provider 与 consumer package 均被报告。
- 多条路径、重复边和循环依赖：结果不重复、不会无限循环，最短链正确。
- `EntryTarget.symbol` 不限制入口中的其他声明；对支持的声明变更精化 barrel 传播，不确定时保留文件级结果。

### 3. 模块类型与解析能力

- 默认时只通过 `import type` 相连的 entry 不受影响。
- `includeTypeOnly: true` 时，上述 entry 受影响且链路可解释。
- 覆盖相对导入、tsconfig paths、workspace 包导入、动态导入、CSS/资源导入。
- 通过 `include`/`exclude` 验证被排除文件无法匹配 entry/package 时会产生 warning。

### 4. 全局影响与不可分析项

- 修改 `package.json`、`tsconfig.json` 和用户配置的 `globalImpactPatterns` 匹配文件时，所有有效目标均为 `global`。
- 断言全局影响没有 `dependencyChains`，但有明确触发文件。
- 锁文件和二进制 diff 仅产生诊断，不影响具体目标。
- 删除文件只产生基线图诊断；纯重命名和带内容修改的重命名都让目标路径沿 head 图传播，
  并断言诊断保留旧路径的基线不确定性。重命名到全局配置路径时仍触发全局影响。
- entry 文件不存在、package 不存在、普通变更文件无法进入图时，其他可分析目标结果仍正确。

### 5. 报告限制与确定性

- 构造多路径图，验证 `maxChainsPerTarget` 和 `maxTotalChains` 的限制。
- 构造字典序靠前的长链和靠后的直接链，验证截断时仍优先保留直接链，并设置目标级与报告级 `truncated` 标记。
- 打乱 `ImpactTarget` 与 diff 文件顺序，多次运行，断言 JSON 结果字节级稳定或在标准化后完全一致。
- 使用较大合成图验证算法在预期时间和内存范围内完成；基准只用于回归，不作为不稳定的单测门槛。

### 6. CLI

- 使用真实临时 diff 文件和目标 JSON 运行 `depic impact`。
- 断言 stdout 只含摘要，报告文件是完整有效 JSON。
- 验证 `--report` 不存在时的约定行为、不可写路径、缺少参数、无效 JSON、无效 diff 和冲突页面 ID 的非零退出码。
- 断言 CLI 报告与直接调用 `analyzeImpact()` 的核心字段一致。
- 验证 `depic init` 对新项目整体忽略 `.depic/`，并将旧选择性规则迁移为整目录忽略。
- 配置 `impact.excludeChangedFiles`，验证摘要出现 `Excluded changed files (not analyzed)`，JSON 记录对应诊断，普通 `analyze` 仍保留完整节点。

### 7. 生成文件变更过滤（Issue #17）

自动化用例：`packages/core/src/impact/__tests__/exclude-changed-files.test.ts`。

- 两个页面经 namespace/barrel 分别消费 `fetchA`、`fetchB`；旧排除用例使用无法校验的占位 hunk，仍保守报告两个页面；真实匹配的 hunk 由 Issue #20 用例验证仅影响 A。
- 配置 `src/generated/**` 后，修改 A 不触发目标，但诊断明确记录 A 未分析，目标总数不变。
- 混合修改生成文件与手写依赖：只排除前者，后者仍沿生成模块传播；直接 `analyze()` 的图不变。
- 覆盖 API 传入、根配置读取、API 替换列表及 `[]` 取消过滤。
- 覆盖精确路径、单层/跨层 glob、`**/` 零层匹配、路径规范化、正则特殊字符按字面匹配。
- 覆盖多文件乱序与重复、新增、删除、重命名、未建图文件，以及从排除目录移出的重命名。
- 覆盖排除全局配置文件、未排除的全局配置文件与排除文件混合输入、报告诊断始终保留。
- 覆盖非法类型、空模式、绝对路径和越界路径错误；过滤不能绕过 diff 输入验证。

## 回归门禁

实现完成后至少执行：

```bash
pnpm --filter @depic/core test:run
pnpm --filter @depic/cli test:run
pnpm typecheck
pnpm lint
pnpm build
```

影响核心图遍历或公开类型时，还应运行完整测试：

```bash
pnpm test:run
```

## 完成定义

功能可合并的最低条件是：验收文档中 A–E 的每项都有对应自动化测试或明确的人工验收记录；核心 API、CLI、报告路径和所有诊断均已覆盖；全量测试、类型检查、lint 与构建通过。
