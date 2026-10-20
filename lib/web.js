import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(__dirname, '..', 'ui');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function header(headers, name) {
  const value = headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseAuthority(host) {
  if (typeof host !== 'string' || host.length === 0) return undefined;
  try {
    const u = new URL(`http://${host}`);
    if (!u.hostname) return undefined;
    return { hostname: u.hostname, host: u.host, port: u.port };
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0:0:0:0:0:0:0:1' ||
    hostname.endsWith('.localhost')
  );
}

export function isTrustedWebRequest(request, trustedHosts = []) {
  const host = header(request.headers, 'host');
  const authority = parseAuthority(host);
  if (!authority) return false;
  const loopback = isLoopbackHostname(authority.hostname);
  const trusted = (trustedHosts || []).some((raw) => {
    const a = typeof raw === 'string' ? parseAuthority(raw) : undefined;
    return a && a.host === authority.host;
  });
  if (!loopback && !trusted) return false;

  const origin = header(request.headers, 'origin');
  if (origin) {
    try {
      const o = new URL(origin);
      if (o.host !== authority.host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readJsonBody(req, max = 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > max) throw new Error('request body too large');
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function resolveUiFile(pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = resolve(UI_DIR, rel);
  const root = resolve(UI_DIR);
  const relToRoot = relative(root, full);
  if (!relToRoot || relToRoot.startsWith('..') || relToRoot.includes(`..${sep}`)) {
    return { ok: false };
  }
  const normalized = normalize(full);
  if (!normalized.startsWith(root)) return { ok: false };
  return { ok: true, path: normalized, rel: relToRoot };
}

function extOf(rel) {
  const i = rel.lastIndexOf('.');
  return i >= 0 ? rel.slice(i) : '';
}

/**
 * Alternative dependencies, not an AND: DSH 0.2.1-alpha.1 removed webRuntime.
 * Prefer webStartup when both exist; keep each mount owned by its injection context.
 *
 * @param {any} ctx
 * @param {(method: string, params: any) => Promise<any>} dispatch
 */
export function injectWebRoutes(ctx, dispatch, options = {}) {
  const candidates = new Map();
  let active;
  let dispose;
  const reconcile = () => {
    const next = candidates.get('webStartup') ?? candidates.get('webRuntime');
    if (next === active) return;
    dispose?.();
    dispose = undefined;
    active = next;
    if (next) {
      dispose = mountWebRoutes(next.ctx, dispatch, {
        ...options,
        trustedHosts: next.trustedHosts,
      });
      options.logger?.info?.('[gmt-erp] web UI mounted at /gmt-erp/ui/');
    }
  };
  for (const name of ['webStartup', 'webRuntime']) {
    ctx.inject(['webServer', name], (wctx) => {
      wctx.effect(() => {
        const candidate = { ctx: wctx, trustedHosts: wctx[name]?.trustedHosts ?? [] };
        candidates.set(name, candidate);
        reconcile();
        return () => {
          if (candidates.get(name) === candidate) candidates.delete(name);
          reconcile();
        };
      });
    });
  }
}

/**
 * @param {any} wctx
 * @param {(method: string, params: any) => Promise<any>} dispatch
 */
export function mountWebRoutes(wctx, dispatch, {
  logger,
  trustedHosts = wctx.webStartup?.trustedHosts ?? wctx.webRuntime?.trustedHosts ?? [],
} = {}) {
  const fence = (req) => isTrustedWebRequest(req, trustedHosts);

  const apiDisposer = wctx.webServer.register({
    kind: 'prefix',
    path: '/gmt-erp/api',
    handler: async (req, res) => {
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, message: 'forbidden' });
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      try {
        const body = await readJsonBody(req);
        const method = body?.method;
        if (typeof method !== 'string' || !method) {
          writeJson(res, 400, { ok: false, message: 'missing method' });
          return;
        }
        const result = await dispatch(method, body?.params ?? {});
        writeJson(res, 200, { ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger?.warn?.(`[gmt-erp] api error: ${message}`);
        writeJson(res, 400, { ok: false, message });
      }
    },
  });

  const uiDisposer = wctx.webServer.register({
    kind: 'prefix',
    path: '/gmt-erp/ui',
    handler: async (req, res) => {
      if (!fence(req)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' });
        res.end();
        return;
      }
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/^\/gmt-erp\/ui/, '') || '/';
      const file = resolveUiFile(pathname);
      if (!file.ok) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      try {
        const body = await readFile(file.path);
        res.writeHead(200, {
          'content-type': MIME[extOf(file.rel)] ?? 'application/octet-stream',
          'cache-control': 'no-cache',
          'x-content-type-options': 'nosniff',
          'content-security-policy':
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
          'content-length': body.length,
        });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    },
  });

  return () => {
    try { apiDisposer?.(); } catch { /* ignore */ }
    try { uiDisposer?.(); } catch { /* ignore */ }
  };
}
