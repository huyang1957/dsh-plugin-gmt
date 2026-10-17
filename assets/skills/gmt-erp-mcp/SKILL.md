---
name: gmt-erp-mcp
description: >-
  固美特钣金 ERP MCP 工具选型与答题规范。在用户用中文问库存、销售欠交、齐套、缺料、
  采购在途、派工、品质、催款催料、晨会风险、一单全景、新单评审，或 WorkBuddy/Cursor
  已连接 gmt-erp MCP 时使用。强制区分齐套≠缺料、欠交≠齐套、在途≠库存。
---

# 固美特 ERP MCP（必装）

通过 **gmt-erp** MCP 查数。先 `whoami_erp`（可选）确认工具可用；写操作仅 `create_purchase_drafts` 且必须 `confirm=true`。

## 选型红线（禁止混淆）

| 用户说法 | 必须用 | 禁止 |
|----------|--------|------|
| 齐套 / 虚拟齐套 / 是否齐套 / 未齐套 | `query_vir_stock` | `query_shortage` |
| 缺料 / 安全库存报警 / 物需未完成 | `query_shortage` | `query_vir_stock` |
| 销售欠交 / 逾期未交 / 交期到了没交 | `query_delivery_overdue` | 齐套工具 |
| 采购未到货 / 催料 / 在途 | `query_po_incoming` 或 `list_supplier_chase` | `query_stock` |
| 整单什么情况 / 客户单号全貌 | `explain_order` | 连调 5 个工具拼凑 |
| 今天有什么风险 / 晨会异常 | `get_exception_digest` | 只报一个桶就当全部 |
| 口径疑问（齐套和缺料区别） | `search_help` | 凭记忆瞎编 |
| 怎么报工 / 怎么操作 / 操作步骤 / 界面怎么点 | `search_operation_manual` | `search_help` 或凭记忆编步骤 |

不确定下一步 → `suggest_next_action`（context=用户原话）。

## 话术 → 工具（速查）

- **操作手册图文**（怎么报工/录入/审核）→ `search_operation_manual`（对齐 ERP「系统操作指引」）
- 库存 / 批次 / 出入库 → `query_stock`
- 销售订单 / 客户单号 → `query_sale_order`；欠交看板 → `query_delivery_overdue`
- 采购单 / 进度 → `query_purchase_order` / `list_purchase_process`
- 料号 / BOM → `query_part_info` / `query_bom`
- 生产进度 / 派工负荷延误 → `query_manu_progress` / `query_dispatch_load`
- 品质未结 → `query_qc_exception`
- 待下采购 / 生成草稿 → `list_pending_purchase` → 预览后再 `create_purchase_drafts(confirm=true)`
- 待催客户 → `list_collection_followups`（草稿不发邮件）
- 催哪家供应商 → `list_supplier_chase`（草稿不发邮件）
- 能不能提前交期 → `suggest_deadline_change`（只读，不写交期）
- 今日待入待出 → `query_warehouse_todo`
- 上次采/卖多少 → `compare_price_history`
- 新单评审走一遍 → `run_business_playbook(playbook=new_order_review)`
- 我能用哪些工具 → `whoami_erp`
- 部门日报 / 首页待办 → `get_dept_work_summary` / `get_home_todo_notice`
- 客户应收 / 供应商应付 → `query_customer_crg` / `query_supplier_crp`

## 答题规范

1. **先调 MCP**，用返回的 `msg` / `summary` / `hint` 组织中文回答；数字带单位，单号原样引用。
2. 客户名称若为「已隐藏」→ 用客户代码回答，勿编造名称。
3. 价格字段缺失/隐藏 → 说明无价格查看权限，勿猜价。
4. 催款/催料草稿 → 明确「仅草稿，需人工发送」；禁止声称已发邮件。
5. 多桶风险 → 按严重度简述 Top，再问是否展开某一桶。
6. 失败时复述 MCP `msg`，建议换单号/放宽条件或联系实施；勿编造成功结果。

## 日期

查时间段优先 `date_from` + `date_to`；交期类加 `date_field=Deadline`（销售）或采购的 `DeliveryDate`（在途工具已默认）。

## 延伸技能

- 晨会风险 → 技能 `gmt-erp-morning`
- 一单/新单 → 技能 `gmt-erp-order`
- 催款催料 → 技能 `gmt-erp-chase`
- 操作手册/怎么报工 → 技能 `gmt-erp-manual`
