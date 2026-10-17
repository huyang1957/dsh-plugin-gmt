# 固美特 ERP 插件 · 安装到 DeepSeek Harness（DSH）

本插件包名：`dsh-plugin-gmt`  
本地路径示例：`D:/Code/nodejs/dsh-plugin-gmt`

作用：在 DSH 左侧增加「固美特ERP」入口，用图形化表单调用云端 **gmtMcp**，并协助安装技能与依赖插件。

---

## 1. 前置条件

1. 已安装 **DeepSeek Harness Desktop** 或可用的 `dsh` CLI。
2. 确认 profile：Desktop 用户常用 `desktop`；纯 Web 用 `web`。下文以 `desktop` 为例，可替换为 `web`。
3. 已有云端 MCP 凭证（与 Cursor `mcp.json` 的 `gmt-erp-cloud` 相同字段）：
   - `url`：如 `https://mcp.f.szgoodmate.com:2443/mcp`
   - `Authorization`：`Bearer <ERP_ACCESSTOKEN>`
   - `X-Enterprise`
   - `X-Erp-Base-Url`
   - `X-Erp-User`
   - `X-Erp-User-Token`

> 令牌只填本机，不要提交到 Git。

---

## 2. 安装依赖插件（推荐）

在终端执行：

```bash
dsh plugin --profile desktop add dsh-mcp-connector
dsh plugin --profile desktop add @changfenhuang/dsh-genui
```

- **dsh-mcp-connector**：管理 MCP 连接、导入 `mcpServers` JSON、排障。
- **@changfenhuang/dsh-genui**：让助手回复可渲染交互表格/图表，问数体验更好。

---

## 3. 安装本插件

```bash
dsh plugin --profile desktop add "D:/Code/nodejs/dsh-plugin-gmt"
```
dsh plugin --profile desktop add dsh-plugin-gmt

路径按你机器实际位置修改（建议用正斜杠）。

若 `dsh plugin add` 因 **pnpm lockfile / minimumReleaseAge** 等策略失败，可手工完成两步（本机已验证可用）：

1. 在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的 `dependencies` 增加：
   `"dsh-plugin-gmt": "link:D:/Code/nodejs/dsh-plugin-gmt"`
2. 在同文件 `dsh.profile.bundles` 数组末尾增加：`"dsh-plugin-gmt"`
3. 在该 profile 目录执行：`pnpm install`（若仍被策略拦截，确认 `node_modules/dsh-plugin-gmt` 已是指向源码的 link 即可）

**必须完全重启** DeepSeek Harness Desktop（或重启 `dsh --profile desktop` / `dsh web`），bundle 才会加载。

---

## 4. MCP 配置（优先复用连接器）

若你**已经**用 `dsh-mcp-connector` 配好了固美特云端 MCP（如 `gmt-erp-cloud`）：

1. 打开 **固美特ERP**，健康条应显示「已接连接器：xxx」。
2. **无需再在本插件设置里重复填令牌**；可直接点功能发起对话。
3. 若有多条连接，在设置里「选用已有连接」切换即可。

仅当连接器里还没有固美特连接时：

1. 进入插件 **设置** → 展开「高级：手动配置」。
2. 填写云端 URL 与 headers，或导出 JSON 到 MCP连接器导入并启用。
3. 点 **测试连接** 验证。

---

## 5. 安装 Skills（强烈建议）

仍在插件 **设置 → 安装 Skills**：

- 最小包：勾选 `gmt-erp-mcp` + `gmt-erp-manual` → 安装
- 按角色加装：`gmt-erp-morning`（晨会）、`gmt-erp-order`（一单全景）、`gmt-erp-chase`（催款催料）

技能会复制到：`%USERPROFILE%\.dsh\skills\`  
安装后如未生效，重启 DSH 或新开会话。

---

## 6. 验证是否跑通

1. 侧栏点场景卡 **首页待办**，或打开工具 `get_home_todo_notice`。
2. 点 **发起对话使用** → 应打开新会话并带入提示词草稿。
3. 发送后，Agent 应通过已连接的 MCP 调用工具并返回结果。
4. 再试「今天有什么风险」（`get_exception_digest`）或「客户单号 xxx 整单情况」（`explain_order`）。

选型红线：

| 说法 | 应用工具 |
|------|----------|
| 齐套 | `query_vir_stock` |
| 缺料 | `query_shortage` |
| 怎么报工/操作 | `search_operation_manual` |

---

## 7. 常用功能说明

| 功能 | 位置 |
|------|------|
| 功能目录树 | 左侧「功能」按分组展开 |
| 场景快捷卡 | 晨会风险 / 首页待办 / 一单全景 等 |
| 工具表单 | 填关键字段 → 发起对话 |
| 常用 / 最近 | 「常用/最近」页，星标收藏 |
| 历史 | 「历史」页，可重新发起 |
| 工具启停 / 角色预设 | 「设置」 |
| 写操作确认 | `create_purchase_drafts` 默认不确认；勾选 confirm 会二次确认 |

偏好与密钥本地路径：

- `%USERPROFILE%\.dsh\storages\gmt-erp\prefs.json`
- `%USERPROFILE%\.dsh\storages\gmt-erp\mcp-secrets.json`

---

## 8. 排障

| 现象 | 处理 |
|------|------|
| 侧栏没有「固美特ERP」 | ① **完全退出** Desktop 再开（不只刷新页）；② 看左侧与「费用统计 / 插件」同排的「固美特ERP」面板图标；③ 设置 → 插件里点「打开固美特ERP」；④ DevTools Console 应有 `[gmt-erp] client apply() completed`，若无则 client 半区未加载 |
| 点开空白 / API forbidden | 仅本机回环可访问插件 API；不要用非信任域名跨站打开 |
| 测试连接失败 | 检查 URL、Bearer、User-Token、Base-Url；企业字段 `X-Enterprise` |
| 对话调不到工具 | 用导出的 JSON 在 **dsh-mcp-connector** 完成导入并启用 |
| 齐套/缺料答错 | 安装 `gmt-erp-mcp` 技能；表单打开时有醒目提示 |
| 卸载后残留 | `dsh plugin --profile desktop remove dsh-plugin-gmt` 后，如需可手删 patch 中 `gmt-erp` 行 |

查看配置是否生效：

```bash
dsh --profile desktop --dump-config
```

---

## 9. 开发者：本地改完再挂载

```bash
cd D:/Code/nodejs/dsh-plugin-gmt
npm run lint
npm run catalog:sync
# 若要从 gmtMcp 源码同步：
node scripts/sync-catalog.mjs D:/Code/python/gmtMcp/app/erp/queries.py

dsh plugin --profile desktop add "D:/Code/nodejs/dsh-plugin-gmt"
# 然后重启 DSH
```

Web profile：

```bash
dsh plugin --profile web add "D:/Code/nodejs/dsh-plugin-gmt"
```
