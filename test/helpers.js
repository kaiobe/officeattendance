/**
 * Test harness: a real app over a throwaway database, served on a random
 * port, with a clock the test controls.
 */
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, seedIfEmpty } from '../server/db.js';
import { createApp } from '../server/app.js';

/**
 * @param {object} [opts]
 * @param {string} [opts.today]  the date the app believes it is
 * @param {boolean} [opts.seed]  import the FY27 spreadsheet data (default true)
 */
export async function startApp({ today = '2026-09-29', seed = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'attendance-test-'));
  const db = openDb(join(dir, 'a.db'));
  if (seed) seedIfEmpty(db);
  const clock = { today };
  const quiet = { error: () => {} };
  const server = createServer(createApp({ db, today: () => clock.today, log: quiet }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Call the API. Bodies are sent as JSON unless a content type says otherwise. */
  async function call(method, path, body, headers = {}) {
    const opts = { method, headers: { ...headers } };
    if (body !== undefined) {
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (!('content-type' in opts.headers)) opts.headers['content-type'] = 'application/json';
    }
    const res = await fetch(base + path, opts);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, headers: res.headers, text, json };
  }

  return {
    db,
    clock,
    base,
    call,
    get: (path) => call('GET', path),
    put: (path, body) => call('PUT', path, body),
    post: (path, body = {}) => call('POST', path, body),
    state: async (fy) => (await call('GET', `/api/state${fy ? `?fy=${fy}` : ''}`)).json,
    async stop() {
      await new Promise((r) => server.close(r));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
