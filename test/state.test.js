import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { nowHHMM } from '../public/js/format.js';

const flags = new Map(['savedFlag', 'errFlag'].map((id) => [id, {
  textContent: '', classList: { add() {}, remove() {} },
}]));
const originalDocument = globalThis.document;
globalThis.document = { getElementById: (id) => flags.get(id) };
after(() => { globalThis.document = originalDocument; });
let instance = 0;
const fresh = () => import(`../public/js/state.js?test=${++instance}`);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const date = '2026-10-14';
const state = (fy = 27, days = {}) => ({
  fy, today: date, todayInFy: fy === 27, tz: 'Australia/Melbourne', settings: {},
  codes: [], days, summary: {}, lastFy: 28, availableFys: [27, 28],
});

test('rapid code and time edits see pending values and are sent in order', async () => {
  const app = await fresh();
  const gate = deferred();
  const sent = [];
  let stored = { [date]: { code: 'H' } };
  app.runtime.transport = async (method, _path, body) => {
    if (method === 'GET') return state(27, structuredClone(stored));
    sent.push(structuredClone(body.days));
    if (sent.length === 1) await gate.promise;
    stored = { ...stored, ...body.days };
    return { updated: 1 };
  };
  await app.loadState(27);
  const first = app.saveDays({ [date]: { code: 'O' } });
  assert.equal(app.S.days[date].code, 'O');
  const second = app.saveDays({ [date]: { ...app.S.days[date], in: '09:00', out: '15:00' } });
  await tick();
  assert.equal(sent.length, 1, 'second write waits for first');
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(stored[date], { code: 'O', in: '09:00', out: '15:00' });
  assert.deepEqual(app.S.days[date], stored[date]);
});

test('a refresh cannot erase a later edit while its save is pending', async () => {
  const app = await fresh();
  const gate = deferred();
  app.runtime.transport = (method) => method === 'GET' ? state(27, { [date]: { code: 'H' } }) : gate.promise;
  await app.loadState(27);
  const saving = app.saveDays({ [date]: { code: 'O', comment: 'new note' } });
  await app.refresh();
  assert.deepEqual(app.S.days[date], { code: 'O', comment: 'new note' });
  gate.reject(new Error('simulated save refusal'));
  assert.equal(await saving, false);
  assert.equal(app.S.days[date].code, 'H');
});

test('an older year response is ignored even if it arrives before the requested year', async () => {
  const app = await fresh();
  const older = deferred(), newer = deferred();
  app.runtime.transport = (_method, path) => path.endsWith('27') ? older.promise : newer.promise;
  const first = app.loadState(27), second = app.loadState(28);
  older.resolve(state(27));
  assert.equal(await first, false);
  assert.equal(app.S.fy, null);
  newer.resolve(state(28));
  assert.equal(await second, true);
  assert.equal(app.S.fy, 28);
});

test('a successful save followed by a failed refresh is reported as saved', async () => {
  const app = await fresh();
  app.runtime.transport = () => state();
  await app.loadState(27);
  app.runtime.transport = (method) => {
    if (method === 'GET') throw new Error('offline');
    return { updated: 1 };
  };
  assert.equal(await app.saveDays({ [date]: { code: 'O' } }), true);
  assert.match(flags.get('errFlag').textContent, /Saved, but the totals could not refresh/);
  assert.equal(app.S.days[date].code, 'O');
});

test('failed mutations do not block subsequent writes', async () => {
  const app = await fresh();
  let calls = 0;
  app.runtime.transport = () => { if (++calls === 1) throw new Error('refused'); return { ok: true }; };
  const first = app.api('/api/settings', { method: 'PUT', body: '{}' });
  const second = app.api('/api/settings', { method: 'PUT', body: '{}' });
  await assert.rejects(first, /refused/);
  assert.deepEqual(await second, { ok: true });
});

test('punch times use the attendance timezone, including daylight saving', () => {
  assert.equal(nowHHMM('Australia/Melbourne', new Date('2026-10-01T00:00:00Z')), '10:00');
  assert.equal(nowHHMM('Australia/Melbourne', new Date('2026-10-05T00:00:00Z')), '11:00');
  assert.equal(nowHHMM('UTC', new Date('2026-10-05T00:00:00Z')), '00:00');
});
