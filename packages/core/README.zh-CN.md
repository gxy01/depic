# @depic/core

JS/TS 代码依赖分析核心引擎。基于 SWC 解析源码，构建项目依赖图。

[English](https://github.com/gxy01/depic/blob/main/packages/core/README.md) | 中文

## 特性

- **Parser** — 通过 SWC AST 提取 `import`/`export`/`require`，支持 15+ 种语法
- **Resolver** — 解析 specifier：相对路径、tsconfig paths（含嵌套）、node_modules、monorepo workspace 包
- **Graph** — 有向图，支持环检测、传递依赖、依赖路径、符号溯源（re-export / export * 链路）
- **Monorepo** — 自动检测 package.json 边界，支持 include/exclude glob 过滤
- **符号级分析** — 可选 `symbolLevel`，`resolveSymbol()` 追踪符号原始定义
- **变更影响分析** — 将 unified diff 映射到入口或 monorepo package，返回可能受影响目标及依赖链

## 安装

```bash
npm install @depic/core
```

## 使用

```ts
import { analyze } from '@depic/core';

const graph = await analyze({ root: '/path/to/project' });

// 循环依赖检测
graph.getCircularDependencies();

// 谁依赖了某个文件
graph.getDependents('/path/to/file.ts');

// 两个文件间的所有依赖路径
graph.getDependencyChain('a.ts', 'b.ts');

// 符号溯源
graph.resolveSymbol('index.ts', 'formatDate');

// 统计
graph.stats(); // { fileCount, edgeCount, externalCount, ... }

// 导出
graph.toJSON();
graph.toDot();
```

### 变更影响分析

传入变更后的项目工作区、unified diff 和影响目标。`entry` 目标由框架工具或官方
[`depic-impact-analysis`](https://github.com/gxy01/depic/blob/main/skills/depic-impact-analysis/SKILL.md) Agent
Skill 识别；`package` 目标使用 Depic 自动发现的 monorepo 包名。共享目标统一放在根目录
`depic.config.json` 的 `impact.targets` 中。

Skill 是上游适配器：利用 AI 检查框架约定，并让用户确认有意义的目标。
`@depic/core` 保持确定性和框架无关，只根据已确认的目标节点计算可达性与依赖链。

```ts
import { analyzeImpact } from '@depic/core';

const report = await analyzeImpact({
  root: '/path/to/project',
  diff: diffText,
});

report.impacts; // [{ target, impact, dependencyChains, ... }]
```

`EntryTarget.file` 相对于 `root`。默认忽略 type-only 导入；需要分析类型契约影响时传入 `includeTypeOnly: true`。`package.json` 等配置变更会以全局影响返回。依赖链按最短路径优先，纯 re-export barrel 不会把直接影响误分为传递影响。完整约定见仓库中的 [`IMPACT-ANALYSIS-FEATURES.md`](../../docs/IMPACT-ANALYSIS-FEATURES.md)。

`analyze()` 和 `analyzeImpact()` 都会读取 `depic.config.json`。该文件可配置
`include`、`exclude`、`tsconfigPath`、`extensions`、`symbolLevel`、
`workspace` 与 `impact`；显式 API 参数优先。

若需要主动忽略生成文件的变更，可向 `analyzeImpact()` 传入
`excludeChangedFiles: ['src/generated/**']`，或在根配置设置
`impact.excludeChangedFiles`。API 列表覆盖配置列表，显式 `[]` 可禁用配置中的过滤。
模式相对于 `root`：`*` 不跨目录，`**` 可跨目录，`**/` 可匹配零层目录；其余字符按字面匹配，
可选的 `./` 和 Windows 分隔符会被规范化。`0.1.6` 及更早版本不支持该选项。

过滤发生在全局影响判断之前，只作用于 diff 路径，不修改图发现或遍历。被过滤文件不进入
`changedFiles`；`diagnostics` 中的 `excluded-changed-files` warning 通过 `files`
列出排序、去重后的路径。即使影响数量为零，也只能解释为“未分析”，不能解释为“无影响”。
该能力是主动排除策略，不是符号级精度提升，也不会自动识别生成代码噪声。

## License

MIT
