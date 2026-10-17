# dsh-plugin-gmt

DeepSeek Harness（DSH）插件：图形化使用固美特 **gmtMcp** 云端 ERP 能力。

## 能力

- 左侧「固美特ERP」入口 + 功能目录树（按业务分组）
- 工具关键字段表单 → 一键发起对话
- 场景快捷卡、常用/最近、历史会话
- 设置：MCP 云端配置、whoami/连通测试、工具启停、角色预设
- 一键安装 Skills；提示安装 `dsh-mcp-connector` / `@changfenhuang/dsh-genui`

## 快速安装

见 [docs/安装到DSH操作说明.md](docs/安装到DSH操作说明.md)。

```bash
dsh plugin --profile desktop add dsh-mcp-connector
dsh plugin --profile desktop add @changfenhuang/dsh-genui
dsh plugin --profile desktop add "D:/Code/nodejs/dsh-plugin-gmt"
```

安装后**重启 DSH**，打开「固美特ERP」→ 设置里填写云端 MCP → 测试连接 → 导出 JSON 到 MCP 连接器。

## 开发

```bash
npm run lint
npm run catalog:sync
node scripts/sync-catalog.mjs ../python/gmtMcp/app/erp/queries.py
```

## 安全

- ERP 令牌只写入本机 `~/.dsh/storages/gmt-erp/mcp-secrets.json`
- 仓库与文档不包含真实 token
