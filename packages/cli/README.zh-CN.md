# @depic/cli

JS/TS 代码依赖分析命令行工具。

[English](https://github.com/gxy01/depic/blob/main/packages/cli/README.md) | 中文

## 安装

```bash
npm install @depic/cli
```

## 命令

```bash
depic analyze <root>       分析项目，输出 JSON（--dot 输出 Graphviz 格式）
depic cycles <root>        检测循环依赖
depic dependents <file>    查看谁依赖了某个文件
depic stats <root>         输出统计信息
depic web <root> [output]  生成交互式 HTML 可视化
depic serve <root> [port]  启动本地 Web 服务器
```

## License

MIT
