---
name: gmt-erp-morning
description: >-
  固美特 ERP 晨会与风险日报。用户提到今天有什么风险、晨会、异常日报、老板一句话风险、
  逾期未交、未齐套汇总、待收款关注时使用。优先 get_exception_digest，必要时再下钻单桶工具。
---

# 晨会 / 风险日报

## 流程

1. 调用 `get_exception_digest`（默认 `horizon_days=7`，`limit_per_bucket=5`）。
2. 用返回的 `risk_msg` 做**开场一句话**（给老板听）。
3. 按 `buckets` 里 `count>0` 且非 `home_todo` 的项，列 3～5 条重点（桶名 + 条数 + 1 个样例单号/料号）。
4. 询问要展开哪一桶；展开时用对应专用工具，勿重复全量日报：
   - 逾期交货 → `query_delivery_overdue(only_overdue=true)`
   - 未齐套 → `query_vir_stock(only_unfinished=true)`
   - 缺料报警 → `query_shortage(mode=stock_alarm)`
   - 采购逾期 → `query_po_incoming(only_overdue=true)` 或 `list_supplier_chase`
   - 派工延误 → `query_dispatch_load(only_delayed=true)`
   - 品质未结 → `query_qc_exception(open_only=true)`
   - 待收款 → `list_collection_followups`
5. 附录 `home_todo` 点到为止（有几项待办），除非用户要明细。

## 口径提醒

- 逾期交货 ≠ 未齐套 ≠ 缺料报警，分桶汇报，不要混成「都缺料」。
- 只读；不要提议「直接改交期/自动催款」除非用户明确且有写权限流程。

## 示例开场

> 今日风险：逾期交货 N、未齐套 N、采购逾期 N……（摘自 risk_msg）  
> 需要我展开「逾期交货」明细，还是先看「待催收款」？
