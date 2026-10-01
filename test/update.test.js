import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdater } from '../public/local/update.js';

/** A browser window, as far as the updater needs one. */
function browser({ latest = { version: '1.17.0', build: 200 }, online = true } = {}) {
  const log = [];
  const session = new Map();
  const caches = new Map([['attendance:https://x/:1.16.0-100', 1], ['someone-else', 1]]);
  const win = {
    log, caches: { keys: async () => [...caches.keys()], delete: async (k) => { log.push(`delete ${k}`); return caches.delete(k); } },
    fetch: async (url, init) => {
      log.push(`fetch ${url.split('?')[0]} ${init?.cache}`);
      if (!online) throw new TypeError('Failed to fetch');
      return { ok: true, json: async () => latest };
    },
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => log.push('unregister') }] } },
    sessionStorage: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, v), removeItem: (k) => session.delete(k) },
    location: { href: 'https://x/?a=1', replace: (u) => log.push(`go ${u.replace(/v=\d+/, 'v=N')}`) },
    _caches: caches,
  };
  return win;
}

test('a newer build on the site is noticed, and asked for past every cache', async () => {
  const win = browser();
  let news;
  const u = createUpdater({ build: 100, version: () => '1.16.0', onNews: (l) => { news = l; }, win });
  const r = await u.check();
  assert.equal(r.state, 'available');
  assert.deepEqual(news, { version: '1.17.0', build: 200 });
  assert.deepEqual(win.log, ['fetch build.json no-store']);
});

test('the same build: nothing to do, and no badge', async () => {
  const win = browser({ latest: { version: '1.16.0', build: 100 } });
  let news = 'unset';
  const u = createUpdater({ build: 100, version: () => '1.16.0', onNews: (l) => { news = l; }, win });
  assert.equal((await u.checkAndApply({ force: true })).state, 'current');
  assert.equal(news, null);
  assert.ok(!win.log.some((l) => l.startsWith('go ')), 'no reload');
});

test('updating drops only this app\'s offline copy, keeps the data, and reloads from the network', async () => {
  const win = browser();
  const u = createUpdater({ build: 100, version: () => '1.16.0', win });
  await u.checkAndApply();
  assert.ok(win.log.includes('unregister'));
  assert.ok(win.log.includes('delete attendance:https://x/:1.16.0-100'));
  assert.ok(win._caches.has('someone-else'), "other apps' caches are left alone");
  assert.equal(win.log.at(-1), 'go https://x/?a=1&v=N');
  assert.equal(u.updatedFrom(), '1.16.0', 'the next page can say what it updated from');
  assert.equal(u.updatedFrom(), null, 'once');
});

test('with no connection nothing is dropped, so the app still runs offline', async () => {
  const win = browser({ online: false });
  const u = createUpdater({ build: 100, version: () => '1.16.0', win });
  assert.equal((await u.checkAndApply({ force: true })).state, 'offline');
  assert.deepEqual(win.log, ['fetch build.json no-store']);
});

test('the button also moves to a different build that is older (a rolled-back release)', async () => {
  const win = browser({ latest: { version: '1.15.0', build: 50 } });
  const u = createUpdater({ build: 100, version: () => '1.16.0', win });
  assert.equal((await u.check()).state, 'current', 'not flagged as an update on its own');
  await u.checkAndApply({ force: true });
  assert.ok(win.log.at(-1).startsWith('go '));
});
