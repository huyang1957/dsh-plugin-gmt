/**
 * 根据工具与表单值生成会话提示词。
 */

const REDLINES = [
  '选型红线：齐套必须用 query_vir_stock；缺料用 query_shortage；怎么操作/报工用 search_operation_manual。',
  '请优先调用指定 MCP 工具，结果用表格清晰展示；若已安装 genui 可用交互表格。',
];

export function buildToolPrompt(tool, values = {}, extraNote = '') {
  const params = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (k === 'note') continue;
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'boolean') {
      params[k] = v;
      continue;
    }
    params[k] = v;
  }

  const lines = [
    `【GMT·${tool.title || tool.name}】`,
    `请使用 MCP 工具 \`${tool.name}\` 完成下面任务，不要改用其它易混淆工具。`,
    `工具说明：${tool.description || ''}`,
  ];

  if (tool.warning) {
    lines.push(`注意：${tool.warning}`);
  }

  if (Object.keys(params).length) {
    lines.push('参数（JSON）：');
    lines.push('```json');
    lines.push(JSON.stringify(params, null, 2));
    lines.push('```');
  } else {
    lines.push('未填写额外筛选参数时，按合理默认范围查询并说明假设。');
  }

  const note = extraNote || values.note;
  if (note && String(note).trim()) {
    lines.push(`用户补充：${String(note).trim()}`);
  }

  lines.push(...REDLINES);
  if (tool.readonly === false) {
    lines.push('这是写操作：若参数 confirm 不为 true，只预览不落库；确认前请再次核对。');
  }

  return lines.join('\n');
}

export function sessionTitle(tool) {
  return `GMT·${tool.title || tool.name}`;
}
