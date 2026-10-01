/**
 * Cloud backup for the standalone version, on Cloudflare Workers.
 *
 * The static site is served straight from dist/ (wrangler.jsonc, "assets").
 * This Worker only answers /sync/<id>: it keeps one encrypted backup per
 * recovery code in Workers KV, and nothing else.
 *
 * The phone encrypts before sending (public/local/cloud.js): the id is a hash
 * derived from the recovery code, and the contents are AES-GCM with a key
 * derived from it too. So this side never sees a code, a key or a single day
 * of anyone's attendance - only an id and ciphertext. Whoever hosts this can't
 * read it.
 *
 *   GET    /sync/<id>   the backup, or 404
 *   PUT    /sync/<id>   store a backup. If-Match must name the revision the
 *                       phone last saw ("new" when it expects none), so a
 *                       second device can't silently overwrite a newer copy:
 *                       a mismatch is 409, with the current revision.
 *                       If-Match: * replaces whatever is there.
 *   DELETE /sync/<id>   remove it (turning cloud backup off)
 *
 * And for passkeys (public/local/passkey.js), a recovery code locked with a
 * key only that passkey can produce, under an id derived from the same secret:
 *
 *   GET    /sync/key/<id>   the locked code, or 404
 *   PUT    /sync/key/<id>   store it (a few hundred bytes; replaces any)
 *   DELETE /sync/key/<id>   remove it
 */

const ID = /^[0-9a-f]{64}$/;
const MAX_BYTES = 1024 * 1024;                 // a backup is ~30 KB a year; this is decades
const KEEP_SECONDS = 3 * 365 * 24 * 3600;      // unused for three years: let it go (each backup renews it)
const MAX_KEY_BYTES = 4096;                    // a locked recovery code is ~150 bytes

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};
const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

/** A JSON body shaped like {v:1, iv, ct}, or a Response saying what's wrong. */
async function readBox(request, maxBytes) {
  if ((request.headers.get('content-type') || '').split(';')[0].trim() !== 'application/json') {
    return reply(415, { error: 'send JSON' });
  }
  const body = await request.text();
  if (body.length > maxBytes) return reply(413, { error: 'too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return reply(400, { error: 'not JSON' }); }
  if (!parsed || parsed.v !== 1 || typeof parsed.iv !== 'string' || typeof parsed.ct !== 'string') {
    return reply(400, { error: 'not an encrypted backup' });
  }
  return body;
}

/** /sync/key/<id>: a passkey's locked recovery code. No revisions: only that passkey can work out the id. */
async function handleKey(request, env, id) {
  const key = `k:${id}`;
  if (request.method === 'GET') {
    const value = await env.BACKUPS.get(key);
    return value == null ? reply(404, { error: 'no passkey backup here' }) : new Response(value, { status: 200, headers: HEADERS });
  }
  if (request.method === 'PUT') {
    const body = await readBox(request, MAX_KEY_BYTES);
    if (body instanceof Response) return body;
    await env.BACKUPS.put(key, body, { expirationTtl: KEEP_SECONDS });
    return reply(200, { saved: true });
  }
  if (request.method === 'DELETE') {
    await env.BACKUPS.delete(key);
    return reply(200, { deleted: true });
  }
  return reply(405, { error: 'use GET, PUT or DELETE' }, { allow: 'GET, PUT, DELETE' });
}

export async function handleSync(request, env) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/sync\/(?:(key)\/)?([^/]+)$/);
  if (!m || !ID.test(m[2])) return reply(404, { error: 'not found' });
  if (!env.BACKUPS) return reply(503, { error: 'cloud backup is not set up on this site' });
  // Only this site's own pages: a browser marks requests from other sites.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reply(403, { error: 'cross-site request refused' });
  if (m[1]) return handleKey(request, env, m[2]);

  const key = `b:${m[2]}`;
  if (request.method === 'GET') {
    const { value, metadata } = await env.BACKUPS.getWithMetadata(key);
    if (value == null) return reply(404, { error: 'no backup for this code' });
    return new Response(value, { status: 200, headers: { ...HEADERS, etag: `"${metadata?.rev || ''}"`, 'x-updated': String(metadata?.updated || '') } });
  }

  if (request.method === 'PUT') {
    const body = await readBox(request, MAX_BYTES);
    if (body instanceof Response) return body;
    const expect = (request.headers.get('if-match') || '').replace(/"/g, '').trim();
    if (!expect) return reply(428, { error: 'If-Match is required' });
    const current = await env.BACKUPS.getWithMetadata(key);
    const currentRev = current.value == null ? 'new' : current.metadata?.rev;
    if (expect !== '*' && expect !== currentRev) {
      return reply(409, { error: 'the backup was changed from another device', rev: currentRev, updated: current.metadata?.updated || null });
    }
    const rev = `${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
    const updated = Date.now();
    await env.BACKUPS.put(key, body, { metadata: { rev, updated, bytes: body.length }, expirationTtl: KEEP_SECONDS });
    return reply(200, { rev, updated });
  }

  if (request.method === 'DELETE') {
    await env.BACKUPS.delete(key);
    return reply(200, { deleted: true });
  }

  return reply(405, { error: 'use GET, PUT or DELETE' }, { allow: 'GET, PUT, DELETE' });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/sync/')) return handleSync(request, env);
    // Anything else that isn't a file of the site: let the assets answer (a 404).
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('not found', { status: 404 });
  },
};
