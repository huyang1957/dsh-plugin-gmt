/**
 * 读取 dsh-mcp-connector 本机存储，发现已配置的固美特 ERP MCP 连接。
 * 路径：~/.dsh/storages/mcp_connector.json
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONNECTOR_STORE = join(homedir(), '.dsh', 'storages', 'mcp_connector.json');

function isGmtLike(rec) {
  const name = `${rec.name || ''} ${rec.serverName || ''} ${rec.key || ''}`.toLowerCase();
  const url = String(rec.url || '').toLowerCase();
  if (/gmt[-_]?erp|固美特|goodmate|szgoodmate/.test(name)) return true;
  if (/szgoodmate|goodmate/.test(url) && /\/mcp/.test(url)) return true;
  if (rec.headers?.['X-Erp-User-Token'] || rec.headers?.['X-Erp-Base-Url']) return true;
  return false;
}

function recordToHeaders(rec) {
  const headers = { ...(rec.headers || {}) };
  const bearer = rec.auth?.bearerToken || rec.auth?.token || '';
  if (bearer && !headers.Authorization) {
    headers.Authorization = /^bearer\s+/i.test(bearer) ? bearer : `Bearer ${bearer}`;
  }
  return headers;
}

function publicConnection(rec) {
  const headers = recordToHeaders(rec);
  return {
    key: rec.key,
    name: rec.name || rec.serverName || rec.key,
    serverName: rec.serverName || '',
    url: rec.url || '',
    transport: rec.transport || '',
    enabled: rec.enabled !== false,
    gmtLike: isGmtLike(rec),
    hasToken: Boolean(
      headers.Authorization
      || headers['X-Erp-User-Token']
      || rec.auth?.bearerToken,
    ),
    headerKeys: Object.keys(headers),
  };
}

function fullConnection(rec) {
  return {
    ...publicConnection(rec),
    headers: recordToHeaders(rec),
  };
}

/**
 * @returns {Promise<{ available: boolean, path: string, connections: any[], gmtConnections: any[] }>}
 */
export async function listConnectorConnections() {
  try {
    const raw = await readFile(CONNECTOR_STORE, 'utf8');
    const data = JSON.parse(raw);
    const table = data?.tables?.connections;
    if (!table || typeof table !== 'object') {
      return { available: true, path: CONNECTOR_STORE, connections: [], gmtConnections: [] };
    }
    const records = Object.values(table).filter((r) => r && typeof r === 'object' && r.url);
    const connections = records.map(publicConnection);
    const gmtConnections = connections.filter((c) => c.gmtLike);
    return { available: true, path: CONNECTOR_STORE, connections, gmtConnections };
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return { available: false, path: CONNECTOR_STORE, connections: [], gmtConnections: [] };
    }
    return {
      available: false,
      path: CONNECTOR_STORE,
      connections: [],
      gmtConnections: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 按 key / name 取完整连接（含 headers，仅供 Host 内部使用）。
 */
export async function getConnectorConnection(keyOrName) {
  try {
    const raw = await readFile(CONNECTOR_STORE, 'utf8');
    const data = JSON.parse(raw);
    const table = data?.tables?.connections || {};
    const want = String(keyOrName || '').trim().toLowerCase();
    for (const rec of Object.values(table)) {
      if (!rec || typeof rec !== 'object') continue;
      const keys = [rec.key, rec.name, rec.serverName].map((x) => String(x || '').toLowerCase());
      if (want && keys.includes(want)) return fullConnection(rec);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 挑选默认要用的固美特连接：
 * 1) 偏好 connectionName
 * 2) 已启用的 gmtLike
 * 3) 任意 gmtLike
 * 4) 已启用且带 ERP token 的 HTTP 连接
 */
export async function pickDefaultGmtConnection(preferredName = '') {
  try {
    const raw = await readFile(CONNECTOR_STORE, 'utf8');
    const data = JSON.parse(raw);
    const table = data?.tables?.connections || {};
    const records = Object.values(table).filter((r) => r && typeof r === 'object' && r.url);
    if (!records.length) return null;

    const preferred = String(preferredName || '').trim().toLowerCase();
    const score = (rec) => {
      let s = 0;
      if (rec.enabled !== false) s += 10;
      if (isGmtLike(rec)) s += 20;
      const names = [rec.key, rec.name, rec.serverName].map((x) => String(x || '').toLowerCase());
      if (preferred && names.includes(preferred)) s += 50;
      if (rec.auth?.bearerToken || rec.headers?.['X-Erp-User-Token']) s += 5;
      return s;
    };

    let best = null;
    let bestScore = -1;
    for (const rec of records) {
      const s = score(rec);
      if (s > bestScore) {
        best = rec;
        bestScore = s;
      }
    }
    if (!best || bestScore < 10) return null;
    return fullConnection(best);
  } catch {
    return null;
  }
}

export { CONNECTOR_STORE };
