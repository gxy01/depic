# @depic/web

交互式依赖图可视化。生成一个包含 React 应用的自包含 HTML 文件，支持数千个文件的依赖图浏览。

[English](https://github.com/gxy01/depic/blob/main/packages/web/README.md) | 中文

## 特性

- **Sigma.js WebGL** — 硬件加速，3,000+ 节点流畅渲染
- **三视图** — Graph（力导向图）、Tree（react-virtuoso 虚拟滚动）、File（详情面板）
- **搜索自动补全** — cmdk 命令面板，文件名模糊匹配
- **包筛选器** — Monorepo 支持：自动检测子包，下拉框筛选
- **循环依赖高亮** — 环中文件红色标记
- **自包含** — 单个 HTML 文件，无需服务器

## 安装

```bash
npm install @depic/web
```

## 用法

```ts
import { analyze } from '@depic/core';
import { generateHtmlFromGraph } from '@depic/web';
import { writeFileSync } from 'node:fs';

const graph = await analyze({ root: '/path/to/project' });
const html = generateHtmlFromGraph(graph, 'My Project');
writeFileSync('deps.html', html);
```

或通过 CLI：

```bash
npx depic web /path/to/project
npx depic serve /path/to/project  # 启动本地服务器 :3000
```

## License

MIT
