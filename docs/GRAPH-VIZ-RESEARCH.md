# 海量节点依赖图可视化方案调研

## 背景

当前 depic Web 可视化使用 **vis-network** (CDN standalone)，在 Argos 项目（3,751 文件、11,078 条边）上表现不佳：
- 力导向布局计算缓慢（stabilization 需要多次迭代）
- 渲染 3,700+ 节点时帧率明显下降
- 缺乏针对依赖图的专用交互（如按类型筛选、聚焦高依赖节点）
- vis-network 社区活跃度下降

## 候选方案对比

| 方案 | 渲染引擎 | 最大规模 | CDN可用 | 开源 | 适合度 |
|---|---|---|---|---|---|
| **Sigma.js v2 + Graphology** | WebGL | 100k+ 节点 | ✅ cdnjs | MIT | ⭐⭐⭐⭐⭐ |
| **Cytoscape.js** | Canvas | 10k-50k | ✅ unpkg | MIT | ⭐⭐⭐⭐ |
| **AntV G6** | Canvas+WebGL | 10k+ | ✅ unpkg | Apache 2.0 | ⭐⭐⭐⭐ |
| **El Grapho** | WebGL | 百万级 | ❌ 仅npm | MIT | ⭐⭐ |

## 详细分析

### 1. Sigma.js v2 + Graphology（推荐）

**Sigma.js** 是专为大规模图可视化设计的 WebGL 库，**Graphology** 是配套的图数据结构库。

**优势：**
- WebGL 渲染，硬件加速，3,700 节点轻松达到 60fps
- Graphology 提供丰富的图算法（布局、聚类、遍历）
- CDN 可用 (`cdnjs.cloudflare.com`)，适合自包含 HTML
- 轻量：sigma ~80KB + graphology ~40KB (gzip)
- 内置 NodeReducer / EdgeReducer 机制，可按需隐藏节点
- v2 处于活跃开发中

**劣势：**
- v2 与 v1 不兼容，文档较少
- 需要同时学习 sigma 和 graphology 两个 API
- 交互功能（hover、click）需手动实现

**CDN 链接：**
```
https://cdnjs.cloudflare.com/ajax/libs/sigma.js/2.4.0/sigma.min.js
https://cdnjs.cloudflare.com/ajax/libs/graphology/0.25.4/graphology.umd.min.js
```

### 2. Cytoscape.js

**优势：**
- 生态最成熟，社区庞大，插件丰富
- 内置 dagre（DAG 层级布局）、klay、cola 等多种布局
- 丰富的图算法（BFS、DFS、PageRank 等）
- 有专门的依赖图插件 (`cytoscape-dagre`, `cytoscape-cose-bilkent`)
- CDN 可用

**劣势：**
- Canvas 渲染，节点数超过 5,000 时性能下降
- 包体积较大（~200KB+ gzip 含布局插件）
- 与 React 集成需额外包装

### 3. AntV G6

由蚂蚁集团开发，是国内最活跃的图可视化库。

**优势：**
- Canvas + WebGL 双引擎
- 13+ 内置布局算法
- TypeScript 原生支持
- 中文文档丰富
- 支持节点分组、鱼眼放大等高级交互

**劣势：**
- 包体积大（~500KB+）
- CDN 仅通过 unpkg，国内访问可能慢
- 依赖图的专用场景不如 sigma.js 灵活
- API 较复杂

### 4. El Grapho

WebGL 原生，宣称支持百万级节点。

**劣势：**
- 维护不活跃，最后更新 2021 年
- 无 CDN（仅 npm）
- 文档稀缺
- 不推荐

## 推荐方案：Sigma.js v2 + Graphology

| 维度 | 评分 | 说明 |
|---|---|---|
| 海量节点性能 | ⭐⭐⭐⭐⭐ | WebGL 渲染，3,000-10,000 节点毫无压力 |
| CDN 可用 | ⭐⭐⭐⭐⭐ | cdnjs 直接引用，无需构建 |
| 包体积 | ⭐⭐⭐⭐⭐ | ~120KB（sigma+graphology） |
| 交互灵活性 | ⭐⭐⭐⭐ | 需手动实现部分交互，但自由度极高 |
| 生态系统 | ⭐⭐⭐⭐ | graphology 布局和算法插件丰富 |
| 维护活跃度 | ⭐⭐⭐⭐ | sigma v2 活跃开发中 |

## 备选方案：Cytoscape.js

如果 Sigma.js 集成遇到问题，Cytoscape.js 是最可靠的备选：
- 更成熟稳定
- Canvas 渲染对 3,000 节点足够用
- 内置更多开箱即用的功能

## 调研来源

- [Sigma.js Quickstart](https://www.sigmajs.org/docs/quickstart/)
- [NPM Compare: cytoscape vs g6 vs d3 vs sigma vs vis-network](https://npm-compare.com/chart.js,cytoscape,d3,react-vis,sigma,vis-network)
- [A Comparison of Javascript Graph / Network Visualisation Libraries](https://practicaldev-herokuapp-com.freetls.fastly.net/timlrx/a-comparison-of-javascript-graph-network-visualisation-libraries-34a8)
- [JointJS Performance: Testing diagrams with 100,000 nodes](https://www.jointjs.com/blog/jointjs-performance-overview-testing-diagrams-with-100-000-nodes)
