import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SETTINGS = {
  lastFy: null,           // newest FY the app manages; null = work it out on first run
  stdDayHours: 10.75,     // 43 hr week over 4 days
  officeReqPct: 0.5,      // 50% office requirement
  nonWorkingWeekday: 1,   // 0=Sun ... 1=Mon. -1 = none (5 day week)
  defaultIn: '07:30',
  defaultOut: '17:00',
};

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

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

export function setSettings(db, patch) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    stmt.run(k, JSON.stringify(v));
  }
  return getSettings(db);
}

export function getDays(db, from, to) {
  const rows = db.prepare('SELECT * FROM days WHERE date >= ? AND date <= ? ORDER BY date').all(from, to);
  const out = {};
  for (const r of rows) {
    out[r.date] = { code: r.code, in: r.in_time || null, out: r.out_time || null, comment: r.comment || null };
  }
  return out;
}

export function upsertDay(db, date, rec) {
  if (rec === null || rec.code === null || rec.code === '') {
    db.prepare('DELETE FROM days WHERE date = ?').run(date);
    return;
  }
  db.prepare(`
    INSERT INTO days (date, code, in_time, out_time, comment, updated)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      code = excluded.code, in_time = excluded.in_time,
      out_time = excluded.out_time, comment = excluded.comment, updated = excluded.updated
  `).run(date, rec.code, rec.in || null, rec.out || null, rec.comment || null, new Date().toISOString());
}

/** One-time import of the FY27 spreadsheet data on an empty database. */
export function seedIfEmpty(db) {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get();
  if (done) return false;
  const count = db.prepare('SELECT COUNT(*) AS n FROM days').get().n;
  if (count > 0) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', ?)").run(new Date().toISOString());
    return false;
  }
  let seed;
  try {
    seed = JSON.parse(readFileSync(join(HERE, 'seed-fy27.json'), 'utf8'));
  } catch { return false; }
  const now = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO days (date, code, in_time, out_time, comment, updated) VALUES (?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  for (const [date, rec] of Object.entries(seed)) {
    stmt.run(date, rec.code, rec.in || null, rec.out || null, rec.comment || null, now);
  }
  db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', ?)").run(now);
  db.exec('COMMIT');
  return Object.keys(seed).length;
}
