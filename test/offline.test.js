import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const builder = fileURLToPath(new URL('../scripts/build-standalone.mjs', import.meta.url));

test('build refuses an unrelated nonempty output directory without deleting any file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'attendance-build-guard-'));
  try {
    writeFileSync(join(dir, 'keep.txt'), 'existing work');
    assert.throws(() => execFileSync(process.execPath, [builder, dir], { stdio: 'pipe' }), /not empty/);
    assert.equal(readFileSync(join(dir, 'keep.txt'), 'utf8'), 'existing work');
    for (const path of ['.', 'public', '.git', 'server']) {
      assert.throws(() => execFileSync(process.execPath, [builder, path], { stdio: 'pipe' }), /Refusing/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a standalone build can be rebuilt and its manifest works under a subdirectory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'attendance-rebuild-'));
  try {
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, [builder, dir], { stdio: 'pipe' });
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.scope, './');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.shortcuts[0].url, './?punch=in');
    for (const icon of manifest.icons) assert.ok(!icon.src.startsWith('/'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('offline worker keeps a complete build, preserves other apps’ caches and serves query URLs offline', async () => {
  const scope = 'https://example.test/attendance/';
  const prefix = `attendance:${scope}:`;
  const handlers = {}, deleted = [], fetched = [], precached = [];
  const cache = {
    addAll: async (files) => { precached.push(...files); },
    match: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      return url === scope ? 'this build’s page' : url === `${scope}app.js` ? 'this build’s code' : undefined;
    },
  };
  const source = readFileSync(new URL('../scripts/service-worker.template.js', import.meta.url), 'utf8')
    .replace('__BUILD_ID__', '"new"').replace('__FILES__', '["./", "app.js"]');
  runInNewContext(source, {
    URL, Request, Response,
    self: { registration: { scope }, clients: { claim() {} }, addEventListener: (event, fn) => { handlers[event] = fn; } },
    caches: {
      open: async (name) => { assert.equal(name, `${prefix}new`); return cache; },
      keys: async () => [`${prefix}old`, `${prefix}new`, 'unrelated-app', 'attendance:https://example.test/other/:old'],
      delete: async (key) => { deleted.push(key); },
    },
    fetch: async (req) => { fetched.push(req.url); throw new Error('offline'); },
  });
  let work;
  handlers.install({ waitUntil: (promise) => { work = promise; } });
  await work;
  assert.deepEqual(precached.map((r) => r.url), [scope, `${scope}app.js`]);
  assert.ok(precached.every((r) => r.cache === 'reload'));
  handlers.activate({ waitUntil: (promise) => { work = promise; } });
  await work;
  assert.deepEqual(deleted, [`${prefix}old`]);
  for (const [url, mode, expected] of [
    [`${scope}?punch=in`, 'navigate', 'this build’s page'],
    [`${scope}app.js`, 'cors', 'this build’s code'],
  ]) {
    handlers.fetch({ request: { method: 'GET', url, mode }, respondWith: (promise) => { work = promise; } });
    assert.equal(await work, expected);
  }
  assert.deepEqual(fetched, [], 'cached code cannot be mixed with a newer network release');
});
