import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localStore } from '../public/local/store.js';
import { createService, Download } from '../public/core/service.js';
import { NEW_PHONE_SETTINGS } from '../public/local/defaults.js';
import { normaliseTime } from '../public/js/timefield.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A stand-in for window.localStorage. */
function memoryStorage({ failWrites = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failWrites) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    raw: m,
  };
}

const NEW_PHONE = { ...NEW_PHONE_SETTINGS, holidayState: 'NSW' };

function phone(storage = memoryStorage(), today = '2026-10-14') {
  const store = localStore({ storage, defaults: NEW_PHONE });
  const service = createService({ store, today: () => today, versionInfo: () => ({ version: 'test' }) });
  const call = (method, path, body = {}) => {
    const url = new URL(path, 'http://local');
    return service.route(method, url.pathname)({ query: url.searchParams, body });
  };
  return { store, call, storage };
}

test('the shared service runs over phone storage: state, holidays for the chosen state, saving', () => {
  const { call, storage } = phone();
  const s = call('GET', '/api/state?fy=27');
  assert.equal(s.fy, 27);
  assert.equal(s.settings.holidayState, 'NSW');
  // a new phone: 8.75 h days, 09:00 to 17:45
  assert.equal(s.settings.stdDayHours, 8.75);
  assert.equal(s.settings.defaultIn, '09:00');
  assert.equal(s.settings.defaultOut, '17:45');
  assert.equal(s.days['2026-10-05'].code, 'PH');        // NSW Labour Day
  assert.equal(s.days['2026-11-03'], undefined);        // no Melbourne Cup
  assert.equal(s.days['2026-10-12'], undefined);        // no NW on a 5-day week
  call('PUT', '/api/days', { days: { '2026-10-14': { code: 'O', in: '09:00', out: '17:00' } } });
  // a second store over the same storage - a reload - sees it
  const reloaded = localStore({ storage, defaults: NEW_PHONE });
  assert.deepEqual(reloaded.getDays('2026-10-14', '2026-10-14')['2026-10-14'], { code: 'O', in: '09:00', out: '17:00', comment: null });
});

test('a refused change leaves the phone exactly as it was', () => {
  const { call, storage } = phone();
  call('GET', '/api/state?fy=27');
  const before = storage.raw.get('office-attendance');
  assert.throws(() => call('PUT', '/api/days', { days: { '2026-10-15': { code: 'L' }, '2026-10-17': { code: 'O' } } }), /weekend/);
  assert.equal(storage.raw.get('office-attendance'), before);
});

test('a write the browser refuses rolls back the copy in memory too', () => {
  const storage = memoryStorage();
  const { store } = phone(storage);
  store.upsertDay('2026-10-14', { code: 'H' });
  const full = memoryStorage({ failWrites: true });
  full.raw.set('office-attendance', storage.raw.get('office-attendance'));
  const s2 = localStore({ storage: full });
  assert.throws(() => s2.transaction(() => s2.upsertDay('2026-10-15', { code: 'O' })), /couldn't save on this device/);
  assert.equal(s2.getDays('2026-10-15', '2026-10-15')['2026-10-15'], undefined);
  assert.equal(s2.getDays('2026-10-14', '2026-10-14')['2026-10-14'].code, 'H');
});

test('exports come back as files, and a backup restores onto another phone', () => {
  const a = phone();
  a.call('GET', '/api/state?fy=27');
  a.call('PUT', '/api/days', { days: { '2026-10-14': { code: 'O', in: '09:00', out: '17:00' } } });
  const csv = a.call('GET', '/api/export.csv?fy=27');
  assert.ok(csv instanceof Download);
  assert.equal(csv.filename, 'attendance-fy27.csv');
  assert.match(csv.body, /2026-10-14,Wed,October,O,09:00,17:00/);
  const backup = JSON.parse(a.call('GET', '/api/export.json').body);
  const b = phone();
  const r = b.call('POST', '/api/import', { days: backup.days, settings: backup.settings });
  assert.ok(r.imported > 100);                          // the open year's calendar and the logged day
  assert.equal(b.call('GET', '/api/state?fy=27').days['2026-10-14'].code, 'O');
  assert.equal(b.store.getSettings().holidayState, 'NSW');
});

test('storage that holds rubbish starts afresh rather than failing', () => {
  const storage = memoryStorage();
  storage.raw.set('office-attendance', '{not json');
  const { call } = phone(storage);
  assert.equal(call('GET', '/api/state').settings.holidayState, 'NSW');
});

test('hasEntries: the calendar alone is not an entry', () => {
  const { store, call } = phone();
  call('GET', '/api/state?fy=27');
  assert.equal(store.hasEntries(), false);
  call('PUT', '/api/days', { days: { '2026-10-14': { code: 'H' } } });
  assert.equal(store.hasEntries(), true);
});

test('the build: a static site that starts in the browser, works offline and sends the same headers', () => {
  const out = mkdtempSync(join(tmpdir(), 'attendance-dist-'));
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/build-standalone.mjs'), out], { stdio: 'pipe' });
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.match(html, /<script src="standalone.js" type="module">/);
    assert.doesNotMatch(html, /src="\/app\.js"/);
    assert.doesNotMatch(html, /use-credentials"/);
    assert.match(readFileSync(join(out, 'local/install.js'), 'utf8'), /const BUILD = \d{13};/);
    const sw = readFileSync(join(out, 'sw.js'), 'utf8');
    for (const f of ['./', 'standalone.js', 'app.js', 'core/service.js', 'local/store.js', 'js/main.js', 'lib/dates.js', 'styles.css', 'manifest.webmanifest']) {
      assert.ok(sw.includes(`"${f}"`), `sw.js caches ${f}`);
    }
    const headers = readFileSync(join(out, '_headers'), 'utf8');
    assert.match(headers, /Content-Security-Policy: default-src 'self'/);
    assert.match(headers, /\/sw\.js\n\s+Cache-Control: no-cache/);
    assert.ok(!existsSync(join(out, 'seed-fy27.json')), 'no one else gets your data');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the Cloudflare config publishes the build output as a static site', () => {
  const src = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const cfg = JSON.parse(src);
  assert.equal(cfg.name, 'officeattendance');
  assert.equal(cfg.assets.directory, './dist');
  assert.equal(cfg.main, undefined, 'no Worker script: static files only');
  assert.match(cfg.compatibility_date, /^\d{4}-\d\d-\d\d$/);
});

test('time boxes are 24-hour: however a time is typed, it becomes HH:MM', () => {
  const cases = {
    '09:30': '09:30', '9:30': '09:30', '930': '09:30', '0930': '09:30', '9.30': '09:30', '9': '09:00',
    '17:45': '17:45', '1745': '17:45', '17.45': '17:45', ' 17:45 ': '17:45', '0:05': '00:05', '23:59': '23:59',
    '5:45pm': '17:45', '5:45 PM': '17:45', '9am': '09:00', '12pm': '12:00', '12am': '00:00', '12:30am': '00:30',
    '': '', '   ': '',
  };
  for (const [typed, want] of Object.entries(cases)) assert.equal(normaliseTime(typed), want, JSON.stringify(typed));
  for (const bad of ['24:00', '9:60', '25', '12345', 'abc', '13pm', '0am', '9:3:0', '-1']) {
    assert.equal(normaliseTime(bad), null, JSON.stringify(bad));
  }
});
