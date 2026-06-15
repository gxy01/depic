# 海量节点依赖图可视化方案调研

## 第一部分：渲染引擎对比

### 背景

当前 depic Web 可视化使用 **vis-network** (CDN standalone)，在 Argos 项目（3,751 文件、11,078 条边）上表现不佳：
- 力导向布局计算缓慢（stabilization 需要多次迭代）
- 渲染 3,700+ 节点时帧率明显下降
- 缺乏针对依赖图的专用交互

### 候选方案

| 方案 | 渲染引擎 | 最大规模 | CDN可用 | Bundle | 开源 |
|---|---|---|---|---|---|
| **Sigma.js v2 + Graphology** | WebGL | 100k+ | ✅ cdnjs | ~120KB | MIT |
| **Cytoscape.js** | Canvas | 10k-50k | ✅ unpkg | ~200KB | MIT |
| **AntV G6** | Canvas+WebGL | 10k+ | ✅ unpkg | ~500KB | Apache 2.0 |
| **El Grapho** | WebGL | 1M+ | ❌ npm only | - | MIT |

### 推荐：Sigma.js v2 + Graphology

| 维度 | 评分 | 说明 |
|---|---|---|
| 海量节点性能 | ⭐⭐⭐⭐⭐ | WebGL 渲染，10,000 节点 60fps |
| CDN 可用 | ⭐⭐⭐⭐⭐ | cdnjs 直接引用，自包含 HTML |
| 包体积 | ⭐⭐⭐⭐⭐ | ~120KB（sigma + graphology） |
| 交互灵活性 | ⭐⭐⭐⭐ | 需手动实现部分交互，自由度极高 |
| 生态系统 | ⭐⭐⭐⭐ | graphology 布局和算法插件丰富 |

### 备选：Cytoscape.js

Canvas 渲染，对 3,000 节点足够用。生态更成熟，插件丰富。如果 Sigma.js 集成遇到困难，这是最可靠的备选。

---

## 第二部分：交互模式调研

### 对标产品分析

调研了 10+ 个代码依赖图可视化产品和工具，提取最佳交互模式：

#### 1. npmgraph / npm.anvaka.com
Anvaka 的 npm 包依赖可视化，WebGL 渲染，是 depic 最直接的对标产品。

| 交互特性 | 描述 |
|---|---|
| ✅ 力导向布局 | 节点自然分布，物理引擎实时交互 |
| ✅ 内容感知渲染 | 缩放级别低时只显示重要节点，放大后展开细节 |
| ✅ 节点搜索 | 输入包名 → 高亮 + 聚焦该节点 |
| ✅ 点击展开 | 点击节点显示详情面板（版本、依赖数、被依赖数） |
| ✅ 缩放拖拽 | 滚轮缩放，拖拽平移 |
| ✅ 颜色编码 | 按类型/状态给节点着色 |

#### 2. Node Modules Inspector (antfu)
多视图切换的依赖分析工具：

| 交互特性 | 描述 |
|---|---|
| ✅ 多视图 | Graph（图）/ Grid（网格）/ Report（报告）/ Chart（图表）/ Compare（对比） |
| ✅ 筛选排序 | 按大小、依赖深度、类型筛选 |
| ✅ 列表视图 | 依赖列表 + 树状展开，适合精确查找 |
| ✅ 导出报告 | 生成可分享的分析报告 |

#### 3. Code Cartographer
生成自包含 HTML 的力导向图（与 depic 形态最接近）：

| 交互特性 | 描述 |
|---|---|
| ✅ 三布局 | Hierarchical（层级）/ Force-Directed（力导向）/ Random |
| ✅ 物理开关 | 启用/禁用物理模拟（停止抖动） |
| ✅ 颜色编码 | TS 蓝色、JS 黄色、ESM 浅蓝、CJS 绿色 |
| ✅ 节点/边大小控制 | 按依赖数量缩放节点和边 |
| ✅ 自包含 HTML | 一个文件，浏览器直接打开 |

#### 4. Codebase Graph Visualizer
基于 D3.js + Neo4j 的代码库可视化：

| 交互特性 | 描述 |
|---|---|
| ✅ 实时筛选 | 按组件类型（FILE/FUNCTION/CLASS/MODULE）和关系类型筛选 |
| ✅ 物理滑块 | 力强度、链接距离、电荷的可调节滑块 |
| ✅ 侧边栏 | 统计面板 + 工具提示 + JSON 导出 |

#### 5. GitKraken Codemaps
商用级代码依赖图（2025 年推出）：

| 交互特性 | 描述 |
|---|---|
| ✅ 上下游依赖 | 聚焦一个文件，展开其上游（谁依赖它）和下游（它依赖谁） |
| ✅ 交互式导览 | 预设路径的引导式浏览 |
| ✅ 颜色编码 | 按模块/类型/风险等级着色 |
| ✅ 协作共享 | 团队共享视图，架构决策辅助 |

#### 6. dep_graph_rs (Rust 生态)
Rust crate 内部依赖分析工具：

| 交互特性 | 描述 |
|---|---|
| ✅ 正则筛选 | 按文件名模式筛选源和目标 |
| ✅ DOT 输出 | 标准 Graphviz 格式 |
| ✅ 查询语言 | AND/OR/NOT 逻辑组合筛选 |

---

### 交互模式提取：depic 应该具备什么

#### 核心交互（P0 — 必须具备）

| 交互 | 对标来源 | 说明 |
|---|---|---|
| 🔍 **搜索 + 聚焦** | npmgraph, GitKraken | 输入文件名 → 高亮节点，相机飞入 |
| 🖱️ **点击展开详情** | npmgraph, Code Cartographer | 点击节点 → 侧边栏：文件路径、导入/导出列表、依赖数 |
| 🎨 **颜色编码** | 所有对标产品 | 文件=蓝、外部依赖=橙、循环依赖=红 |
| 🔗 **上下游高亮** | GitKraken | 悬停节点 → 高亮所有直接依赖和被依赖节点 |
| 📊 **统计面板** | Codebase Graph Viz | 节点数、边数、环数、外部依赖数 |
| ⏸️ **物理启停** | Code Cartographer | 布局稳定后停止物理模拟，减少 CPU 占用 |

#### 增强交互（P1 — 显著提升体验）

| 交互 | 对标来源 | 说明 |
|---|---|---|
| 🏗️ **多布局切换** | Code Cartographer, Node Modules Inspector | 力导向 / 层级 / 环形布局 |
| 📂 **节点分组/折叠** | npmgraph, reality-map | 按目录折叠子节点，展开后逐级显示 |
| 🔬 **内容感知渲染 (LOD)** | npmgraph | 缩放级别低时合并小节点为 cluster，放大后展开 |
| 📋 **列表/表格视图** | Node Modules Inspector | 除了图，还提供排序列表，按依赖数、文件名排序 |
| 🚦 **风险标记** | GitKraken | 循环依赖节点红色高亮，标注环的大小 |
| 📤 **导出** | 多个对标产品 | DOT / PNG / JSON 导出 |

#### 锦上添花（P2）

| 交互 | 对标来源 | 说明 |
|---|---|---|
| 🧭 **交互式导览** | GitKraken | "下一个循环依赖"引导按钮 |
| 📐 **Mini Map** | vizzpy, 多个产品 | 右下角小地图，在大图中快速定位 |
| 🌓 **暗色/亮色主题** | Node Modules Inspector | 跟随系统或手动切换 |
| 🎥 **动画调用流** | CodeInsight | 边上的流动粒子展示调用方向 |

---

### 推荐交互方案（第一期）

Sigma.js v2 为渲染引擎，实现以下 P0 交互：

```
┌────────────────────────────────────────────┐
│ 🔍 Search files…         📊 3751 files    │  ← Toolbar
│                       11078 edges  168 cycles│
├────────────────────────────────────────────┤
│                                            │
│         🔵 ──→ 🔵 ──→ 🔵                  │
│         │      │      │                    │  ← Graph Canvas
│         ↓      ↓      ↓                    │    (WebGL)
│         🔵     🟠     🔵                  │
│                                            │
├────────────────────────────────────────────┤
│ Click a node to see details                │  ← Bottom Bar
│ ./src/services/service.ts                  │
│   Imports: 12  ·  Dependents: 253          │
│   ⚠ In 37 cycles                          │
└────────────────────────────────────────────┘
```

核心特性：
1. **搜索框** — 实时筛选 + 相机飞行
2. **悬停高亮** — 上下游依赖高亮，其余节点半透明
3. **点击详情** — 底部面板显示文件信息
4. **颜色编码** — 蓝色(文件) / 橙色(外部) / 红色(在环中)
5. **物理启停** — 布局稳定后锁定
6. **缩放 + Pan** — Sigma.js 内置

---

## 调研来源

- [Sigma.js Quickstart](https://www.sigmajs.org/docs/quickstart/)
- [NPM Compare: cytoscape vs g6 vs d3 vs sigma vs vis-network](https://npm-compare.com/chart.js,cytoscape,d3,react-vis,sigma,vis-network)
- [A Comparison of Javascript Graph / Network Visualisation Libraries](https://practicaldev-herokuapp-com.freetls.fastly.net/timlrx/a-comparison-of-javascript-graph-network-visualisation-libraries-34a8)
- [npmgraph / npm.anvaka.com](https://npm.anvaka.com) — 在线 npm 依赖图（WebGL）
- [Node Modules Inspector](https://node-modules.dev) — 多视图依赖分析
- [Code Cartographer](https://www.npmjs.com/package/code-cartographer) — 自包含 HTML 力导向图
- [dep_graph_rs](https://github.com/PSeitz/dep_graph_rs) — Rust 生态依赖分析
