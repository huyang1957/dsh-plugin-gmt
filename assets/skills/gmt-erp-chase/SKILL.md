---
name: gmt-erp-chase
description: >-
  固美特 ERP 催款与催料到货。用户提到待催客户、催收款、应收跟进、催供应商、未到货、
  这几颗料催哪家、采购欠交沟通时使用。用 list_collection_followups / list_supplier_chase，
  只输出沟通草稿且标明需人工发送，绝不声称已发邮件。
---

# 催款 / 催料

## 催收款

1. `list_collection_followups`（可加 `customer_no` / `check_month`）。
2. 汇报：客户数、待收款合计、`ToGMoney` Top。
3. 需要话术时引用 `draft_notes[].draft_note`，并加前缀：  
   **「以下为系统草稿，请人工核对金额后发送。」**

## 催供应商到货

1. 有料号/PO 时带上 `part_no` / `po` 调 `list_supplier_chase`。
2. 按 `by_supplier` 说清：哪家、欠交数量、涉及 PO/料号。
3. 沟通稿用 `draft_messages[].draft_message`，同样标明仅草稿、不自动发送。
4. 只要查交期清单也可用 `query_po_incoming`；要「催哪几家」优先 chase 工具。

## 硬性规则

- 不发邮件、短信、企业微信；无发送类 MCP。
- 不修改采购交期；评估提前用 `suggest_deadline_change`。
- 草稿里的金额/数量以本次 MCP 返回为准，发送前请用户确认。
