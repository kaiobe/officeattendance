import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startApp } from './helpers.js';
import { getSettings, upsertDay } from '../server/db.js';
import { yearSpan, tidyYears } from '../server/calendar.js';

describe('the year span moves with the date', () => {
  let app;
  before(async () => { app = await startApp({ today: '2026-09-29' }); });
  after(() => app.stop());

  test('offers this year and one ahead', async () => {
    const s = await app.state();
    assert.equal(s.fy, 26);
    assert.deepEqual(s.availableFys, [26, 27]);
    assert.equal(s.lastFy, 27);
  });

  test('on 1 October the new year opens, and the next one is offered', async () => {
    app.clock.today = '2026-10-01';
    const s = await app.state();
    assert.equal(s.fy, 27);
    assert.deepEqual(s.availableFys, [26, 27, 28]);
  });

  test('a year later it still opens the current year - "In now" can never land a year back', async () => {
    app.clock.today = '2027-10-01';
    const s = await app.state();
    assert.equal(s.fy, 28);
    assert.equal(s.todayInFy, true);
    assert.deepEqual((await app.state(28)).availableFys.slice(-2), [28, 29]);
  });

  test('Add FY goes one further, and the span keeps it', async () => {
    const r = await app.post('/api/add-fy');
    assert.equal(r.json.lastFy, 30);
    assert.equal((await app.state()).lastFy, 30);
  });
});

describe('years outside the span', () => {
  let app;
  before(async () => { app = await startApp(); });
  after(() => app.stop());

  test('a far-past year by URL opens this year and lays nothing down', async () => {
    await app.state();                    // this year's own calendar goes down on first open
    const s = await app.state(1);
    assert.equal(s.fy, 26);
    assert.equal(s.autofilled, 0);
    assert.deepEqual((await app.state()).availableFys, [26, 27]);
  });

  test('a year past the horizon opens the furthest year', async () => {
    assert.equal((await app.state(40)).fy, 27);
  });

  test('a fractional year is ignored, not turned into impossible dates', async () => {
    const s = await app.state('26.5');
    assert.equal(s.fy, 26);
    assert.ok(Object.keys((await app.get('/api/export.json')).json.days).every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  });

  test('one year back can be opened, for backfilling', async () => {
    assert.equal((await app.state(25)).fy, 25);
  });

  test('filling a year outside the span is refused', async () => {
    const r = await app.post('/api/calendar-skeleton', { fy: 5 });
    assert.equal(r.status, 400);
  });

  test('unused calendars outside the span are tidied away', () => {
    const span = yearSpan(app.db, getSettings(app.db), '2026-09-29');
    upsertDay(app.db, '2030-01-05', { code: 'W' });
    upsertDay(app.db, '2025.5-10-03', { code: 'W' });
    const removed = tidyYears(app.db, span);
    assert.ok(removed >= 2);
  });
});

describe('writing days', () => {
  let app;
  before(async () => { app = await startApp(); });
  after(() => app.stop());

  test('a day saves and reads back', async () => {
    const r = await app.put('/api/days', { days: { '2026-10-07': { code: 'o', in: '08:00', out: '16:45', comment: 'x' } } });
    assert.equal(r.status, 200);
    assert.deepEqual((await app.state(27)).days['2026-10-07'], { code: 'O', in: '08:00', out: '16:45', comment: 'x' });
  });

  for (const [what, days, message] of [
    ['an impossible date', { '2027-02-29': { code: 'O' } }, /bad date/],
    ['a malformed date', { '26-10-21': { code: 'O' } }, /bad date/],
    ['an unknown code', { '2026-10-21': { code: 'ZZ' } }, /unknown code/],
    ['a bad time', { '2026-10-21': { code: 'O', in: '7:30' } }, /HH:MM/],
  ]) {
    test(`${what} is refused`, async () => {
      const r = await app.put('/api/days', { days });
      assert.equal(r.status, 400);
      assert.match(r.json.error, message);
    });
  }

  test('clearing puts the calendar back: weekend W, public holiday PH, non-working day NW, weekday empty', async () => {
    await app.put('/api/days', { days: { '2026-10-10': { code: 'O' }, '2026-11-03': { code: 'L' }, '2026-10-12': { code: 'O' }, '2026-10-14': { code: 'O' } } });
    await app.put('/api/days', { days: { '2026-10-10': null, '2026-11-03': null, '2026-10-12': null, '2026-10-14': null } });
    const { days } = await app.state(27);
    assert.equal(days['2026-10-10'].code, 'W');
    assert.equal(days['2026-11-03'].code, 'PH');
    assert.equal(days['2026-11-03'].comment, 'Melbourne Cup Day');
    assert.equal(days['2026-10-12'].code, 'NW');
    assert.equal(days['2026-10-14'], undefined);
  });

  test('clear future wipes entries from tomorrow and restores the calendar', async () => {
    app.clock.today = '2027-06-15';
    await app.put('/api/days', { days: { '2027-06-14': { code: 'O' }, '2027-06-16': { code: 'O' } } });
    const r = await app.post('/api/clear-future', { fy: 27 });
    assert.equal(r.json.from, '2027-06-16');
    const { days } = await app.state(27);
    assert.equal(days['2027-06-14'].code, 'O');       // King's Birthday, but in the past: left alone
    assert.equal(days['2027-06-16'], undefined);
    assert.equal(days['2027-06-19'].code, 'W');
    app.clock.today = '2026-09-29';
  });
});

describe('settings and restore', () => {
  let app;
  before(async () => { app = await startApp(); });
  after(() => app.stop());

  for (const [what, patch] of [
    ['a standard day that is not a number', { stdDayHours: 'x' }],
    ['a negative standard day', { stdDayHours: -4 }],
    ['a requirement over 100%', { officeReqPct: 1.5 }],
    ['a weekday out of range', { nonWorkingWeekday: 9 }],
    ['a default time that is not HH:MM', { defaultIn: '25:00' }],
  ]) {
    test(`${what} is refused`, async () => {
      const r = await app.put('/api/settings', patch);
      assert.equal(r.status, 400);
    });
  }

  test('built-in object keys are not settings', async () => {
    await app.put('/api/settings', JSON.parse('{"constructor":"x","toString":"y","__proto__":{"fy":"99"}}'));
    const s = (await app.state()).settings;
    assert.deepEqual(Object.keys(s).sort(), ['defaultIn', 'defaultOut', 'lastFy', 'nonWorkingWeekday', 'officeReqPct', 'stdDayHours']);
  });

  test('a backup with bad settings is refused whole - nothing is written', async () => {
    const r = await app.post('/api/import', { days: { '2026-12-01': { code: 'H' } }, settings: { officeReqPct: 'abc' } });
    assert.equal(r.status, 400);
    assert.notEqual((await app.state(27)).days['2026-12-01']?.code, 'H');
  });

  test('a backup restores, skipping impossible dates', async () => {
    const backup = (await app.get('/api/export.json')).json;
    backup.days['2027-02-30'] = { code: 'O' };
    backup.days['2026-12-01'] = { code: 'H' };
    const r = await app.post('/api/import', backup);
    assert.equal(r.status, 200);
    assert.equal(r.json.skipped, 1);
    assert.equal((await app.state(27)).days['2026-12-01'].code, 'H');
  });

  test('changing the non-working weekday and filling moves NW days from today on', async () => {
    const fresh = await startApp({ seed: false, today: '2026-10-14' });
    try {
      await fresh.state(27);                                   // laid out with Monday NW
      await fresh.put('/api/settings', { nonWorkingWeekday: 5 });
      await fresh.post('/api/calendar-skeleton', { fy: 27 });
      const { days } = await fresh.state(27);
      assert.equal(days['2026-10-05'].code, 'NW');             // a past Monday: history, kept
      assert.equal(days['2026-10-19'], undefined);             // a future Monday: no longer NW
      assert.equal(days['2026-10-16'].code, 'NW');             // a future Friday
    } finally { await fresh.stop(); }
  });
});

describe('protocol', () => {
  let app;
  before(async () => { app = await startApp(); });
  after(() => app.stop());

  test('changes must be JSON, so another site cannot post a form at the API', async () => {
    const r = await app.call('POST', '/api/add-fy', '{}', { 'content-type': 'text/plain' });
    assert.equal(r.status, 415);
    assert.equal((await app.state()).lastFy, 27);
  });

  test('a browser-flagged cross-site request is refused', async () => {
    const r = await app.call('POST', '/api/add-fy', {}, { 'sec-fetch-site': 'cross-site' });
    assert.equal(r.status, 403);
  });

  test('a malformed body is a 400', async () => {
    assert.equal((await app.call('PUT', '/api/days', '{not json')).status, 400);
  });

  test('the wrong method is a 405, an unknown endpoint a 404', async () => {
    assert.equal((await app.get('/api/days')).status, 405);
    assert.equal((await app.call('DELETE', '/api/state')).status, 405);
    assert.equal((await app.get('/api/nope')).status, 404);
  });

  test('a request for "//" is refused, and the server stays up', async () => {
    const status = await new Promise((resolve, reject) => {
      const { port } = new URL(app.base);
      const req = request({ host: '127.0.0.1', port, path: '//', method: 'GET' }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 400);
    assert.equal((await app.get('/api/health')).status, 200);
  });

  test('every response carries the security headers and no-store', async () => {
    for (const path of ['/', '/api/health', '/api/export.csv', '/api/nope']) {
      const { headers } = await app.get(path);
      assert.equal(headers.get('x-content-type-options'), 'nosniff', path);
      assert.match(headers.get('content-security-policy'), /frame-ancestors 'none'/, path);
      assert.match(headers.get('cache-control'), /no-store/, path);
    }
  });

  test('static files are served, and nothing outside public/', async () => {
    assert.equal((await app.get('/')).status, 200);
    assert.equal((await app.get('/js/main.js')).status, 200);
    assert.equal((await app.get('/lib/dates.js')).status, 200);
    for (const p of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/server/db.js', '/server/db.js']) {
      assert.equal((await app.get(p)).status, 404, p);
    }
  });
});

describe('CSV export', () => {
  let app;
  before(async () => { app = await startApp(); });
  after(() => app.stop());

  test('defaults to the current year', async () => {
    const r = await app.get('/api/export.csv');
    assert.match(r.headers.get('content-disposition'), /attendance-fy26\.csv/);
  });

  test('a comment that looks like a formula is neutralised', async () => {
    await app.put('/api/days', { days: { '2026-10-07': { code: 'O', comment: '=HYPERLINK("http://x","a")' } } });
    const line = (await app.get('/api/export.csv?fy=27')).text.split('\n').find((l) => l.startsWith('2026-10-07'));
    assert.match(line, /,"'=HYPERLINK\(""http:\/\/x"",""a""\)"$/);
  });

  test('hours to two places, with a shift across midnight counted', async () => {
    await app.put('/api/days', { days: { '2026-10-20': { code: 'O', in: '22:00', out: '06:30' } } });
    const line = (await app.get('/api/export.csv?fy=27')).text.split('\n').find((l) => l.startsWith('2026-10-20'));
    assert.equal(line, '2026-10-20,Tue,October,O,22:00,06:30,8.50,');
  });
});
