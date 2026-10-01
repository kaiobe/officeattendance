import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSync } from '../worker/index.js';
import { newCode, normaliseCode, deriveFromCode, createCloud } from '../public/local/cloud.js';

/** Workers KV, in memory. */
function memoryKV() {
  const m = new Map();
  return {
    raw: m,
    async getWithMetadata(k) { const e = m.get(k); return e ? { value: e.value, metadata: e.metadata } : { value: null, metadata: null }; },
    async put(k, value, opts = {}) { m.set(k, { value, metadata: opts.metadata, ttl: opts.expirationTtl }); },
    async delete(k) { m.delete(k); },
  };
}

/** fetch() straight into the Worker. `down` simulates no signal. */
function site(env = { BACKUPS: memoryKV() }) {
  const net = { down: false };
  const fetchImpl = async (url, init = {}) => {
    if (net.down) throw new TypeError('Failed to fetch');
    return handleSync(new Request(new URL(url, 'https://site.example'), init), env);
  };
  return { env, net, fetchImpl };
}

/** A phone: meta storage, some data, and its cloud engine. */
function phone(s, data = { settings: { holidayState: 'NSW' }, days: { '2026-10-14': { code: 'O', in: '09:00', out: '17:45' } } }) {
  const meta = new Map();
  const store = { getMeta: (k) => meta.get(k), setMeta: (k, v) => meta.set(k, v) };
  const ph = { data, meta };
  ph.cloud = createCloud({ store, snapshot: async () => ph.data, fetchImpl: s.fetchImpl });
  return ph;
}

test('recovery codes: 16 unambiguous characters in fours, and forgiving to type', () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.equal(normaliseCode('k7qm 2xrp 9tvd 4hna'), 'K7QM-2XRP-9TVD-4HNA');
  assert.equal(normaliseCode('K7QM-2XRP-9TVD-4HNA'), 'K7QM-2XRP-9TVD-4HNA');
  assert.equal(normaliseCode('O0IL-2XRP-9TVD-4HNA'), '0011-2XRP-9TVD-4HNA', 'O reads as 0, I and L as 1');
  assert.equal(normaliseCode('K7QM-2XRP-9TVD'), null);
  assert.equal(normaliseCode('K7QM-2XRP-9TVD-4HNU'), null, 'U is not in the alphabet');
  const seen = new Set(Array.from({ length: 200 }, newCode));
  assert.equal(seen.size, 200);
});

test('the same code always gives the same id; different codes, different ids', async () => {
  const a = await deriveFromCode('K7QM-2XRP-9TVD-4HNA');
  const b = await deriveFromCode('K7QM-2XRP-9TVD-4HNA');
  const c = await deriveFromCode('K7QM-2XRP-9TVD-4HNB');
  assert.match(a.id, /^[0-9a-f]{64}$/);
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.ok(!a.id.includes('k7qm'), 'the id gives nothing of the code away');
});

test('a backup goes up encrypted: the server holds nothing readable', async () => {
  const s = site();
  const a = phone(s);
  a.cloud.adopt(newCode());
  const st = await a.cloud.flush();
  assert.equal(st.pending, false);
  assert.ok(st.last);
  const [[key, entry]] = [...s.env.BACKUPS.raw];
  assert.match(key, /^b:[0-9a-f]{64}$/);
  assert.ok(!entry.value.includes('2026-10-14') && !entry.value.includes('NSW') && !entry.value.includes('17:45'));
  assert.ok(entry.ttl > 365 * 24 * 3600, 'kept for years, renewed by each backup');
});

test('a new phone restores from the code alone', async () => {
  const s = site();
  const a = phone(s);
  const code = newCode();
  a.cloud.adopt(code);
  await a.cloud.flush();
  const b = phone(s, null);
  const got = await b.cloud.fetchBackup(code.toLowerCase().replace(/-/g, ' '));
  assert.deepEqual(got.data, a.data);
  assert.equal(got.code, code);
  assert.ok(got.rev);
  await assert.rejects(b.cloud.fetchBackup('ZZZZ-ZZZZ-ZZZZ-ZZZZ'), /No backup found/);
  await assert.rejects(b.cloud.fetchBackup('not a code'), /isn't a recovery code/);
});

test('a run of changes is one upload, a few seconds after the last', async () => {
  const s = site();
  const a = phone(s);
  let puts = 0;
  const real = s.fetchImpl;
  a.cloud = createCloud({ store: { getMeta: (k) => a.meta.get(k), setMeta: (k, v) => a.meta.set(k, v) }, snapshot: async () => a.data,
    fetchImpl: async (u, i = {}) => { if (i.method === 'PUT') puts++; return real(u, i); } });
  a.cloud.adopt(newCode());
  await a.cloud.flush();
  puts = 0;
  a.cloud.schedule(); a.cloud.schedule(); a.cloud.schedule();
  assert.equal(puts, 0, 'nothing yet');
  assert.equal(a.cloud.status().pending, true);
  await a.cloud.flush();           // what the timer does
  assert.equal(puts, 1);
});

test('no signal: it waits, then goes when the connection is back', async () => {
  const s = site();
  const a = phone(s);
  a.cloud.adopt(newCode());
  s.net.down = true;
  let st = await a.cloud.flush();
  assert.equal(st.pending, true);
  assert.equal(st.error, 'offline');
  s.net.down = false;
  st = await a.cloud.flush();
  assert.equal(st.pending, false);
  assert.equal(st.error, null);
});

test('a second device on the same code: neither silently overwrites the other', async () => {
  const s = site();
  const a = phone(s);
  const code = newCode();
  a.cloud.adopt(code);
  await a.cloud.flush();
  // b restores, then changes something and backs up
  const b = phone(s, null);
  const got = await b.cloud.fetchBackup(code);
  b.data = { ...got.data, days: { ...got.data.days, '2026-10-15': { code: 'H' } } };
  b.cloud.adopt(code, { rev: got.rev, last: got.updated });
  b.cloud.schedule();
  assert.equal((await b.cloud.flush()).pending, false);
  // a, still on the old revision, tries to back up
  a.cloud.schedule();
  const st = await a.cloud.flush();
  assert.ok(st.conflict, 'a stops and asks');
  assert.ok((await b.cloud.fetchBackup(code)).data.days['2026-10-15'], "b's change is still there");
  // a chooses to keep its own copy
  const forced = await a.cloud.push({ force: true });
  assert.equal(forced.conflict, null);
  assert.equal((await b.cloud.fetchBackup(code)).data.days['2026-10-15'], undefined);
});

test('turning it off removes the cloud copy', async () => {
  const s = site();
  const a = phone(s);
  const code = newCode();
  a.cloud.adopt(code);
  await a.cloud.flush();
  await a.cloud.turnOff();
  assert.equal(s.env.BACKUPS.raw.size, 0);
  assert.equal(a.cloud.status().on, false);
  await assert.rejects(a.cloud.fetchBackup(code), /No backup found/);
});

test('the Worker refuses anything that is not an encrypted backup from this site', async () => {
  const env = { BACKUPS: memoryKV() };
  const id = 'a'.repeat(64);
  const call = (path, init = {}) => handleSync(new Request(`https://site.example${path}`, init), env);
  const put = (body, headers = {}) => call(`/sync/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': 'new', ...headers }, body });
  const good = JSON.stringify({ v: 1, iv: 'aaaa', ct: 'bbbb' });
  assert.equal((await call('/sync/short')).status, 404);
  assert.equal((await call(`/sync/${'G'.repeat(64)}`)).status, 404);
  assert.equal((await call(`/sync/${id}`)).status, 404, 'nothing there yet');
  assert.equal((await put(good, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await put(good, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await put(good, { 'if-match': '' })).status, 428);
  assert.equal((await put('{"days":{"2026-10-14":{"code":"O"}}}')).status, 400, 'plain data is refused');
  assert.equal((await put('not json')).status, 400);
  assert.equal((await put(JSON.stringify({ v: 1, iv: 'a', ct: 'x'.repeat(1024 * 1024 + 1) }))).status, 413);
  const ok = await put(good);
  assert.equal(ok.status, 200);
  assert.equal((await put(good)).status, 409, "'new' when there's already one");
  assert.equal((await call(`/sync/${id}`, { method: 'POST' })).status, 405);
  assert.equal((await handleSync(new Request(`https://site.example/sync/${id}`), {})).status, 503, 'no KV bound: says so');
  const got = await call(`/sync/${id}`);
  assert.equal(got.headers.get('cache-control'), 'no-store');
});
