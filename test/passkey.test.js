import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { handleSync } from '../worker/index.js';
import { newCode, createCloud } from '../public/local/cloud.js';
import { createPasskeys, deriveFromSecret, lockCode, unlockCode, passkeysAvailable } from '../public/local/passkey.js';

/** Workers KV, in memory. */
function memoryKV() {
  const m = new Map();
  return {
    raw: m,
    async get(k) { return m.get(k)?.value ?? null; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { value: e.value, metadata: e.metadata } : { value: null, metadata: null }; },
    async put(k, value, opts = {}) { m.set(k, { value, metadata: opts.metadata, ttl: opts.expirationTtl }); },
    async delete(k) { m.delete(k); },
  };
}

function site() {
  const env = { BACKUPS: memoryKV() };
  const net = { down: false };
  const fetchImpl = async (url, init = {}) => {
    if (net.down) throw new TypeError('Failed to fetch');
    return handleSync(new Request(new URL(url, 'https://site.example'), init), env);
  };
  return { env, net, fetchImpl };
}

/**
 * A passkey manager (iCloud Keychain, say), shared by the phones signed in to
 * it. PRF is HMAC with a per-passkey secret, like the real thing.
 * `prf`: 'create' (secret at create and get), 'get' (only at get), 'none'.
 */
function keychain({ prf = 'create' } = {}) {
  const creds = [];
  const signalled = [];
  const out = (c, salt) => ({
    rawId: c.rawId,
    getClientExtensionResults: () => (prf === 'none' ? { prf: { enabled: false } }
      : { prf: { enabled: true, ...(salt ? { results: { first: new Uint8Array(createHmac('sha256', c.secret).update(Buffer.from(salt)).digest()).buffer } } : {}) } }),
  });
  const api = {
    creds, signalled, cancel: false,
    async create({ publicKey }) {
      if (api.cancel) throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
      const userId = Buffer.from(publicKey.user.id).toString('hex');
      for (const ex of publicKey.excludeCredentials || []) {
        if (creds.some((c) => Buffer.from(c.rawId).equals(Buffer.from(ex.id)))) throw Object.assign(new Error('exists'), { name: 'InvalidStateError' });
      }
      // a passkey for the same user replaces the old one
      const i = creds.findIndex((c) => c.userId === userId);
      if (i >= 0) creds.splice(i, 1);
      const c = { rawId: new Uint8Array(randomBytes(16)).buffer, secret: randomBytes(32), userId };
      creds.push(c);
      return out(c, prf === 'create' ? publicKey.extensions.prf.eval.first : null);
    },
    async get({ publicKey }) {
      if (api.cancel) throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
      const allowed = publicKey.allowCredentials
        ? creds.filter((c) => publicKey.allowCredentials.some((a) => Buffer.from(a.id).equals(Buffer.from(c.rawId))))
        : creds;
      const c = allowed.at(-1);
      if (!c) throw Object.assign(new Error('none'), { name: 'NotAllowedError' });
      return out(c, publicKey.extensions.prf.eval.first);
    },
  };
  api.signal = async (o) => { signalled.push(o.credentialId); };
  return api;
}

function phone(s, kc, data = { days: { '2026-10-14': { code: 'O' } } }) {
  const meta = new Map();
  const store = { getMeta: (k) => meta.get(k), setMeta: (k, v) => meta.set(k, v) };
  const ph = { meta, data };
  ph.cloud = createCloud({ store, snapshot: async () => ph.data, fetchImpl: s.fetchImpl });
  ph.passkeys = createPasskeys({ store, cloud: ph.cloud, fetchImpl: s.fetchImpl, credentials: () => kc, signal: kc.signal, rpId: () => 'site.example' });
  return ph;
}

test('a passkey secret locks and unlocks the code; a different passkey can\'t', async () => {
  const a = await deriveFromSecret(randomBytes(32));
  const b = await deriveFromSecret(randomBytes(32));
  assert.match(a.lookup, /^[0-9a-f]{64}$/);
  assert.notEqual(a.lookup, b.lookup);
  const box = await lockCode(a.key, 'K7QM-2XRP-9TVD-4HNA');
  assert.ok(!JSON.stringify(box).includes('K7QM'));
  assert.equal(await unlockCode(a.key, box), 'K7QM-2XRP-9TVD-4HNA');
  await assert.rejects(unlockCode(b.key, box));
});

test('add a passkey, then a new phone on the same keychain restores with it alone', async () => {
  const s = site();
  const kc = keychain();
  const a = phone(s, kc);
  const code = newCode();
  a.cloud.adopt(code);
  await a.cloud.flush();
  const entry = await a.passkeys.add();
  assert.equal(a.passkeys.list().length, 1);
  const stored = s.env.BACKUPS.raw.get(`k:${entry.lookup}`);
  assert.ok(stored && !stored.value.includes(code.slice(0, 4)), 'the server holds the code locked');
  assert.ok(stored.ttl > 365 * 24 * 3600);

  const b = phone(s, kc, null);
  const { code: got, entry: used } = await b.passkeys.recover();
  assert.equal(got, code);
  const backup = await b.cloud.fetchBackup(got);
  assert.deepEqual(backup.data, a.data);
  b.passkeys.remember(used);
  assert.equal(b.passkeys.list()[0].id, entry.id, 'the new phone lists the passkey it used');
});

test('phones that only give the secret when a passkey is used still work', async () => {
  const s = site();
  const kc = keychain({ prf: 'get' });
  const a = phone(s, kc);
  const code = newCode();
  a.cloud.adopt(code);
  await a.passkeys.add();
  assert.equal((await phone(s, kc).passkeys.recover()).code, code);
});

test("passkeys that can't give a secret: refused, and the useless passkey is withdrawn", async () => {
  const s = site();
  const kc = keychain({ prf: 'none' });
  const a = phone(s, kc);
  a.cloud.adopt(newCode());
  await assert.rejects(a.passkeys.add(), /can't unlock a backup/);
  assert.equal(a.passkeys.list().length, 0);
  assert.equal(kc.signalled.length, 1, 'the passkey manager is told to drop it');
  assert.equal([...s.env.BACKUPS.raw.keys()].filter((k) => k.startsWith('k:')).length, 0);
});

test('cancelled, offline, already there, no cloud backup: each says so plainly', async () => {
  const s = site();
  const kc = keychain();
  const a = phone(s, kc);
  await assert.rejects(a.passkeys.add(), /Turn on cloud backup first/);
  a.cloud.adopt(newCode());
  kc.cancel = true;
  await assert.rejects(a.passkeys.add(), /No passkey was saved/);
  await assert.rejects(phone(s, kc).passkeys.recover(), /No passkey was used/);
  kc.cancel = false;
  s.net.down = true;
  await assert.rejects(a.passkeys.add(), /Couldn't reach the backup/);
  assert.equal(a.passkeys.list().length, 0);
  s.net.down = false;
  await a.passkeys.add();
  await assert.rejects(a.passkeys.add(), /already has a passkey/);
  await assert.rejects(phone(s, keychain()).passkeys.recover(), /No passkey was used/, 'a keychain with no passkey for the site');
});

test('removing a passkey, or turning backup off, stops it restoring; the code still does', async () => {
  const s = site();
  const kc = keychain();
  const a = phone(s, kc);
  const code = newCode();
  a.cloud.adopt(code);
  await a.cloud.flush();
  const p = await a.passkeys.add();
  await a.passkeys.remove(p.id);
  assert.equal(a.passkeys.list().length, 0);
  assert.ok(kc.signalled.includes(p.id));
  await assert.rejects(phone(s, kc).passkeys.recover(), /has no backup any more/);
  assert.equal((await phone(s, kc).cloud.fetchBackup(code)).code, code);

  await a.passkeys.add();
  await a.passkeys.removeAll();
  await a.cloud.turnOff();
  assert.equal(s.env.BACKUPS.raw.size, 0, 'nothing left in the cloud');
});

test('locked codes are re-saved monthly, so a kept passkey never expires', async () => {
  const s = site();
  const kc = keychain();
  const a = phone(s, kc);
  a.cloud.adopt(newCode());
  const p = await a.passkeys.add();
  s.env.BACKUPS.raw.delete(`k:${p.lookup}`);          // as if it had expired
  await a.passkeys.renew();
  assert.ok(!s.env.BACKUPS.raw.has(`k:${p.lookup}`), 'not yet: renewed this month');
  a.meta.set('passkeysRenewed', Date.now() - 31 * 86400000);
  await a.passkeys.renew();
  assert.ok(s.env.BACKUPS.raw.has(`k:${p.lookup}`));
  assert.equal((await phone(s, kc).passkeys.recover()).code, a.cloud.status().code);
});

test('the Worker keeps locked codes small, well-formed, and same-site only', async () => {
  const s = site();
  const id = 'a'.repeat(64);
  const put = (body, headers = { 'content-type': 'application/json' }) => s.fetchImpl(`/sync/key/${id}`, { method: 'PUT', headers, body });
  assert.equal((await s.fetchImpl(`/sync/key/${id}`)).status, 404);
  assert.equal((await put('{"v":1,"iv":"a","ct":"b"}')).status, 200);
  assert.equal((await s.fetchImpl(`/sync/key/${id}`)).status, 200);
  assert.equal((await put(JSON.stringify({ v: 1, iv: 'a', ct: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await put('{"v":2}')).status, 400);
  assert.equal((await put('x', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await s.fetchImpl(`/sync/key/${id}`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await s.fetchImpl('/sync/key/nothex')).status, 404);
  assert.equal((await s.fetchImpl(`/sync/key/${id}`, { method: 'POST' })).status, 405);
  assert.equal((await s.fetchImpl(`/sync/key/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await s.fetchImpl(`/sync/key/${id}`)).status, 404);
});

test('passkeys are offered only where the browser can do them', async () => {
  assert.equal(await passkeysAvailable({}), false);
  const base = { isSecureContext: true, navigator: { credentials: { create() {} } } };
  assert.equal(await passkeysAvailable({ ...base, PublicKeyCredential: {} }), true, 'no capability list: try it');
  assert.equal(await passkeysAvailable({ ...base, PublicKeyCredential: { getClientCapabilities: async () => ({ 'extension:prf': false }) } }), false);
  assert.equal(await passkeysAvailable({ ...base, PublicKeyCredential: { getClientCapabilities: async () => ({ 'extension:prf': true }) } }), true);
  assert.equal(await passkeysAvailable({ ...base, isSecureContext: false, PublicKeyCredential: {} }), false);
});
