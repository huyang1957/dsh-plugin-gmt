/**
 * 从 gmtMcp TOOL_META 同步 tools.json（可选）。
 * 用法: node scripts/sync-catalog.mjs [path/to/queries.py]
 * 无参数时仅用内置元数据刷新 fields 映射。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'lib', 'catalog', 'tools.json');

const TITLES = {
  query_stock: '库存查询',
  query_sale_order: '销售订单',
  query_purchase_order: '采购订单',
  query_part_info: '料号主数据',
  query_bom: 'BOM 查询',
  query_order_all: '订单综合',
  query_manu_progress: '生产进度',
  query_shortage: '缺料预警',
  query_qc_exception: '品质异常',
  list_pending_purchase: '待下采购',
  create_purchase_drafts: '生成采购草稿',
  list_purchase_process: '采购进度',
  get_po_lines: '采购明细',
  lookup_recent_price: '近期采购价',
  get_dept_work_summary: '部门日报汇总',
  get_home_todo_notice: '首页待办通知',
  query_vir_stock: '齐套查询',
  query_customer_crg: '客户对账收款',
  query_supplier_crp: '供应商对账付款',
  lookup_erp_api: '查 API 目录',
  query_delivery_overdue: '销售欠交逾期',
  query_dispatch_load: '派工负荷',
  query_po_incoming: '在途采购催料',
  explain_order: '一单全景',
  get_exception_digest: '异常风险日报',
  list_collection_followups: '催款跟进',
  list_supplier_chase: '催料到货',
  suggest_deadline_change: '交期评估',
  query_warehouse_todo: '仓库待办',
  compare_price_history: '采销价对照',
  search_help: '业务口径帮助',
  search_operation_manual: '操作手册',
  suggest_next_action: '下一步建议',
  run_business_playbook: '业务剧本',
  whoami_erp: '身份与工具清单',
};

const WARNINGS = {
  query_shortage: '这是缺料/安全库存报警，不是齐套。齐套请用 query_vir_stock。',
  query_vir_stock: '这是齐套专用工具，不是缺料。缺料请用 query_shortage。',
  create_purchase_drafts: '写操作：默认仅预览；确认生成时需勾选 confirm，且不会自动审核。',
  search_operation_manual: '「怎么报工/怎么操作」请用本工具，不要只用 search_help。',
};

const F = {
  dateRange: [
    { key: 'date_from', label: '开始日期', type: 'date' },
    { key: 'date_to', label: '结束日期', type: 'date' },
  ],
  keyword: { key: 'keyword', label: '关键词', type: 'text', placeholder: '单号/料号/客户等' },
  limit: { key: 'limit', label: '条数', type: 'number', default: 50 },
  topn: { key: 'top_n', label: 'TopN', type: 'number', default: 10 },
  customer: { key: 'CustomerNo', label: '客户编号', type: 'text' },
  supplier: { key: 'SupplierNo', label: '供应商编号', type: 'text' },
  part: { key: 'PartNo', label: '料号', type: 'text' },
  orderNo: { key: 'OrderNo', label: '订单号', type: 'text' },
  custOrder: { key: 'CustOrderNo', label: '客户单号', type: 'text' },
  workOrder: { key: 'WorkOrderNo', label: '工令号', type: 'text' },
  poNo: { key: 'PurchaseNo', label: '采购单号', type: 'text' },
  note: { key: 'note', label: '自由补充说明', type: 'textarea', placeholder: '可选，拼进对话' },
};

function fieldsFor(name) {
  const base = [...F.dateRange, F.keyword, F.limit, F.note];
  const map = {
    query_stock: [...F.dateRange, F.part, F.keyword, F.limit, F.note],
    query_sale_order: [...F.dateRange, F.customer, F.custOrder, F.orderNo, F.keyword, F.limit, F.note],
    query_purchase_order: [...F.dateRange, F.supplier, F.poNo, F.part, F.keyword, F.limit, F.note],
    query_part_info: [F.part, F.keyword, F.limit, F.note],
    query_bom: [F.part, F.keyword, F.limit, F.note],
    query_order_all: [...F.dateRange, F.custOrder, F.orderNo, F.workOrder, F.keyword, F.limit, F.note],
    query_manu_progress: [...F.dateRange, F.workOrder, F.part, F.keyword, F.limit, F.note],
    query_shortage: [...F.dateRange, F.part, F.keyword, F.limit, F.note],
    query_qc_exception: [...F.dateRange, F.part, F.keyword, F.limit, F.note],
    list_pending_purchase: [F.part, F.keyword, F.limit, F.note],
    create_purchase_drafts: [
      { key: 'purchase_ids', label: '待采行 ID（逗号分隔）', type: 'text', placeholder: '来自 list_pending_purchase' },
      { key: 'confirm', label: '确认生成草稿', type: 'checkbox', default: false },
      F.note,
    ],
    list_purchase_process: [...F.dateRange, F.supplier, F.poNo, F.keyword, F.limit, F.note],
    get_po_lines: [F.poNo, ...F.dateRange, F.limit, F.note],
    lookup_recent_price: [F.part, ...F.dateRange, F.limit, F.note],
    get_dept_work_summary: [
      { key: 'date', label: '单日', type: 'date' },
      ...F.dateRange,
      { key: 'dept', label: '部门（销售/技术/计划/采购/仓库/生产）', type: 'text' },
      F.note,
    ],
    get_home_todo_notice: [F.note],
    query_vir_stock: [F.workOrder, F.custOrder, F.orderNo, F.part, F.keyword, F.limit, F.note],
    query_customer_crg: [F.customer, F.keyword, F.limit, F.note],
    query_supplier_crp: [F.supplier, F.keyword, F.limit, F.note],
    lookup_erp_api: [{ key: 'query', label: '一句话需求', type: 'text', required: true }, F.note],
    query_delivery_overdue: [...F.dateRange, F.customer, F.keyword, F.limit, F.note],
    query_dispatch_load: [...F.dateRange, F.keyword, F.limit, F.note],
    query_po_incoming: [...F.dateRange, F.supplier, F.part, F.keyword, F.limit, F.note],
    explain_order: [F.custOrder, F.orderNo, F.workOrder, F.keyword, F.note],
    get_exception_digest: [F.topn, F.note],
    list_collection_followups: [F.customer, F.keyword, F.limit, F.note],
    list_supplier_chase: [F.supplier, F.part, F.keyword, F.limit, F.note],
    suggest_deadline_change: [F.custOrder, F.orderNo, { key: 'target_date', label: '目标交期', type: 'date' }, F.note],
    query_warehouse_todo: [F.keyword, F.limit, F.note],
    compare_price_history: [F.part, ...F.dateRange, F.limit, F.note],
    search_help: [{ key: 'query', label: '问题', type: 'text', required: true }, F.note],
    search_operation_manual: [{ key: 'query', label: '操作问题', type: 'text', required: true, placeholder: '如：怎么报工' }, F.note],
    suggest_next_action: [{ key: 'context', label: '上下文', type: 'textarea', required: true }, F.note],
    run_business_playbook: [
      { key: 'playbook', label: '剧本', type: 'select', default: 'new_order_review', options: [
        { value: 'new_order_review', label: '新单评审' },
      ]},
      F.custOrder, F.orderNo, F.part, F.note,
    ],
    whoami_erp: [F.note],
  };
  return map[name] || base;
}

const FALLBACK_META = [
  ['query_stock', '库存查询（含批次/出入库；支持 date_from~date_to）', true, 'query'],
  ['query_sale_order', '销售订单（支持 date_from~date_to，默认 OrderDate）', true, 'query'],
  ['query_purchase_order', '采购订单（支持 date_from~date_to，默认 OrderDate）', true, 'query'],
  ['query_part_info', '料号主数据（支持 date_from~date_to）', true, 'query'],
  ['query_bom', 'BOM查询含下阶（支持 date_from~date_to）', true, 'query'],
  ['query_order_all', '订单综合+工序进度（支持 date_from~date_to）', true, 'query'],
  ['query_manu_progress', '生产进度（支持 date_from~date_to，默认 Deadline）', true, 'pmc'],
  ['query_shortage', '缺料/安全库存报警（不是齐套；齐套用 query_vir_stock）', true, 'pmc'],
  ['query_qc_exception', '品质异常（支持 date_from~date_to，默认 HappenDate）', true, 'qc'],
  ['list_pending_purchase', '查询待下采购物料清单', true, 'purchase'],
  ['create_purchase_drafts', '生成采购草稿（需 confirm=true；不自动审核）', false, 'purchase'],
  ['list_purchase_process', '采购进度（支持 date_from~date_to）', true, 'purchase'],
  ['get_po_lines', '按采购单号查明细（可 date_from~date_to）', true, 'purchase'],
  ['lookup_recent_price', '近期采购量价（可 date_from~date_to）', true, 'purchase'],
  ['get_dept_work_summary', '各部门日报/区间汇总', true, 'report'],
  ['get_home_todo_notice', '首页待办事项+系统通知', true, 'home'],
  ['query_vir_stock', '【齐套专用】虚拟齐套（ShowVirStock）', true, 'pmc'],
  ['query_customer_crg', '按客户查对账/开票/收款', true, 'finance'],
  ['query_supplier_crp', '按供应商查对账/收票/付款', true, 'finance'],
  ['lookup_erp_api', '一句话检索 ERP ApiName', true, 'meta'],
  ['query_delivery_overdue', '销售欠交/逾期/即将到期', true, 'sales'],
  ['query_dispatch_load', '派工/在制负荷与交期延误', true, 'pmc'],
  ['query_po_incoming', '在途/未完成采购到货催料', true, 'purchase'],
  ['explain_order', '一单全景：销售+物需+齐套+在途+品质摘要', true, 'compose'],
  ['get_exception_digest', '异常/风险日报 TopN', true, 'compose'],
  ['list_collection_followups', '待催收款清单+催款备注草稿', true, 'finance'],
  ['list_supplier_chase', '催供应商到货清单+沟通草稿', true, 'purchase'],
  ['suggest_deadline_change', '交期能否提前的只读评估', true, 'sales'],
  ['query_warehouse_todo', '仓库待入/待出/待盘（未过账）', true, 'warehouse'],
  ['compare_price_history', '料号采/销历史价对照', true, 'purchase'],
  ['search_help', '操作口径/说明书检索', true, 'meta'],
  ['search_operation_manual', '系统操作指引/手册图文', true, 'meta'],
  ['suggest_next_action', '根据上下文建议下一步工具', true, 'meta'],
  ['run_business_playbook', '业务剧本（如新单评审）', true, 'meta'],
  ['whoami_erp', '当前用户 AI 校验与 MCP 可做工具清单', true, 'meta'],
];

function parsePy(path) {
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('TOOL_META = [');
  if (start < 0) throw new Error('TOOL_META not found');
  const slice = text.slice(start);
  const tools = [];
  const re = /\{\s*"name":\s*"([^"]+)"[\s\S]*?"description":\s*"([^"]*)"[\s\S]*?"readonly":\s*(True|False)[\s\S]*?"group":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(slice))) {
    tools.push({ name: m[1], description: m[2], readonly: m[3] === 'True', group: m[4] });
  }
  return tools;
}

const pyPath = process.argv[2];
let meta;
if (pyPath) {
  meta = parsePy(pyPath);
  console.log(`parsed ${meta.length} tools from ${pyPath}`);
} else {
  meta = FALLBACK_META.map(([name, description, readonly, group]) => ({ name, description, readonly, group }));
}

const tools = meta.map((t) => ({
  name: t.name,
  title: TITLES[t.name] || t.name,
  description: t.description,
  group: t.group,
  readonly: t.readonly !== false,
  warning: WARNINGS[t.name] || null,
  fields: fieldsFor(t.name),
}));

const payload = {
  version: 1,
  updatedAt: new Date().toISOString(),
  groups: [
    { id: 'home', label: '首页' },
    { id: 'compose', label: '编排场景' },
    { id: 'query', label: '问数主数据' },
    { id: 'sales', label: '销售' },
    { id: 'pmc', label: 'PMC/生产' },
    { id: 'purchase', label: '采购' },
    { id: 'warehouse', label: '仓库' },
    { id: 'qc', label: '品质' },
    { id: 'finance', label: '财务' },
    { id: 'report', label: '报表' },
    { id: 'meta', label: '元能力' },
  ],
  presets: [
    { id: 'morning', title: '晨会风险', tool: 'get_exception_digest', hint: '今天有什么风险' },
    { id: 'home', title: '首页待办', tool: 'get_home_todo_notice', hint: '我的待办和通知' },
    { id: 'order', title: '一单全景', tool: 'explain_order', hint: '客户单号整单情况' },
    { id: 'playbook', title: '新单评审', tool: 'run_business_playbook', hint: '新单评审剧本' },
    { id: 'chase_po', title: '催料到货', tool: 'list_supplier_chase', hint: '催供应商到货' },
    { id: 'chase_pay', title: '催款跟进', tool: 'list_collection_followups', hint: '待催收款' },
  ],
  roles: {
    boss: { label: '老板', enabledGroups: ['home', 'compose', 'sales', 'pmc', 'purchase', 'finance', 'report'] },
    sales: { label: '销售', enabledGroups: ['home', 'compose', 'query', 'sales', 'meta'] },
    pmc: { label: '计划/PMC', enabledGroups: ['home', 'compose', 'query', 'pmc', 'purchase', 'warehouse', 'meta'] },
    purchase: { label: '采购', enabledGroups: ['home', 'purchase', 'query', 'pmc', 'meta'] },
    finance: { label: '财务', enabledGroups: ['home', 'finance', 'sales', 'meta'] },
  },
  tools,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(`wrote ${tools.length} tools -> ${outPath}`);
