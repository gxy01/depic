# 变更影响分析：验收标准

本文件定义 `@depic/core` 的通用变更影响 API 与 `depic impact` 命令的验收条件。所有示例中的 `root` 都是 diff 应用后的代码快照。

## API 与输入

| 编号 | 验收条件 |
| --- | --- |
| A-01 | `@depic/core` 导出 `analyzeImpact()`、`ImpactOptions`、`EntryTarget`、`PackageTarget`、`ImpactTarget` 和报告相关类型。 |
| A-02 | `analyzeImpact()` 使用现有 `AnalyzeOptions` 构建依赖图，且 `include`、`exclude`、`tsconfigPath`、`extensions`、`workspace` 均生效。 |
| A-03 | API 接收标准 unified diff 文本、相对于 `root` 的 entry 路径、package name 和相对于 `root` 的变更路径。 |
| A-04 | 格式无效的 diff 或规范化后逃出 `root` 的路径会抛出可识别的输入错误。 |
| A-05 | 空目标清单返回成功的空影响结果，并包含 warning。 |
| A-06 | 完全重复的目标被去重；同一 ID 映射到不同 entry/package 时失败并说明冲突。 |
| A-07 | 根目录 `depic.config.json` 可同时提供分析选项和 `impact.targets`；显式 API 参数优先。 |
| A-08 | `impact.excludeChangedFiles` 只过滤 diff 路径，默认关闭；API 同名列表替换配置，显式 `[]` 取消过滤，非法模式类型或越界路径报错。 |

## 影响识别

| 编号 | 验收条件 |
| --- | --- |
| B-01 | entry 文件自身出现在新增/修改 diff 中时，该 entry 被标为 `direct`。 |
| B-02 | entry 直接导入的文件变更时，该 entry 被标为 `direct`，并给出依赖链；中间仅经过纯 re-export barrel 时仍为 `direct`。 |
| B-03 | entry 通过一个或多个非 re-export 中间模块依赖变更文件时，标为 `transitive`，并给出完整链。 |
| B-04 | 变更 package 内文件时，该 package 被标为 `direct`。 |
| B-05 | workspace consumer package 依赖发生变更的 provider package 时，consumer package 被报告。 |
| B-06 | 同一变更文件影响多个目标时，所有目标均出现一次，不重复。 |
| B-07 | 多个变更文件影响同一目标时，该目标只出现一次，`changedFiles` 汇总所有相关文件。 |
| B-08 | 环状依赖不会造成死循环、重复目标或不稳定结果。 |
| B-08 | 默认忽略 type-only 边；启用 `includeTypeOnly` 后，type-only 链可以触发影响。 |
| B-09 | 动态导入、CSS 导入和已由现有解析器支持的资源导入按其运行时依赖边参与传播。 |
| B-10 | 生成文件命中过滤后仍在依赖图中，仍可作为非排除变更的中间节点；未排除的变更独立执行符号精化，不确定时按文件保守传播。 |
| B-11 | Issue #20 的 generatedClient fixture：只改 fetchA 实现时仅命中 page-a，不命中只使用 fetchB 的 page-b；不需要配置排除。 |
| B-12 | 支持别名 re-export、星号 re-export、namespace 静态访问和私有 helper；旧/新 diff 校验或模块结构检查失败时不剔除目标。 |
| B-13 | 动态/整体传递 namespace、副作用、歧义/循环导出及不支持语法保留文件级影响并记录回退原因。 |

## 全局影响和诊断

| 编号 | 验收条件 |
| --- | --- |
| C-01 | 默认配置类文件与 `globalImpactPatterns` 命中时，所有有效目标均被标为 `global`。 |
| C-02 | `global` 结果写明触发文件，`dependencyChains` 为空，不能伪造模块依赖链。 |
| C-03 | entry 文件或 package 不在图中时，跳过该目标并在 `diagnostics` 返回 warning，不影响其他目标。 |
| C-04 | 删除或重命名 diff 产生说明需要基线依赖图的诊断；第一版不得宣称给出了精确影响页。 |
| C-05 | 无法构图的普通文件、二进制文件和锁文件会被诊断记录，但不会凭空影响某个目标。 |
| C-06 | 排除先于全局判断和文件状态诊断，报告的 `excluded-changed-files` warning 包含排序、去重的完整路径；全局返回或零影响结果也不得丢失该诊断。 |

## 输出和规模控制

| 编号 | 验收条件 |
| --- | --- |
| D-01 | 报告包含总目标数、受影响目标数、变更文件、影响项、诊断和全局截断状态。 |
| D-02 | 每个影响项包含目标、影响级别、相关变更文件、链数、依赖链及截断状态。 |
| D-03 | 默认每目标和全报告链路数量都有上限；超限结果保留已收集链路并设置 `truncated: true`。 |
| D-04 | 使用广度优先遍历；即使达到链路上限，也至少保留一条全局最短依赖链，除非结果是 `global`。 |
| D-05 | 输出稳定：目标按 ID 排序，链路按长度和字典序排序。 |
| D-06 | `impacts` 不输出未受影响目标；`symbolEvidence` 保留被精化剔除的候选及判断依据。 |
| D-07 | 符号判断包含精度、影响布尔值、变更声明及符号链或回退原因；旧文件级图查询和链路结构不变。 |
| D-08 | 符号传播有步数/深度上限，耗尽时回退而非宣称无影响；精化先于链路截断。 |

## CLI

| 编号 | 验收条件 |
| --- | --- |
| E-01 | `depic impact --diff <path> --report <path>` 默认读取根配置；可选 `--targets <path>` 覆盖目标。 |
| E-02 | CLI 标准输出包含简要结果和诊断摘要，不打印完整链路报告。 |
| E-03 | CLI 将完整、可解析的 JSON 报告写入 `--report` 指定路径。 |
| E-04 | 参数、diff、目标清单或输出路径错误时，CLI 返回非零状态并输出可操作错误信息。 |
| E-05 | `depic init` 整体忽略 `.depic/` 运行产物目录，并把旧的选择性规则迁移为整目录忽略。 |
| E-06 | CLI 从根配置读取排除列表，摘要与 JSON 都明确展示被过滤文件“未分析”，不能让用户误以为“无影响”。 |
