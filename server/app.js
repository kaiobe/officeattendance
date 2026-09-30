/**
 * The HTTP side of the app: the shared service (public/core/service.js) over
 * SQLite, plus the page and its files. Built by createApp so tests can drive
 * it in-process with their own database and their own idea of what day it is.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteStore } from './db.js';
import { versionInfo, VERSION, BUILD } from './version.js';
import { HttpError, send, json, download, readJson, serveStatic } from './http.js';
import { createService, Download } from '../public/core/service.js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * @param {object} opts
 * @param {import('node:sqlite').DatabaseSync} opts.db
 * @param {() => string} opts.today  today's date as YYYY-MM-DD, in the app's timezone
 * @param {string} [opts.tz]         reported by /api/health
 */
export function createApp({ db, today, tz = 'Australia/Melbourne', log = console }) {
  const service = createService({ store: sqliteStore(db), today, tz, versionInfo });

  return async function handle(req, res) {
    try {
      let url;
      try { url = new URL(req.url, 'http://app.local'); } catch { throw new HttpError(400, 'bad request path'); }
      const path = url.pathname;
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      const route = service.route(method, path);
      if (route) {
        // Changes must arrive as JSON - readJson also turns away cross-site posts.
        const body = method === 'GET' ? {} : await readJson(req);
        const out = await route({ query: url.searchParams, body });
        if (out instanceof Download) download(res, out.type, out.filename, out.body);
        else json(res, 200, out);
        return;
      }
      if (path.startsWith('/api/')) {
        const methods = service.allowed(path);
        if (methods.length) throw new HttpError(405, `use ${methods.join(' or ')}`);
        throw new HttpError(404, 'no such endpoint');
      }
      if (path === '/' || path === '/index.html') return await sendPage(req, res);
      // /b/<build>/... is the same file as /...: see sendPage.
      const pinned = path.match(/^\/b\/[^/]+(\/.+)$/);
      await serveStatic(req, res, PUBLIC, pinned ? pinned[1] : path);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) log.error(err);
      if (res.headersSent) { res.destroy(); return; }
      json(res, status, { error: status === 500 ? 'internal error - see the server log' : err.message });
    }
  };
}

/**
 * The page, pointing at this build's own copy of the code. A proxy or CDN that
 * caches .js and .css by extension - Nginx Proxy Manager's "Cache assets" does,
 * ignoring the no-store header - would otherwise keep serving the previous
 * release's JavaScript after a redeploy, and no reload could shake it off.
 * Under /b/<version>-<build>/ every deploy's files have addresses no cache
 * has seen, and the modules' relative imports stay inside the same prefix.
 * The page itself is never cached, so it always names the current build.
 */
const BUILD_PREFIX = `/b/${VERSION}-${BUILD ?? 0}`;
async function sendPage(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
  const html = (await readFile(join(PUBLIC, 'index.html'), 'utf8'))
    .replace('href="/styles.css"', `href="${BUILD_PREFIX}/styles.css"`)
    .replace('src="/app.js"', `src="${BUILD_PREFIX}/app.js"`);
  send(res, 200, { 'content-type': 'text/html; charset=utf-8' }, req.method === 'HEAD' ? '' : html);
}
