---
name: gmt-erp-order
description: >-
  固美特 ERP 订单全景与新单评审。用户提到客户单号整单情况、工令/派工单全貌、一单全景、
  新单评审、能不能提前交期、接单评估时使用。优先 explain_order 或 run_business_playbook，
  交期评估用 suggest_deadline_change。
---

# 一单全景 / 新单评审

## 整单查询

用户给了客户单号 / 销售单号 / 工令 / 派工单时：

1. **优先** `explain_order`（一次拿销售+物需+齐套+在途+品质）。
2. 用 `summary` + `risks` 先答结论，再按需展开 `sections`。
3. 需要应收时再 `include_finance=true` 重查或补 `query_customer_crg`。

键值尽量原样传入：`customer_order_no` / `so` / `gl_no` / `wo` / `part_no`。

## 新单评审

用户说「新单评审 / 接单评估 / 这料能不能接」且有料号或单号：

1. `run_business_playbook(playbook=new_order_review, part_no=...)`
2. 按 `steps` 顺序简述：BOM → 库存 → 齐套 → 交期 → 物需。
3. 用 `risks` 给出「建议接 / 谨慎 / 先补资料」口径（只读建议，不代替业务决策）。

## 交期能不能提前

1. `suggest_deadline_change`（`advance_days` 默认 7）。
2. 如实转述 `feasible` / `blockers` / `verdict`。
3. **明确**：不会改 ERP 交期；要改须人工在系统操作。

## 禁止

- 用 `query_shortage` 回答「齐不齐套」。
- 未调用 MCP 就编造工序进度或齐套结论。
