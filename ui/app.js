(() => {
  const PROMPT_REQUEST_TYPE = 'gmt-erp:start-session';
  const PROMPT_RESULT_TYPE = 'gmt-erp:start-session-result';

  const state = {
    catalog: null,
    prefs: null,
    skills: null,
    companions: null,
    connector: null,
    health: null,
    config: null,
    currentTool: null,
    tab: 'tools',
    toolQuery: '',
  };

  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  async function api(method, params = {}) {
    const res = await fetch('/gmt-erp/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, params }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `API ${method} failed`);
    return data;
  }

  function fmtTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  function toolMap() {
    const map = new Map();
    for (const t of state.catalog?.allTools || state.catalog?.tools || []) map.set(t.name, t);
    return map;
  }

  function groupLabel(id) {
    return (state.catalog?.groups || []).find((g) => g.id === id)?.label || id;
  }

  function toolMatches(tool, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const hay = [
      tool.title,
      tool.name,
      tool.description,
      tool.group,
      groupLabel(tool.group),
      ...(tool.fields || []).map((f) => `${f.key || ''} ${f.label || ''}`),
    ].join(' ').toLowerCase();
    return q.split(/\s+/).every((part) => part && hay.includes(part));
  }

  function setHealth() {
    const el = $('health');
    const h = state.health || {};
    const last = state.prefs?.mcp?.lastTest;
    if (h.source === 'connector' && h.configured) {
      el.textContent = h.connectionName
        ? `已接连接器：${h.connectionName}`
        : '已使用 MCP连接器配置';
      el.className = 'health ok';
      return;
    }
    if (last?.ok || (h.source === 'local' && h.configured)) {
      el.textContent = last?.ok ? 'MCP 已验证' : '本地 MCP 已配置';
      el.className = 'health ok';
      return;
    }
    if (h.configured) {
      el.textContent = last?.message ? `未通过：${last.message}` : '已配置，未测试';
      el.className = 'health bad';
      return;
    }
    el.textContent = '未检测到 MCP';
    el.className = 'health bad';
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${tab}`);
    });
    if (tab === 'recent') renderRecent();
    if (tab === 'history') renderHistory();
    if (tab === 'settings') renderSettings();
  }

  function renderPresets() {
    const box = $('presets');
    box.innerHTML = '';
    for (const p of state.catalog?.presets || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset';
      btn.textContent = p.title;
      btn.title = p.hint || '';
      btn.onclick = () => {
        switchTab('tools');
        selectTool(p.tool);
      };
      box.appendChild(btn);
    }
  }

  function renderTree() {
    const box = $('tree');
    const countEl = $('tool-count');
    box.innerHTML = '';
    const groups = state.catalog?.groups || [];
    const tools = state.catalog?.tools || [];
    const fav = new Set(state.prefs?.favorites || []);
    const query = state.toolQuery || '';
    const matched = tools.filter((t) => toolMatches(t, query));
    if (countEl) {
      countEl.textContent = query.trim()
        ? `显示 ${matched.length} / ${tools.length}（目录共 ${state.catalog?.stats?.total || tools.length}）`
        : `共 ${tools.length} 个功能`;
    }
    if (!matched.length) {
      box.innerHTML = `<div class="empty">没有匹配「${query}」的功能</div>`;
      return;
    }
    for (const g of groups) {
      const items = matched.filter((t) => t.group === g.id);
      if (!items.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'group';
      wrap.innerHTML = `<div class="group-title">${g.label}（${items.length}）</div>`;
      for (const t of items) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tool-item${t.enabled === false ? ' disabled' : ''}${state.currentTool?.name === t.name ? ' active' : ''}`;
        btn.innerHTML = `<span><span class="name">${t.title}</span><span class="desc">${t.description || ''}</span></span>`;
        btn.onclick = () => {
          if (t.enabled === false) {
            toast('该工具已禁用，可在设置中启用');
            return;
          }
          selectTool(t.name);
        };
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'star';
        star.textContent = fav.has(t.name) ? '★' : '☆';
        star.title = '常用';
        star.onclick = async (e) => {
          e.stopPropagation();
          const data = await api('toggleFavorite', { name: t.name });
          state.prefs = data.prefs;
          renderTree();
          if (state.tab === 'recent') renderRecent();
        };
        row.appendChild(btn);
        row.appendChild(star);
        wrap.appendChild(row);
      }
      box.appendChild(wrap);
    }
  }

  function dateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function applyDatePreset(kind, form) {
    const to = new Date();
    const from = new Date();
    if (kind === 'today') {
      // same day
    } else if (kind === '7d') {
      from.setDate(from.getDate() - 6);
    } else if (kind === 'month') {
      from.setDate(1);
    } else {
      return;
    }
    const a = form.querySelector('[name="date_from"]');
    const b = form.querySelector('[name="date_to"]');
    if (a) a.value = dateStr(from);
    if (b) b.value = dateStr(to);
  }

  function selectTool(name) {
    const tool = toolMap().get(name);
    if (!tool) {
      toast('未找到工具');
      return;
    }
    // 左侧点功能时，右侧强制切回「功能」表单页
    if (state.tab !== 'tools') switchTab('tools');
    state.currentTool = tool;
    $('tool-empty').classList.add('hidden');
    const box = $('tool-form');
    box.classList.remove('hidden');
    const hasDate = (tool.fields || []).some((f) => f.key === 'date_from' || f.key === 'date_to');
    box.innerHTML = `
      <h1>${tool.title}</h1>
      <div class="desc">${tool.description || ''}<br/><code>${tool.name}</code>${tool.readonly === false ? ' · 写操作' : ''}</div>
      ${tool.warning ? `<div class="warning">${tool.warning}</div>` : ''}
      ${hasDate ? `<div class="date-presets">
        <button type="button" class="chip" data-date="today">今天</button>
        <button type="button" class="chip" data-date="7d">近7天</button>
        <button type="button" class="chip" data-date="month">本月</button>
      </div>` : ''}
      <form id="f-tool"></form>
      <div class="actions">
        <button type="button" class="btn primary" id="btn-run-new">在新对话中发起问题</button>
        <button type="button" class="btn" id="btn-run">发起对话使用</button>
        <button type="button" class="btn" id="btn-fav">${(state.prefs?.favorites || []).includes(tool.name) ? '取消常用' : '加常用'}</button>
      </div>
    `;
    const form = $('f-tool');
    for (const field of tool.fields || []) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const id = `f_${field.key}`;
      let control = '';
      if (field.type === 'textarea') {
        control = `<textarea id="${id}" name="${field.key}" placeholder="${field.placeholder || ''}"></textarea>`;
      } else if (field.type === 'select') {
        const opts = (field.options || []).map((o) => `<option value="${o.value}" ${field.default === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
        control = `<select id="${id}" name="${field.key}">${opts}</select>`;
      } else if (field.type === 'checkbox') {
        control = `<label style="font-weight:500"><input id="${id}" name="${field.key}" type="checkbox" ${field.default ? 'checked' : ''}/> ${field.label}</label>`;
        wrap.innerHTML = control;
        form.appendChild(wrap);
        continue;
      } else {
        control = `<input id="${id}" name="${field.key}" type="${field.type || 'text'}" placeholder="${field.placeholder || ''}" value="${field.default ?? ''}" ${field.required ? 'required' : ''}/>`;
      }
      wrap.innerHTML = `<label for="${id}">${field.label}${field.required ? ' *' : ''}</label>${control}`;
      form.appendChild(wrap);
    }

    box.querySelectorAll('[data-date]').forEach((btn) => {
      btn.onclick = () => applyDatePreset(btn.dataset.date, form);
    });
    $('btn-fav').onclick = async () => {
      const data = await api('toggleFavorite', { name: tool.name });
      state.prefs = data.prefs;
      selectTool(tool.name);
      renderTree();
    };
    $('btn-run-new').onclick = () => runTool(tool, form, false, { forceNew: true });
    $('btn-run').onclick = () => runTool(tool, form, false, { forceNew: false });
    renderTree();

    // 滚到表单并聚焦首个可填项，方便立刻填写
    requestAnimationFrame(() => {
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const first = form.querySelector('input:not([type="checkbox"]), select, textarea');
      if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
    });
  }

  function readForm(form) {
    const values = {};
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) values[k] = v;
    form.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      values[el.name] = el.checked;
    });
    form.querySelectorAll('input[type="number"]').forEach((el) => {
      if (el.value !== '') values[el.name] = Number(el.value);
    });
    return values;
  }

  function requestStartSession(prompt, { forceNew = false } = {}) {
    return new Promise((resolve, reject) => {
      const requestId = `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const onMsg = (event) => {
        if (event.data?.type !== PROMPT_RESULT_TYPE) return;
        if (event.data.requestId !== requestId) return;
        window.removeEventListener('message', onMsg);
        if (event.data.ok) resolve(event.data.message);
        else reject(new Error(event.data.message || '发起会话失败'));
      };
      window.addEventListener('message', onMsg);
      window.parent.postMessage({
        type: PROMPT_REQUEST_TYPE,
        requestId,
        prompt,
        forceNew: forceNew === true,
      }, window.location.origin);
      setTimeout(() => {
        window.removeEventListener('message', onMsg);
        reject(new Error('发起会话超时，请确认插件弹层仍打开'));
      }, 15000);
    });
  }

  async function runTool(tool, form, confirmed = false, { forceNew = true } = {}) {
    const buttons = [$('btn-run'), $('btn-run-new')].filter(Boolean);
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const values = readForm(form);
      for (const field of tool.fields || []) {
        if (field.required && (values[field.key] === undefined || values[field.key] === '')) {
          throw new Error(`请填写：${field.label}`);
        }
      }
      if (tool.readonly === false && values.confirm === true && !confirmed) {
        if (!window.confirm('确认生成采购草稿？不会自动审核。')) {
          return;
        }
        confirmed = true;
      }
      const prepared = await api('preparePrompt', {
        tool: tool.name,
        values,
        confirmed,
      });
      if (prepared.needConfirm) {
        if (!window.confirm(prepared.message)) {
          return;
        }
        return runTool(tool, form, true, { forceNew });
      }
      state.prefs = prepared.prefs;
      await requestStartSession(prepared.prompt, { forceNew });
      toast(forceNew ? '已打开新对话，请确认输入框中的问题后发送' : '已打开对话，请确认输入框中的问题后发送');
    } catch (error) {
      toast(error.message || String(error));
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  function renderList(box, items, onOpen) {
    box.innerHTML = '';
    if (!items.length) {
      box.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    const map = toolMap();
    for (const item of items) {
      const name = item.name || item.tool;
      const tool = map.get(name);
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div>
          <div><strong>${tool?.title || name}</strong></div>
          <div class="meta">${item.title || tool?.description || name}${item.at ? ' · ' + fmtTime(item.at) : ''}</div>
        </div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn primary';
      btn.textContent = '打开';
      btn.onclick = () => onOpen(name, item);
      card.appendChild(btn);
      box.appendChild(card);
    }
  }

  function renderRecent() {
    const favNames = state.prefs?.favorites || [];
    const recent = state.prefs?.recent || [];
    renderList($('favorites'), favNames.map((name) => ({ name })), (name) => {
      switchTab('tools');
      selectTool(name);
    });
    renderList($('recent'), recent, (name) => {
      switchTab('tools');
      selectTool(name);
    });
  }

  function renderHistory() {
    const history = state.prefs?.history || [];
    renderList($('history'), history, async (name, item) => {
      if (item.prompt && window.confirm('用该次历史提示重新发起对话？\n选「取消」仅打开工具表单。')) {
        try {
          await requestStartSession(item.prompt, { forceNew: true });
          toast('已在新对话中带入问题');
        } catch (e) {
          toast(e.message || String(e));
        }
        return;
      }
      switchTab('tools');
      selectTool(name);
    });
  }

  /**
   * 解析客户收到的 MCP JSON，支持：
   * - { mcpServers: { name: { url, headers } } }
   * - { url, headers, name? }
   * - { connections: [{ name, url, headers }] }
   */
  function parseMcpJsonText(text) {
    let data;
    try {
      data = JSON.parse(String(text || '').trim());
    } catch {
      throw new Error('JSON 格式无效，请检查是否完整复制');
    }
    if (!data || typeof data !== 'object') throw new Error('JSON 内容无效');

    const candidates = [];

    if (data.mcpServers && typeof data.mcpServers === 'object') {
      for (const [name, cfg] of Object.entries(data.mcpServers)) {
        if (!cfg || typeof cfg !== 'object') continue;
        candidates.push({
          connectionName: name,
          url: cfg.url || cfg.serverUrl || '',
          headers: { ...(cfg.headers || {}) },
        });
      }
    }

    if (Array.isArray(data.connections)) {
      for (const cfg of data.connections) {
        if (!cfg || typeof cfg !== 'object') continue;
        candidates.push({
          connectionName: cfg.name || cfg.serverName || cfg.key || 'gmt-erp-cloud',
          url: cfg.url || '',
          headers: { ...(cfg.headers || {}) },
        });
      }
    }

    if (data.url || data.headers) {
      candidates.push({
        connectionName: data.name || data.connectionName || data.serverName || 'gmt-erp-cloud',
        url: data.url || '',
        headers: { ...(data.headers || {}) },
      });
    }

    // 兼容直接给单个 server 节点：{ "gmt-erp-cloud": { url, headers } }
    if (!candidates.length) {
      for (const [name, cfg] of Object.entries(data)) {
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
        if (!cfg.url && !cfg.headers) continue;
        candidates.push({
          connectionName: name,
          url: cfg.url || '',
          headers: { ...(cfg.headers || {}) },
        });
      }
    }

    if (!candidates.length) {
      throw new Error('未识别到 MCP 配置，请粘贴含 mcpServers 或 url/headers 的 JSON');
    }

    const score = (c) => {
      let s = 0;
      const n = String(c.connectionName || '').toLowerCase();
      if (/gmt|goodmate|固美特/.test(n)) s += 20;
      if (c.url) s += 5;
      if (c.headers?.Authorization || c.headers?.['X-Erp-User-Token']) s += 10;
      return s;
    };
    candidates.sort((a, b) => score(b) - score(a));
    const best = candidates[0];
    if (!best.url) throw new Error('配置中缺少 url');
    return {
      connectionName: best.connectionName || 'gmt-erp-cloud',
      url: String(best.url).trim(),
      headers: normalizeHeaderMap(best.headers || {}),
      candidates: candidates.map((c) => c.connectionName),
    };
  }

  function normalizeHeaderMap(headers) {
    const out = {
      Authorization: '',
      'X-Enterprise': '',
      'X-Erp-Base-Url': '',
      'X-Erp-User': '',
      'X-Erp-User-Token': '',
    };
    for (const [k, v] of Object.entries(headers || {})) {
      if (v == null) continue;
      const key = String(k);
      const val = String(v);
      // 大小写不敏感匹配常用字段
      const lower = key.toLowerCase();
      if (lower === 'authorization') out.Authorization = val;
      else if (lower === 'x-enterprise') out['X-Enterprise'] = val;
      else if (lower === 'x-erp-base-url') out['X-Erp-Base-Url'] = val;
      else if (lower === 'x-erp-user') out['X-Erp-User'] = val;
      else if (lower === 'x-erp-user-token') out['X-Erp-User-Token'] = val;
      else out[key] = val;
    }
    // Bearer 补全
    if (out.Authorization && !/^bearer\s+/i.test(out.Authorization) && !out.Authorization.includes(' ')) {
      out.Authorization = `Bearer ${out.Authorization}`;
    }
    return out;
  }

  function fillMcpFormFields({ url, connectionName, headers }) {
    const setVal = (id, val) => {
      const el = $(id);
      if (el) el.value = val ?? '';
    };
    setVal('mcp-url', url || '');
    setVal('mcp-name', connectionName || 'gmt-erp-cloud');
    setVal('h-Authorization', headers?.Authorization || '');
    setVal('h-X-Enterprise', headers?.['X-Enterprise'] || '');
    setVal('h-X-Erp-Base-Url', headers?.['X-Erp-Base-Url'] || '');
    setVal('h-X-Erp-User', headers?.['X-Erp-User'] || '');
    setVal('h-X-Erp-User-Token', headers?.['X-Erp-User-Token'] || '');
  }

  function readMcpFormFields() {
    return {
      url: $('mcp-url')?.value.trim() || '',
      connectionName: $('mcp-name')?.value.trim() || 'gmt-erp-cloud',
      headers: {
        Authorization: $('h-Authorization')?.value || '',
        'X-Enterprise': $('h-X-Enterprise')?.value || '',
        'X-Erp-Base-Url': $('h-X-Erp-Base-Url')?.value || '',
        'X-Erp-User': $('h-X-Erp-User')?.value || '',
        'X-Erp-User-Token': $('h-X-Erp-User-Token')?.value || '',
      },
    };
  }

  function mcpFormHtml(prefs) {
    const mcp = prefs?.mcp || {};
    const h = mcp.headers || {};
    const health = state.health || {};
    const connector = state.connector || {};
    const gmtList = connector.gmtConnections || [];
    const allList = connector.connections || [];
    const selectedKey = health.selectedKey || mcp.connectorKey || '';
    const fromConnector = health.source === 'connector' || mcp.source === 'connector';

    const options = (gmtList.length ? gmtList : allList).map((c) =>
      `<option value="${c.key}" ${c.key === selectedKey ? 'selected' : ''}>${c.name}${c.enabled === false ? '（未启用）' : ''}</option>`).join('');

    const detectedBlock = connector.available && (gmtList.length || allList.length)
      ? `
      <div class="warning" style="background:#ecfdf5;border-color:#99f6e4;color:#115e59">
        已检测到 MCP连接器中的配置（固美特相关 ${gmtList.length} 个）。
        ${fromConnector ? `当前使用「${health.connectionName || mcp.connectionName || ''}」，可直接发起对话，无需重复填写令牌。` : '请在下方选用一个连接。'}
      </div>
      <div class="field">
        <label>选用已有连接</label>
        <select id="connector-select">${options || '<option value="">（无可用连接）</option>'}</select>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" id="btn-use-connector">使用所选连接</button>
        <button type="button" class="btn" id="btn-test-mcp">测试连接</button>
      </div>
      `
      : `
      <div class="warning">未检测到 MCP连接器中的固美特连接。可粘贴下方 JSON 配置，或展开手动填写。</div>
      <div class="actions">
        <button type="button" class="btn" id="btn-test-mcp">测试连接</button>
      </div>
      `;

    return `
      <div class="block">
        <h2>MCP 连接</h2>
        <p>优先复用已安装的 <strong>dsh-mcp-connector</strong>。手动填写或 JSON 导入请展开下方「配置栏位」。</p>
        ${detectedBlock}

        <details style="margin-top:12px">
          <summary style="cursor:pointer;font-weight:600">配置栏位（手填 / 从 JSON 导入）</summary>
          <div style="margin-top:10px">
            <div class="actions" style="margin:0 0 12px">
              <button type="button" class="btn" id="btn-open-mcp-json">从 JSON 导入…</button>
            </div>
            <div class="field"><label>URL</label><input id="mcp-url" value="${mcp.url || ''}"/></div>
            <div class="field"><label>连接名</label><input id="mcp-name" value="${mcp.connectionName || 'gmt-erp-cloud'}"/></div>
            <div class="grid2">
              <div class="field"><label>Authorization (Bearer token)</label><input id="h-Authorization" type="password" value="${h.Authorization || ''}" placeholder="留空或 ******** 表示不改"/></div>
              <div class="field"><label>X-Enterprise</label><input id="h-X-Enterprise" value="${h['X-Enterprise'] || ''}"/></div>
              <div class="field"><label>X-Erp-Base-Url</label><input id="h-X-Erp-Base-Url" value="${h['X-Erp-Base-Url'] || ''}"/></div>
              <div class="field"><label>X-Erp-User</label><input id="h-X-Erp-User" value="${h['X-Erp-User'] || ''}"/></div>
              <div class="field"><label>X-Erp-User-Token</label><input id="h-X-Erp-User-Token" type="password" value="${h['X-Erp-User-Token'] || ''}"/></div>
            </div>
            <div class="actions">
              <button type="button" class="btn primary" id="btn-save-mcp">保存到本插件</button>
              <button type="button" class="btn" id="btn-export-mcp">导出 mcpServers JSON</button>
            </div>
            <pre id="mcp-export" class="code hidden"></pre>
          </div>
        </details>
      </div>
    `;
  }

  function openMcpJsonModal() {
    const mask = $('mcp-json-modal');
    if (!mask) return;
    mask.classList.remove('hidden');
    mask.setAttribute('aria-hidden', 'false');
    const ta = $('mcp-json-import');
    if (ta) {
      ta.focus();
      ta.select?.();
    }
  }

  function closeMcpJsonModal() {
    const mask = $('mcp-json-modal');
    if (!mask) return;
    mask.classList.add('hidden');
    mask.setAttribute('aria-hidden', 'true');
  }

  function applyParsedMcp(parsed) {
    fillMcpFormFields(parsed);
    const details = $('mcp-url')?.closest('details');
    if (details) details.open = true;
    if (parsed.candidates?.length > 1) {
      return `已解析「${parsed.connectionName}」（共识别 ${parsed.candidates.length} 个连接，已选最优）`;
    }
    return `已解析「${parsed.connectionName}」到表单`;
  }

  function bindMcpJsonModalOnce() {
    if (bindMcpJsonModalOnce._done) return;
    bindMcpJsonModalOnce._done = true;
    $('btn-close-mcp-json')?.addEventListener('click', () => closeMcpJsonModal());
    $('mcp-json-modal')?.addEventListener('click', (ev) => {
      if (ev.target === $('mcp-json-modal')) closeMcpJsonModal();
    });
    $('btn-parse-mcp-json')?.addEventListener('click', () => {
      try {
        const text = $('mcp-json-import')?.value || '';
        if (!text.trim()) throw new Error('请先粘贴配置 JSON');
        const parsed = parseMcpJsonText(text);
        toast(applyParsedMcp(parsed));
        closeMcpJsonModal();
      } catch (e) {
        toast(e.message || String(e));
      }
    });
    $('btn-parse-save-mcp-json')?.addEventListener('click', async () => {
      try {
        const text = $('mcp-json-import')?.value || '';
        if (!text.trim()) throw new Error('请先粘贴配置 JSON');
        const parsed = parseMcpJsonText(text);
        applyParsedMcp(parsed);
        const data = await api('saveMcp', {
          url: parsed.url,
          connectionName: parsed.connectionName,
          headers: parsed.headers,
        });
        state.prefs = data.prefs;
        const boot = await api('bootstrap', { profile: 'desktop' });
        state.health = boot.health;
        state.connector = boot.connector;
        setHealth();
        closeMcpJsonModal();
        toast(data.message || `已解析并保存「${parsed.connectionName}」`);
        renderSettings();
      } catch (e) {
        toast(e.message || String(e));
      }
    });
  }

  function renderSettings() {
    const box = $('settings');
    const prefs = state.prefs || {};
    const roles = state.catalog?.roles || {};
    const roleOpts = Object.entries(roles).map(([id, r]) =>
      `<option value="${id}" ${prefs.role === id ? 'selected' : ''}>${r.label}</option>`).join('');
    const disabled = new Set(prefs.disabledTools || []);
    const checks = (state.catalog?.allTools || state.catalog?.tools || []).map((t) =>
      `<label><input type="checkbox" data-tool="${t.name}" ${disabled.has(t.name) ? '' : 'checked'}/> ${t.title}</label>`).join('');
    const skillChecks = (state.skills?.bundled || []).map((id) =>
      `<label><input type="checkbox" data-skill="${id}" ${(state.skills.installed || []).includes(id) || id === 'gmt-erp-mcp' || id === 'gmt-erp-manual' ? 'checked' : ''}/> ${id}${ (state.skills.installed || []).includes(id) ? '（已装）' : ''}</label>`).join('');
    const cmds = state.companions?.commands || [];

    box.innerHTML = `
      ${mcpFormHtml(prefs)}
      <div class="block">
        <h2>角色预设</h2>
        <p>默认「全部功能」显示目录中的全部工具。选其它角色会按分组收窄侧栏，设置里仍可单独启停。</p>
        <div class="field"><select id="role-select">${roleOpts}</select></div>
      </div>
      <div class="block">
        <h2>工具启停</h2>
        <p>取消勾选即禁用（侧栏灰显，无法发起）。</p>
        <div class="check-grid">${checks}</div>
        <div class="actions"><button type="button" class="btn primary" id="btn-save-tools">保存启停</button></div>
      </div>
      <div class="block">
        <h2>安装 Skills</h2>
        <p>复制到 ${state.skills?.targetRoot || '~/.dsh/skills'} 。最小包建议勾选 gmt-erp-mcp + gmt-erp-manual。</p>
        <div class="check-grid">${skillChecks}</div>
        <div class="actions"><button type="button" class="btn primary" id="btn-install-skills">安装所选技能</button></div>
      </div>
      <div class="block">
        <h2>依赖插件</h2>
        <p>请在本机终端执行（安装后重启 DSH）。当前 profile 建议：desktop / web。</p>
        <pre class="code">${cmds.join('\n')}</pre>
        <div class="actions">
          <button type="button" class="btn" data-mark="dsh-mcp-connector">标记已装 connector</button>
          <button type="button" class="btn" data-mark="@changfenhuang/dsh-genui">标记已装 genui</button>
        </div>
        <p>已标记：connector=${!!prefs.companionHints?.['dsh-mcp-connector']} · genui=${!!prefs.companionHints?.['@changfenhuang/dsh-genui']}</p>
      </div>
      <div class="block">
        <h2>关于</h2>
        <p>dsh-plugin-gmt v0.1.10 · 对接固美特 gmtMcp。优先复用 MCP连接器已有配置；支持粘贴 JSON 填表。</p>
      </div>
    `;

    const btnUse = $('btn-use-connector');
    if (btnUse) {
      btnUse.onclick = async () => {
        try {
          const key = $('connector-select')?.value;
          if (!key) throw new Error('请先选择连接');
          const data = await api('useConnectorConnection', { key });
          state.prefs = data.prefs;
          const boot = await api('bootstrap', { profile: 'desktop' });
          state.health = boot.health;
          state.connector = boot.connector;
          state.prefs = boot.prefs;
          setHealth();
          toast(data.message || '已选用连接器配置');
          renderSettings();
        } catch (e) {
          toast(e.message || String(e));
        }
      };
    }

    bindMcpJsonModalOnce();
    const btnOpenJson = $('btn-open-mcp-json');
    if (btnOpenJson) {
      btnOpenJson.onclick = () => openMcpJsonModal();
    }

    const btnSave = $('btn-save-mcp');
    if (btnSave) {
      btnSave.onclick = async () => {
        try {
          const form = readMcpFormFields();
          if (!form.url) throw new Error('URL 不能为空');
          const data = await api('saveMcp', form);
          state.prefs = data.prefs;
          const boot = await api('bootstrap', { profile: 'desktop' });
          state.health = boot.health;
          state.connector = boot.connector;
          setHealth();
          toast(data.message || '已保存');
          renderSettings();
        } catch (e) {
          toast(e.message || String(e));
        }
      };
    }

    const btnTest = $('btn-test-mcp');
    if (btnTest) {
      btnTest.onclick = async () => {
        try {
          // 有手动表单且填写了 URL 时带 params；否则走有效配置（含连接器）
          const form = readMcpFormFields();
          let data;
          if (form.url && state.health?.source === 'local') {
            data = await api('testMcp', { url: form.url, headers: form.headers });
          } else {
            data = await api('testMcp', {});
          }
          state.prefs = data.prefs;
          const boot = await api('bootstrap', { profile: 'desktop' });
          state.health = boot.health;
          state.connector = boot.connector;
          if (data.prefs?.mcp?.lastTest) {
            state.health = { ...state.health, lastTest: data.prefs.mcp.lastTest };
          }
          setHealth();
          toast(data.result?.message || (data.result?.ok ? '测试成功' : '测试失败'));
          renderSettings();
        } catch (e) {
          toast(e.message || String(e));
        }
      };
    }

    const btnExport = $('btn-export-mcp');
    if (btnExport) {
      btnExport.onclick = async () => {
        try {
          const data = await api('exportMcpJson');
          const el = $('mcp-export');
          el.textContent = JSON.stringify(data.json, null, 2);
          el.classList.remove('hidden');
          await navigator.clipboard?.writeText(el.textContent);
          toast(`已导出（来源：${data.source || 'unknown'}）并复制到剪贴板`);
        } catch (e) {
          toast(e.message || String(e));
        }
      };
    }

    $('role-select').onchange = async (e) => {
      const data = await api('setRole', { role: e.target.value });
      state.prefs = data.prefs;
      state.catalog = data.catalog;
      renderTree();
      renderPresets();
      toast('角色已切换');
    };

    $('btn-save-tools').onclick = async () => {
      const disabledTools = [];
      box.querySelectorAll('input[data-tool]').forEach((el) => {
        if (!el.checked) disabledTools.push(el.dataset.tool);
      });
      const data = await api('setDisabledTools', { disabledTools });
      state.prefs = data.prefs;
      const boot = await api('bootstrap');
      state.catalog = boot.catalog;
      renderTree();
      toast('工具启停已保存');
    };

    $('btn-install-skills').onclick = async () => {
      const skills = [];
      box.querySelectorAll('input[data-skill]').forEach((el) => {
        if (el.checked) skills.push(el.dataset.skill);
      });
      const data = await api('installSkills', { skills });
      state.prefs = data.prefs;
      state.skills = await api('skillsStatus');
      toast(`技能已安装到 ${data.targetRoot}`);
      renderSettings();
    };

    box.querySelectorAll('[data-mark]').forEach((btn) => {
      btn.onclick = async () => {
        const data = await api('markCompanion', { package: btn.dataset.mark, installed: true });
        state.prefs = data.prefs;
        toast('已标记');
        renderSettings();
      };
    });
  }

  async function boot() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });
    const search = $('tool-search');
    if (search) {
      search.value = state.toolQuery || '';
      search.addEventListener('input', () => {
        state.toolQuery = search.value;
        renderTree();
      });
      search.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const first = (state.catalog?.tools || []).find((t) => t.enabled !== false && toolMatches(t, state.toolQuery));
        if (first) selectTool(first.name);
      });
    }
    const data = await api('bootstrap', { profile: 'desktop' });
    state.catalog = data.catalog;
    state.prefs = data.prefs;
    state.skills = data.skills;
    state.companions = data.companions;
    state.connector = data.connector;
    state.health = data.health;
    state.config = data.config;
    setHealth();
    renderPresets();
    renderTree();
    if (data.health?.source === 'connector') {
      toast(data.health.message || '已自动使用 MCP连接器配置');
    }
  }

  boot().catch((e) => {
    $('tree').innerHTML = `<div class="empty">加载失败：${e.message || e}</div>`;
  });
})();
