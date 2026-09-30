/**
 * The small amount of HTTP plumbing the app needs: typed errors, JSON in and
 * out, security headers, and static files.
 */
import { readFile, stat } from 'node:fs/promises';
import { join, extname, sep } from 'node:path';

/** An error that knows its status code. Anything else thrown is a 500. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const MAX_BODY = 4 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Sent with every response. The page has no inline scripts and loads nothing
 * from elsewhere, so the policy can be tight; inline style attributes stay
 * allowed because the grid colours each cell with one.
 */
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

// no-store rather than no-cache: "no-cache" still permits a stored copy and
// relies on revalidation, and a CDN in front (Cloudflare caches .js, .css and
// .csv by extension) will happily keep serving the old copy after a redeploy.
const NO_STORE = 'no-store, max-age=0, must-revalidate';

export function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'cache-control': NO_STORE, ...headers });
  res.end(body);
}

export function json(res, status, body) {
  send(res, status, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify(body));
}

export function download(res, contentType, filename, body) {
  send(res, 200, { 'content-type': contentType, 'content-disposition': `attachment; filename="${filename}"` }, body);
}

/**
 * The body as JSON. Changes must arrive as application/json: a browser can't
 * send that cross-site without a preflight this server never approves, so it
 * also stops another site posting a form at the API with your saved login.
 */
export async function readJson(req) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'send JSON with content-type: application/json');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'cross-site request refused');

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'body too large');
    chunks.push(chunk);
  }
  // Join the bytes before decoding, so a character split across two chunks survives.
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    const body = JSON.parse(raw);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body;
  } catch {
    throw new HttpError(400, 'body is not a JSON object');
  }
}

/** Serve a file from root, or 404. Never anything outside root. */
export async function serveStatic(req, res, root, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
  let rel;
  try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); } catch { rel = null; }
  const file = rel && !rel.includes('\0') ? join(root, rel) : null;
  if (!file || !file.startsWith(root + sep)) return send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'not found');
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const buf = req.method === 'HEAD' ? '' : await readFile(file);
    send(res, 200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'content-length': info.size,
      'last-modified': info.mtime.toUTCString(),
    }, buf);
  } catch {
    send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'not found');
  }
}
