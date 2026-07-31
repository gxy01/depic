# 变更影响分析：测试计划

## 测试目标

验证通用变更影响分析能够从统一 diff 和目标清单中稳定地产生保守、可解释的 entry/package 影响结果；同时验证其不会将输入错误、不可分析文件或配置类变更伪装成普通依赖关系。

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
- 入口经共享聚合文件可达变更文件、但 `EntryTarget.symbol` 实际未使用对应导出时，仍保守报告文件级影响，明确第一版的符号过滤边界。

### 3. 模块类型与解析能力

- 默认时只通过 `import type` 相连的 entry 不受影响。
- `includeTypeOnly: true` 时，上述 entry 受影响且链路可解释。
- 覆盖相对导入、tsconfig paths、workspace 包导入、动态导入、CSS/资源导入。
- 通过 `include`/`exclude` 验证被排除文件无法匹配 entry/package 时会产生 warning。

### 4. 全局影响与不可分析项

- 修改 `package.json`、`tsconfig.json` 和用户配置的 `globalImpactPatterns` 匹配文件时，所有有效目标均为 `global`。
- 断言全局影响没有 `dependencyChains`，但有明确触发文件。
- 锁文件和二进制 diff 仅产生诊断，不影响具体目标。
- 删除或重命名文件的 diff 产生基线图诊断，不断言具体页面结果。
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
