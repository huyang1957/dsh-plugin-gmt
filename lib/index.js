/**
 * 固美特 ERP · DSH 插件（Host 半）
 * - 持久化偏好 / MCP 凭证
 * - /gmt-erp/api + /gmt-erp/ui
 * - 技能安装、mcpServers JSON 导出、whoami 探测
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getMcpConfig,
  loadPrefs,
  publicPrefs,
  pushHistory,
  savePrefs,
  saveSecrets,
  touchRecent,
} from './store.js';
import { buildMcpServersJson, testWhoami } from './mcp.js';
import { companionInstallCommands, installSkills, listBundledSkillIds, skillsStatus, PLUGIN_ROOT } from './skills.js';
import { listConnectorConnections, pickDefaultGmtConnection, getConnectorConnection } from './connector-detect.js';
import { buildToolPrompt, sessionTitle } from './prompt.js';
import { injectWebRoutes } from './web.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, 'catalog', 'tools.json');

export const name = 'gmt-erp';

export const inject = [];

let catalogCache = null;

async function loadCatalog() {
  if (catalogCache) return catalogCache;
  const raw = await readFile(CATALOG_PATH, 'utf8');
  catalogCache = JSON.parse(raw);
  return catalogCache;
}

function toolByName(catalog, name) {
  return (catalog.tools || []).find((t) => t.name === name);
}

function applyRoleFilter(catalog, prefs) {
  const role = prefs.role && catalog.roles?.[prefs.role];
  const disabled = new Set(prefs.disabledTools || []);
  const all = catalog.tools || [];
  let tools = all;
  if (role?.enabledGroups?.length) {
    const allow = new Set(role.enabledGroups);
    tools = all.filter((t) => allow.has(t.group));
  }
  const mark = (list) => list.map((t) => ({
    ...t,
    enabled: !disabled.has(t.name),
  }));
  return {
    ...catalog,
    tools: mark(tools),
    allTools: mark(all),
    stats: { total: all.length, visible: tools.length },
  };
}

function localMcpReady(mcp) {
  return Boolean(
    mcp?.url
    && (mcp.headers?.Authorization || mcp.headers?.authorization)
    && (mcp.headers?.['X-Erp-User-Token'] || mcp.headers?.['X-Erp-Base-Url']),
  );
}

/**
 * 优先本插件本地配置；否则自动采用 MCP连接器里已有的固美特连接。
 */
async function resolveEffectiveMcp(prefs, resolved) {
  const local = await getMcpConfig(prefs);
  if (localMcpReady(local)) {
    return {
      mcp: local,
      source: 'local',
      connectionName: local.connectionName || resolved.connectionName,
      selectedKey: prefs.mcp?.connectorKey || '',
    };
  }

  const preferred = prefs.mcp?.connectorKey || prefs.mcp?.connectionName || resolved.connectionName;
  const picked = (preferred && await getConnectorConnection(preferred))
    || await pickDefaultGmtConnection(preferred);
  if (picked?.url && picked.hasToken) {
    return {
      mcp: {
        url: picked.url,
        connectionName: picked.name || picked.serverName || resolved.connectionName,
        headers: picked.headers || {},
      },
      source: 'connector',
      connectionName: picked.name || picked.serverName,
      selectedKey: picked.key,
      enabled: picked.enabled,
    };
  }

  return {
    mcp: {
      url: local.url || resolved.defaultMcpUrl,
      connectionName: local.connectionName || resolved.connectionName,
      headers: local.headers || {},
    },
    source: 'none',
    connectionName: local.connectionName || resolved.connectionName,
    selectedKey: '',
  };
}

export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console;
  const resolved = {
    showSidebarEntry: config.showSidebarEntry !== false,
    connectionName: config.connectionName || 'gmt-erp-cloud',
    defaultMcpUrl: config.defaultMcpUrl || 'https://mcp.f.szgoodmate.com:2443/mcp',
  };

  async function dispatch(method, params) {
    const catalog = await loadCatalog();
    const allNames = (catalog.tools || []).map((t) => t.name);
    let prefs = await loadPrefs(allNames);
    if (!prefs.mcp?.url) prefs.mcp.url = resolved.defaultMcpUrl;
    if (!prefs.mcp?.connectionName) prefs.mcp.connectionName = resolved.connectionName;

    switch (method) {
      case 'bootstrap': {
        const skills = await skillsStatus();
        const connector = await listConnectorConnections();
        const effective = await resolveEffectiveMcp(prefs, resolved);

        // 若本插件尚未自配，但连接器已有固美特连接：同步引用（不强制复制密钥到本插件）
        if (effective.source === 'connector' && effective.selectedKey) {
          const nextPrefs = {
            ...prefs,
            mcp: {
              ...(prefs.mcp || {}),
              url: effective.mcp.url,
              connectionName: effective.connectionName,
              connectorKey: effective.selectedKey,
              source: 'connector',
            },
            companionHints: {
              ...(prefs.companionHints || {}),
              'dsh-mcp-connector': true,
            },
          };
          // 仅当偏好尚未标记来源时写回，避免每次 bootstrap 都刷盘
          if (prefs.mcp?.source !== 'connector' || prefs.mcp?.connectorKey !== effective.selectedKey) {
            prefs = nextPrefs;
            await savePrefs(prefs);
          } else {
            prefs = nextPrefs;
          }
        }

        const configured = effective.source !== 'none' && (
          localMcpReady(effective.mcp) || effective.source === 'connector'
        );
        const health = {
          configured,
          source: effective.source,
          connectionName: effective.connectionName,
          selectedKey: effective.selectedKey,
          connectorAvailable: connector.available,
          connectorGmtCount: connector.gmtConnections.length,
          connectorEnabledCount: connector.gmtConnections.filter((c) => c.enabled).length,
          lastTest: prefs.mcp?.lastTest || null,
          message: effective.source === 'connector'
            ? `已使用 MCP连接器中的「${effective.connectionName}」${effective.enabled === false ? '（当前为禁用，建议在连接器中启用）' : ''}`
            : effective.source === 'local'
              ? '使用本插件本地 MCP 配置'
              : '未检测到可用 MCP，请在 MCP连接器中添加固美特连接，或在下方手动配置',
        };
        return {
          catalog: applyRoleFilter(catalog, prefs),
          prefs: publicPrefs(prefs),
          skills,
          companions: companionInstallCommands(params?.profile || 'desktop', PLUGIN_ROOT),
          connector,
          health,
          config: resolved,
          version: '0.1.10',
        };
      }
      case 'getPrefs':
        return { prefs: publicPrefs(prefs) };
      case 'saveMcp': {
        const url = String(params?.url || '').trim();
        const connectionName = String(params?.connectionName || resolved.connectionName).trim();
        const headers = { ...(params?.headers || {}) };
        const secretHeaders = {};
        const publicHeaders = {};
        for (const [k, v] of Object.entries(headers)) {
          const val = v == null ? '' : String(v);
          if (/token|authorization|secret|password/i.test(k)) {
            if (val && val !== '********') secretHeaders[k] = val;
            publicHeaders[k] = val ? '********' : '';
          } else {
            publicHeaders[k] = val;
            secretHeaders[k] = val;
          }
        }
        // 保留未改动的旧 secret
        const prevSecrets = (await getMcpConfig(prefs)).headers;
        for (const [k, v] of Object.entries(publicHeaders)) {
          if (v === '********' && prevSecrets[k]) secretHeaders[k] = prevSecrets[k];
        }
        prefs.mcp = {
          ...(prefs.mcp || {}),
          url,
          connectionName,
          headers: publicHeaders,
          source: 'local',
          connectorKey: '',
        };
        await saveSecrets(secretHeaders);
        await savePrefs(prefs);
        return { prefs: publicPrefs(prefs), message: 'MCP 配置已保存到本插件（令牌仅存本机）' };
      }
      case 'testMcp': {
        let mcp;
        if (params?.url || params?.headers) {
          mcp = await getMcpConfig(prefs);
          if (params?.url) mcp.url = String(params.url);
          if (params?.headers) {
            for (const [k, v] of Object.entries(params.headers)) {
              if (v && v !== '********') mcp.headers[k] = String(v);
            }
          }
        } else {
          mcp = (await resolveEffectiveMcp(prefs, resolved)).mcp;
        }
        const result = await testWhoami(mcp);
        prefs.mcp.lastTest = {
          ok: result.ok,
          stage: result.stage,
          message: result.message,
          at: Date.now(),
        };
        await savePrefs(prefs);
        return { result, prefs: publicPrefs(prefs) };
      }
      case 'exportMcpJson': {
        const effective = await resolveEffectiveMcp(prefs, resolved);
        return { json: buildMcpServersJson(effective.mcp), source: effective.source };
      }
      case 'listConnectorConnections':
        return await listConnectorConnections();
      case 'useConnectorConnection': {
        const key = String(params?.key || params?.name || '').trim();
        if (!key) throw new Error('missing connection key');
        const picked = await getConnectorConnection(key);
        if (!picked) throw new Error(`未找到连接：${key}`);
        prefs.mcp = {
          ...(prefs.mcp || {}),
          url: picked.url,
          connectionName: picked.name || picked.serverName || key,
          connectorKey: picked.key,
          source: 'connector',
          // 本地 headers 置空提示，实际运行时从连接器读取
          headers: {
            Authorization: picked.headers.Authorization ? '********' : '',
            'X-Enterprise': picked.headers['X-Enterprise'] || '',
            'X-Erp-Base-Url': picked.headers['X-Erp-Base-Url'] || '',
            'X-Erp-User': picked.headers['X-Erp-User'] || '',
            'X-Erp-User-Token': picked.headers['X-Erp-User-Token'] ? '********' : '',
          },
        };
        prefs.companionHints = { ...(prefs.companionHints || {}), 'dsh-mcp-connector': true };
        await savePrefs(prefs);
        return {
          prefs: publicPrefs(prefs),
          message: `已选用 MCP连接器中的「${prefs.mcp.connectionName}」，无需重复填写令牌`,
          connection: {
            key: picked.key,
            name: picked.name,
            url: picked.url,
            enabled: picked.enabled,
          },
        };
      }
      case 'setDisabledTools': {
        prefs.disabledTools = Array.isArray(params?.disabledTools) ? params.disabledTools.map(String) : [];
        await savePrefs(prefs);
        return { prefs: publicPrefs(prefs) };
      }
      case 'setRole': {
        prefs.role = String(params?.role || 'boss');
        await savePrefs(prefs);
        return { prefs: publicPrefs(prefs), catalog: applyRoleFilter(catalog, prefs) };
      }
      case 'toggleFavorite': {
        const name = String(params?.name || '');
        if (!name) throw new Error('missing name');
        const set = new Set(prefs.favorites || []);
        if (set.has(name)) set.delete(name);
        else set.add(name);
        prefs.favorites = [...set];
        await savePrefs(prefs);
        return { prefs: publicPrefs(prefs) };
      }
      case 'preparePrompt': {
        const name = String(params?.tool || '');
        const tool = toolByName(catalog, name);
        if (!tool) throw new Error(`未知工具: ${name}`);
        if ((prefs.disabledTools || []).includes(name)) throw new Error('该工具已禁用');
        const values = params?.values || {};
        if (tool.readonly === false && values.confirm === true && params?.confirmed !== true) {
          return {
            needConfirm: true,
            message: '写操作需要二次确认：将生成采购草稿（不自动审核）。',
          };
        }
        const prompt = buildToolPrompt(tool, values, params?.note);
        prefs = touchRecent(prefs, name);
        prefs = pushHistory(prefs, {
          tool: name,
          title: sessionTitle(tool),
          promptPreview: prompt.slice(0, 240),
          prompt,
        });
        await savePrefs(prefs);
        return {
          prompt,
          title: sessionTitle(tool),
          prefs: publicPrefs(prefs),
        };
      }
      case 'installSkills': {
        const ids = Array.isArray(params?.skills) ? params.skills : listBundledSkillIds();
        const result = await installSkills(ids);
        prefs.installedSkills = result.results.filter((r) => r.ok).map((r) => r.id);
        await savePrefs(prefs);
        return { ...result, prefs: publicPrefs(prefs) };
      }
      case 'skillsStatus':
        return await skillsStatus();
      case 'companions':
        return companionInstallCommands(params?.profile || 'desktop', PLUGIN_ROOT);
      case 'markCompanion': {
        const pkg = String(params?.package || '');
        if (!pkg) throw new Error('missing package');
        prefs.companionHints = { ...(prefs.companionHints || {}), [pkg]: params?.installed !== false };
        await savePrefs(prefs);
        return { prefs: publicPrefs(prefs) };
      }
      default:
        throw new Error(`未知方法 "${method}"`);
    }
  }

  // webServer + 新版 webStartup 或旧版 webRuntime；纯对话部署不挂载 HTTP 路由。
  if (typeof ctx.inject === 'function') {
    try {
      injectWebRoutes(ctx, dispatch, { logger });
    } catch (error) {
      logger.warn?.(`[gmt-erp] web UI not mounted: ${error instanceof Error ? error.message : error}`);
    }
  }

  logger.info?.('[gmt-erp] host plugin active');
}
