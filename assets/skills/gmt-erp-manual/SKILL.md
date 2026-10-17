---
name: gmt-erp-manual
description: >-
  固美特 ERP 系统操作指引/手册图文。用户问怎么报工、怎么录入、如何操作、操作步骤、
  界面怎么点、菜单在哪、生产报工、操作指引时使用。必须调用 search_operation_manual
  （对齐 ERP 智能问答系统操作指引 queryAI / ManualAI），禁止只用 search_help 或凭记忆编步骤。
---

# 系统操作指引（手册）

与 ERP「智能问答 → 系统操作指引」同源：后端 ManualAI，MCP 工具名 **`search_operation_manual`**。

## 何时用

用户问的是 **怎么在系统里操作**，不是查业务数据：

| 说法 | 工具 |
|------|------|
| 怎么报工 / 生产报工怎么操作 | `search_operation_manual` |
| 怎么录入销售订单 / 采购单怎么做 | `search_operation_manual` |
| 界面在哪 / 菜单怎么点 / 操作步骤 | `search_operation_manual` |
| 齐套和缺料有什么区别（口径） | `search_help`（不是本工具） |
| 库存还有多少 / 欠交有哪些 | 业务查询工具（不是本工具） |

## 调用方式

```text
search_operation_manual(query="生产报工怎么操作")
```

参数：`query` / `question` / `prompt` 任一即可，用用户原话，不要改成英文。

## 答题规范

1. **必须先调** `search_operation_manual`。
2. 工具成功时会直接返回 **Markdown 正文**（步骤文字 + `![](绝对图片URL)` 图文穿插）。
3. **原样把 Markdown 展示给用户**（保留图片行位置，图文穿插）。
4. **禁止**：把图片改成附件/文件清单；禁止用文件名当标题罗列；禁止丢弃 `![](...)` 只留链接列表。
5. 明确这是**操作手册**，不是当前工单/库存实况。
6. 图片打不开时说明需配置公网 `MANUALAI_PUBLIC_BASE_URL`，或请用户到 ERP「系统操作指引」查看。
7. 失败时引导 ERP 内「系统操作指引」；**不要**改口用 `search_help` 假装有报工步骤。

## 与 search_help 的区别

- `search_help`：MCP 口径 FAQ（齐套≠缺料等）+ 用户操作说明书  
- `search_operation_manual`：工厂操作手册图文（报工/录入/审核等）

问「怎么报工」却调 `search_help` → 错误。
问「怎么报工」却把图变成附件清单 → 错误（必须图文穿插）。
