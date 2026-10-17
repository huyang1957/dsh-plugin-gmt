import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STORE_DIR = join(homedir(), '.dsh', 'storages', 'gmt-erp');
const PREFS_FILE = join(STORE_DIR, 'prefs.json');
const SECRETS_FILE = join(STORE_DIR, 'mcp-secrets.json');

function defaultPrefs(allToolNames = []) {
  return {
    version: 1,
    role: 'all',
    disabledTools: [],
    favorites: [],
    recent: [],
    history: [],
    installedSkills: [],
    companionHints: {
      'dsh-mcp-connector': false,
      '@changfenhuang/dsh-genui': false,
    },
    mcp: {
      url: 'https://mcp.f.szgoodmate.com:2443/mcp',
      connectionName: 'gmt-erp-cloud',
      headers: {
        Authorization: '',
        'X-Enterprise': '',
        'X-Erp-Base-Url': '',
        'X-Erp-User': '',
        'X-Erp-User-Token': '',
      },
      lastTest: null,
    },
    allToolNames,
  };
}

async function ensureDir() {
  await mkdir(STORE_DIR, { recursive: true });
}

export async function loadPrefs(allToolNames = []) {
  await ensureDir();
  try {
    const raw = await readFile(PREFS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return { ...defaultPrefs(allToolNames), ...data, mcp: { ...defaultPrefs().mcp, ...(data.mcp || {}) } };
  } catch {
    return defaultPrefs(allToolNames);
  }
}

export async function savePrefs(prefs) {
  await ensureDir();
  const safe = structuredClone(prefs);
  // 令牌不进 prefs；只存非敏感字段提示
  if (safe.mcp?.headers) {
    for (const key of Object.keys(safe.mcp.headers)) {
      if (/token|authorization|secret|password/i.test(key) && safe.mcp.headers[key]) {
        safe.mcp.headers[key] = safe.mcp.headers[key] ? '********' : '';
      }
    }
  }
  await writeFile(PREFS_FILE, JSON.stringify(safe, null, 2), 'utf8');
}

export async function loadSecrets() {
  await ensureDir();
  try {
    return JSON.parse(await readFile(SECRETS_FILE, 'utf8'));
  } catch {
    return { headers: {} };
  }
}

export async function saveSecrets(headers) {
  await ensureDir();
  await writeFile(SECRETS_FILE, JSON.stringify({ headers: headers || {}, updatedAt: Date.now() }, null, 2), 'utf8');
}

export async function getMcpConfig(prefs) {
  const secrets = await loadSecrets();
  const headers = { ...(prefs.mcp?.headers || {}) };
  for (const [k, v] of Object.entries(secrets.headers || {})) {
    if (v && v !== '********') headers[k] = v;
  }
  // 若 prefs 里仍是掩码，用 secrets 覆盖
  for (const [k, v] of Object.entries(headers)) {
    if (v === '********' && secrets.headers?.[k]) headers[k] = secrets.headers[k];
  }
  return {
    url: prefs.mcp?.url || '',
    connectionName: prefs.mcp?.connectionName || 'gmt-erp-cloud',
    headers,
  };
}

export function touchRecent(prefs, toolName, max = 20) {
  const recent = [{ name: toolName, at: Date.now() }, ...(prefs.recent || []).filter((x) => x.name !== toolName)];
  prefs.recent = recent.slice(0, max);
  return prefs;
}

export function pushHistory(prefs, entry, max = 50) {
  const history = [{ ...entry, at: Date.now() }, ...(prefs.history || [])];
  prefs.history = history.slice(0, max);
  return prefs;
}

export function publicPrefs(prefs) {
  const out = structuredClone(prefs);
  if (out.mcp?.headers) {
    for (const key of Object.keys(out.mcp.headers)) {
      const val = out.mcp.headers[key];
      if (!val) {
        out.mcp.headers[key] = '';
      } else if (/token|authorization|secret|password/i.test(key)) {
        out.mcp.headers[key] = '********';
      }
    }
  }
  out.hasSecrets = true;
  return out;
}

export { STORE_DIR, PREFS_FILE, SECRETS_FILE };
