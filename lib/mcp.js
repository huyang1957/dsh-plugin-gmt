/**
 * 云端 MCP / Tools REST 探测与 mcpServers JSON 导出。
 */

function stripBearer(value) {
  const s = String(value || '').trim();
  if (/^bearer\s+/i.test(s)) return s.replace(/^bearer\s+/i, '');
  return s;
}

export function toolsBaseFromMcpUrl(mcpUrl) {
  try {
    const u = new URL(mcpUrl);
    u.pathname = u.pathname.replace(/\/mcp\/?$/, '') || '/';
    if (u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function buildMcpServersJson({ url, connectionName, headers }) {
  const name = connectionName || 'gmt-erp-cloud';
  return {
    mcpServers: {
      [name]: {
        url,
        headers: { ...headers },
      },
    },
  };
}

export async function testWhoami({ url, headers }) {
  const missing = [];
  for (const key of ['Authorization', 'X-Erp-Base-Url', 'X-Erp-User', 'X-Erp-User-Token']) {
    if (!headers?.[key]) missing.push(key);
  }
  if (!url) missing.push('url');
  if (missing.length) {
    return { ok: false, stage: 'validate', message: `缺少配置：${missing.join(', ')}` };
  }

  const base = toolsBaseFromMcpUrl(url);
  const authToken = stripBearer(headers.Authorization);
  const body = {
    accesstoken: authToken,
    erp_accesstoken: authToken,
    erp_base_url: headers['X-Erp-Base-Url'],
    erp_user: headers['X-Erp-User'],
    erp_user_token: headers['X-Erp-User-Token'],
    'X-Erp-User-Token': headers['X-Erp-User-Token'],
    enterprise: headers['X-Enterprise'] || '',
  };

  // 优先走 Tools REST（云端网关若暴露 /tools）
  if (base) {
    try {
      const res = await fetch(`${base}/tools/whoami_erp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 400) }; }
      if (res.ok) {
        return {
          ok: true,
          stage: 'tools-rest',
          message: 'whoami_erp 调用成功',
          status: res.status,
          data,
        };
      }
      // 404 时再试 MCP initialize
      if (res.status !== 404) {
        return {
          ok: false,
          stage: 'tools-rest',
          message: `Tools REST 失败 HTTP ${res.status}`,
          status: res.status,
          data,
        };
      }
    } catch (error) {
      // 继续尝试 MCP
      if (!(error instanceof Error) || !/fetch|network|ENOTFOUND|ECONN/i.test(error.message)) {
        // still try mcp
      }
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'dsh-plugin-gmt', version: '0.1.0' },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (res.ok || res.status === 200 || text.includes('serverInfo') || text.includes('result')) {
      return {
        ok: true,
        stage: 'mcp-initialize',
        message: 'MCP 端点可访问（initialize 有响应）。完整 whoami 请在连接器接入后于对话中调用 whoami_erp。',
        status: res.status,
        preview: text.slice(0, 500),
      };
    }
    return {
      ok: false,
      stage: 'mcp-initialize',
      message: `MCP 端点响应异常 HTTP ${res.status}`,
      status: res.status,
      preview: text.slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      stage: 'mcp-initialize',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
