import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS, isSettingKey } from '../public/core/settings.js';

export { DEFAULT_SETTINGS, isSettingKey };

const HERE = dirname(fileURLToPath(import.meta.url));

export function openDb(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS days (
      date    TEXT PRIMARY KEY,   -- YYYY-MM-DD
      code    TEXT NOT NULL,
      in_time TEXT,
      out_time TEXT,
      comment TEXT,
      updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

// Statements are compiled once per connection and reused; a restore can write
// thousands of rows, and preparing each one afresh is most of the cost.
const cache = new WeakMap();
function stmt(db, sql) {
  let byDb = cache.get(db);
  if (!byDb) cache.set(db, (byDb = new Map()));
  let s = byDb.get(sql);
  if (!s) byDb.set(sql, (s = db.prepare(sql)));
  return s;
}

/** Run fn inside one transaction, rolling back if it throws. */
let savepointId = 0;
export function transaction(db, fn) {
  const name = `attendance_${++savepointId}`;
  db.exec(`SAVEPOINT ${name}`);
  try {
    const out = fn();
    db.exec(`RELEASE SAVEPOINT ${name}`);
    return out;
  } catch (e) {
    db.exec(`ROLLBACK TO SAVEPOINT ${name}`);
    db.exec(`RELEASE SAVEPOINT ${name}`);
    throw e;
  }
}

export function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of stmt(db, 'SELECT key, value FROM settings').all()) {
    if (!isSettingKey(r.key)) continue;     // ignore anything an older build left behind
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

/** Store a patch of settings. Callers validate first - see validate.js. */
export function setSettings(db, patch) {
  const s = stmt(db, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (isSettingKey(k)) s.run(k, JSON.stringify(v));
  }
  return getSettings(db);
}

const toRec = (r) => ({ code: r.code, in: r.in_time || null, out: r.out_time || null, comment: r.comment || null });

export function getDays(db, from, to) {
  const out = {};
  for (const r of stmt(db, 'SELECT * FROM days WHERE date >= ? AND date <= ? ORDER BY date').all(from, to)) {
    out[r.date] = toRec(r);
  }
  return out;
}

/** Every stored day, keyed by date. */
export function getAllDays(db) {
  const out = {};
  for (const r of stmt(db, 'SELECT * FROM days ORDER BY date').all()) out[r.date] = toRec(r);
  return out;
}

/** Just the columns the year bookkeeping needs, for every stored day. */
export const getDaySummaries = (db) => stmt(db, 'SELECT date, code, in_time, out_time, comment FROM days').all();

/** Write one day, or delete it when rec is null or has no code. */
export function upsertDay(db, date, rec) {
  if (rec == null || rec.code == null || rec.code === '') {
    stmt(db, 'DELETE FROM days WHERE date = ?').run(date);
    return;
  }
  stmt(db, `
    INSERT INTO days (date, code, in_time, out_time, comment, updated)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      code = excluded.code, in_time = excluded.in_time,
      out_time = excluded.out_time, comment = excluded.comment, updated = excluded.updated
  `).run(date, rec.code, rec.in || null, rec.out || null, rec.comment || null, new Date().toISOString());
}

export const deleteDaysBetween = (db, from, to) => stmt(db, 'DELETE FROM days WHERE date >= ? AND date <= ?').run(from, to);
export const deleteAllDays = (db) => stmt(db, 'DELETE FROM days').run();

/**
 * The database behind the store interface the shared code uses (see
 * public/core/service.js). The standalone app has the same methods over the
 * browser's own storage, so the two can't drift apart.
 */
export function sqliteStore(db) {
  return {
    getSettings: () => getSettings(db),
    setSettings: (patch) => setSettings(db, patch),
    getDays: (from, to) => getDays(db, from, to),
    getAllDays: () => getAllDays(db),
    getDaySummaries: () => getDaySummaries(db),
    upsertDay: (date, rec) => upsertDay(db, date, rec),
    deleteDaysBetween: (from, to) => { deleteDaysBetween(db, from, to); },
    deleteAllDays: () => { deleteAllDays(db); },
    transaction: (fn) => transaction(db, fn),
  };
}

/** One-time import of the FY27 spreadsheet data on an empty database. */
export function seedIfEmpty(db, seedFile = join(HERE, 'seed-fy27.json')) {
  if (stmt(db, "SELECT value FROM meta WHERE key = 'seeded'").get()) return 0;
  const markSeeded = () => stmt(db, "INSERT INTO meta (key, value) VALUES ('seeded', ?)").run(new Date().toISOString());
  if (stmt(db, 'SELECT COUNT(*) AS n FROM days').get().n > 0) { markSeeded(); return 0; }
  let seed;
  try { seed = JSON.parse(readFileSync(seedFile, 'utf8')); } catch { return 0; }
  transaction(db, () => {
    for (const [date, rec] of Object.entries(seed)) upsertDay(db, date, rec);
    markSeeded();
  });
  return Object.keys(seed).length;
}
