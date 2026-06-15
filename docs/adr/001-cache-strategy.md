# ADR 001: 缓存策略

## 日期

2026-06-15

## 状态

已采纳

## 背景

`analyze()` 在大型 monorepo 项目中（9000+ 文件）耗时约 7-30s。用户反馈在同一 commit 下反复执行命令时响应慢，需要缓存。

## 决策

**采用 commit 级别的内存缓存，不采用文件级磁盘缓存。**

### 方案对比

#### 方案 A：文件级磁盘缓存（已否决）

将每个 `ParsedFile`（SWC 解析结果）按 workspace package 分片持久化到 `.depic/cache/`。commit 变更时只重新解析 `git diff` 发现的变化文件。

**实测结果（argos-fe 项目，9200 文件，48346 条边）：**

| 阶段 | 耗时 | 占比 |
|---|---|---|
| SWC 解析（parseFile） | ~4s | 13% |
| 模块解析（resolver.resolve） | ~15s | 52% |
| 图构建（nodes + edges） | ~8s | 28% |
| I/O（读源文件 + 写缓存） | ~2s | 7% |

缓存了 SWC 解析后，第二次运行仍需 ~27.5s（仅节省 ~1.5s），因为 **52% 的时间花在 Resolver（路径补全、tsconfig paths 匹配、文件存在性检查）上**，这步无论如何都要重做。

**结论：文件级缓存收益极低，增加了代码复杂度（分片逻辑、缓存失效、manifest 管理），不值得。**

#### 方案 B：commit 级内存缓存（已采纳）

在 VS Code extension / CLI 进程生命周期内，以 `root@commit` 为 key 缓存完整的 `DependencyGraph`。

```
Map<string, DependencyGraph>
     key = `${workspaceRoot}@${git rev-parse HEAD}`
```

**行为：**

| 场景 | 行为 |
|---|---|
| 同一 commit，重复调用 | 内存命中，**0ms** |
| commit 变动 | 缓存失效，全量重跑 |
| uncommitted 改动 | 缓存失效（`git status --porcelain` 检测到 `.ts/.tsx` 修改） |

**优势：**
- 零磁盘 I/O
- 零代码复杂度
- 解决 90% 的实际场景（用户在同一 commit 下反复查看不同文件的依赖关系）

## 性能剖面

附着分析耗时分解（argos-fe 项目，Apple M 系列芯片）：

| 阶段 | 耗时 | 说明 |
|---|---|---|
| 文件发现（glob walk） | ~0.5s | 7600+ 文件遍历 |
| I/O（readFileSync × 7600） | ~2s | 平均 0.27ms/文件 |
| SWC 解析 | ~4s | 方差极大：普通文件 0.3ms，自动生成的大文件 340ms |
| 模块解析 | ~15s | 48346 次 `fs.existsSync` + tsconfig paths 匹配 |
| 图构建 | ~8s | 节点 + 边 + 邻接表 |

**瓶颈不是 I/O，不是 SWC，而是模块解析和`fs.existsSync`。**

## 影响

- VS Code extension 使用 `graphCache` Map，命令间共享
- CLI 工具每调用一次 `analyze()` 全量运行（无跨进程缓存）
- `parseFile` 启用 `tsx: true`（之前因缺少此配置导致所有 `.tsx` 文件被静默跳过）

## 参见

- [[002-tsx-parsing-fix]] — TSX 解析修复
- `packages/core/src/analyze.ts` — 主分析入口
- `packages/vscode/src/extension.ts` — VS Code extension 缓存实现
