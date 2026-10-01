import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../public/core/service.js';
import { localStore } from '../public/local/store.js';
import { openDb, sqliteStore } from '../server/db.js';

const factories = {
  SQLite(t) { const db = openDb(':memory:'); t.after(() => db.close()); return sqliteStore(db); },
  browser() {
    let raw = null;
    return localStore({ storage: { getItem: () => raw, setItem: (_key, value) => { raw = value; } } });
  },
};

for (const [name, factory] of Object.entries(factories)) {
  test(`${name}: malformed records and restore containers cannot clear existing attendance`, (t) => {
    const store = factory(t);
    const service = createService({ store, today: () => '2026-10-14' });
    const call = (method, path, body) => service.route(method, path)({ body });
    store.upsertDay('2026-10-14', { code: 'O', in: '09:00', out: '17:00' });
    const original = store.getAllDays();
    for (const rec of [1, false, 'O', [], {}, { in: '09:00' }, { code: ['O'] }, { code: 'O', comment: {} }]) {
      assert.throws(() => call('PUT', '/api/days', { days: { '2026-10-14': rec } }), { status: 400 });
      assert.deepEqual(store.getAllDays(), original);
    }
    for (const days of [undefined, null, 1, false, [], 'oops']) {
      assert.throws(() => call('POST', '/api/import', { days, replace: true }), { status: 400 });
      assert.deepEqual(store.getAllDays(), original);
    }
    for (const value of [true, false, [], [8], {}, null, '  ']) {
      for (const key of ['stdDayHours', 'officeReqPct', 'nonWorkingWeekday']) {
        assert.throws(() => call('PUT', '/api/settings', { [key]: value }), { status: 400 });
      }
    }
  });

  test(`${name}: restore rolls back days and settings together after a storage failure`, (t) => {
    const store = factory(t);
    store.upsertDay('2026-10-14', { code: 'H' });
    const days = store.getAllDays(), settings = store.getSettings();
    const setSettings = store.setSettings.bind(store);
    store.setSettings = (patch) => { setSettings(patch); throw new Error('simulated storage failure'); };
    const service = createService({ store, today: () => '2026-10-14' });
    assert.throws(() => service.route('POST', '/api/import')({ body: {
      replace: true, settings: { stdDayHours: 8 }, days: { '2026-10-15': { code: 'O' } },
    } }), /simulated storage failure/);
    assert.deepEqual(store.getAllDays(), days);
    assert.deepEqual(store.getSettings(), settings);
  });

  test(`${name}: changing the working pattern rolls back the calendar and settings together`, (t) => {
    const store = factory(t);
    const service = createService({ store, today: () => '2026-10-14' });
    service.route('GET', '/api/state')({ query: new URLSearchParams('fy=27') });
    const days = store.getAllDays(), settings = store.getSettings();
    const upsert = store.upsertDay.bind(store);
    store.upsertDay = (date, rec) => { upsert(date, rec); throw new Error('calendar write failed'); };
    assert.throws(() => service.route('PUT', '/api/settings')({ body: { nonWorkingWeekday: 2 } }), /calendar write failed/);
    assert.deepEqual(store.getAllDays(), days);
    assert.deepEqual(store.getSettings(), settings);
  });
}
