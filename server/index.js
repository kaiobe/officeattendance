import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getSettings, setSettings, getDays, upsertDay, seedIfEmpty, DEFAULT_SETTINGS } from './db.js';
import { buildSummary, fyMonths, daysInMonth, iso, weekdayOf, fyOfDate, MONTH_NAMES } from './calc.js';
import { CODES, VALID } from './codes.js';
import { holidaysBetween, unconfirmedHolidayYears } from './holidays.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, '..', 'public');
const PORT = Number(process.env.PORT || 8080);
const DB_FILE = process.env.DB_FILE || join(HERE, '..', 'data', 'attendance.db');
const TZ = process.env.TZ_NAME || 'Australia/Melbourne';

const db = openDb(DB_FILE);
const seeded = seedIfEmpty(db);
if (seeded) console.log(`Seeded ${seeded} days from the FY27 spreadsheet.`);

const todayStr = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const json = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(s);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 4e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });

const fyBounds = (fy) => {
  const ms = fyMonths(fy);
  const last = ms[11];
  return [iso(ms[0].year, ms[0].month, 1), iso(last.year, last.month, daysInMonth(last.year, last.month))];
};

/**
 * Financial years to offer in the picker: everything with data, the default,
 * the one containing today, and always one year ahead so a new FY can be
 * opened (and so laid down) before it starts.
 */
function availableFys(settings, today, current) {
  const stored = db.prepare('SELECT DISTINCT date FROM days ORDER BY date').all().map((r) => fyOfDate(r.date));
  const set = new Set([...stored, settings.fy, fyOfDate(today), current]);
  set.add(Math.max(...set) + 1);
  return [...set].sort((a, b) => a - b);
}

const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const validTime = (s) => s == null || s === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * Weekends are a fact of the calendar, not something you log, so clearing one
 * restores it to W rather than blanking it. Only weekdays clear to empty.
 */
function clearedValue(date) {
  const wd = weekdayOf(date);
  return (wd === 0 || wd === 6) ? { code: 'W', in: null, out: null, comment: null } : null;
}

function sanitiseRec(rec, date) {
  if (rec == null || rec.code == null || rec.code === '') return clearedValue(date);
  const code = String(rec.code).toUpperCase();
  if (!VALID.has(code)) throw new Error(`unknown code: ${code}`);
  if (!validTime(rec.in) || !validTime(rec.out)) throw new Error('times must be HH:MM');
  return {
    code,
    in: rec.in || null,
    out: rec.out || null,
    comment: rec.comment ? String(rec.comment).slice(0, 500) : null,
  };
}

/**
 * The code a date gets from the calendar alone, before anything is logged.
 * Precedence is weekend > public holiday > non-working day, which is how the
 * original spreadsheet treats them (a Monday public holiday reads PH, not NW).
 */
function skeletonCode(date, settings, holidays) {
  const wd = weekdayOf(date);
  if (wd === 0 || wd === 6) return 'W';
  if (holidays[date]) return 'PH';
  if (settings.nonWorkingWeekday >= 0 && wd === settings.nonWorkingWeekday) return 'NW';
  return null;
}

/** Weekend / public-holiday / non-working-day skeleton for a financial year. */
function calendarSkeleton(fy, settings, overwrite) {
  const [from, to] = fyBounds(fy);
  const existing = getDays(db, from, to);
  const holidays = holidaysBetween(from, to);
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const { year, month } of fyMonths(fy)) {
      for (let d = 1; d <= daysInMonth(year, month); d++) {
        const date = iso(year, month, d);
        const code = skeletonCode(date, settings, holidays);
        if (!code) continue;
        const prev = existing[date];
        if (prev && !overwrite) continue;
        if (prev && prev.code === code) continue;
        upsertDay(db, date, {
          code,
          in: null,
          out: null,
          comment: prev?.comment || (holidays[date] && code === 'PH' ? holidays[date].name : null),
        });
        n++;
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return n;
}

/**
 * A financial year opened for the first time gets its calendar laid down
 * automatically, so FY28 arrives with weekends and public holidays already in
 * place. Recorded in meta so a year emptied on purpose is never refilled.
 */
function autofillIfNew(fy, settings) {
  const key = `autofilled:${fy}`;
  if (db.prepare('SELECT value FROM meta WHERE key = ?').get(key)) return 0;
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(key, new Date().toISOString());
  // Fills blank days only, so a year you've already put a few entries in still
  // gets its weekends and public holidays without any of them being touched.
  return calendarSkeleton(fy, settings, false);
}

function csvFor(fy) {
  const [from, to] = fyBounds(fy);
  const days = getDays(db, from, to);
  const rows = [['date', 'weekday', 'month', 'code', 'in', 'out', 'hours', 'comment']];
  const wdNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const { year, month } of fyMonths(fy)) {
    for (let d = 1; d <= daysInMonth(year, month); d++) {
      const date = iso(year, month, d);
      const r = days[date];
      if (!r) continue;
      let hrs = '';
      if (r.in && r.out) {
        const [ih, im] = r.in.split(':').map(Number);
        const [oh, om] = r.out.split(':').map(Number);
        let mins = oh * 60 + om - (ih * 60 + im);
        if (mins < 0) mins += 1440;
        hrs = (mins / 60).toFixed(2);
      }
      rows.push([date, wdNames[weekdayOf(date)], MONTH_NAMES[month - 1], r.code, r.in || '', r.out || '', hrs, r.comment || '']);
    }
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}

async function serveStatic(req, res, pathname) {
  let rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    if (p === '/api/health') return json(res, 200, { ok: true, today: todayStr(), tz: TZ });

    if (p === '/api/state' && req.method === 'GET') {
      const settings = getSettings(db);
      // Default to the financial year containing today - that's the one you
      // want open when you punch in of a morning.
      const fy = Number(url.searchParams.get('fy')) || fyOfDate(todayStr());
      const [from, to] = fyBounds(fy);
      const autofilled = autofillIfNew(fy, settings);
      const days = getDays(db, from, to);
      const today = todayStr();
      return json(res, 200, {
        fy,
        today,
        todayInFy: today >= from && today <= to,
        settings,
        codes: CODES,
        days,
        summary: buildSummary(fy, days, settings, today),
        autofilled,
        unconfirmedHolidayYears: unconfirmedHolidayYears(from, to),
        availableFys: availableFys(settings, today, fy),
      });
    }

    if (p === '/api/days' && req.method === 'PUT') {
      const body = await readBody(req);
      const entries = Object.entries(body.days || {});
      if (!entries.length) return json(res, 400, { error: 'no days supplied' });
      const clean = [];
      for (const [date, rec] of entries) {
        if (!validDate(date)) return json(res, 400, { error: `bad date: ${date}` });
        clean.push([date, sanitiseRec(rec, date)]);
      }
      db.exec('BEGIN');
      try {
        for (const [date, rec] of clean) upsertDay(db, date, rec);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return json(res, 200, { updated: clean.length });
    }

    if (p === '/api/settings' && req.method === 'PUT') {
      const body = await readBody(req);
      const patch = {};
      for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in body) patch[k] = body[k];
      if ('stdDayHours' in patch) patch.stdDayHours = Math.max(0, Number(patch.stdDayHours) || 0);
      if ('officeReqPct' in patch) patch.officeReqPct = Math.min(1, Math.max(0, Number(patch.officeReqPct) || 0));
      if ('fy' in patch) patch.fy = Math.round(Number(patch.fy));
      if ('nonWorkingWeekday' in patch) patch.nonWorkingWeekday = Math.round(Number(patch.nonWorkingWeekday));
      if (!validTime(patch.defaultIn) || !validTime(patch.defaultOut)) return json(res, 400, { error: 'times must be HH:MM' });
      return json(res, 200, { settings: setSettings(db, patch) });
    }

    if (p === '/api/calendar-skeleton' && req.method === 'POST') {
      const body = await readBody(req);
      const settings = getSettings(db);
      const fy = Number(body.fy) || settings.fy;
      return json(res, 200, { filled: calendarSkeleton(fy, settings, !!body.overwrite) });
    }

    if (p === '/api/export.csv') {
      const fy = Number(url.searchParams.get('fy')) || getSettings(db).fy;
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="attendance-fy${fy}.csv"` });
      return res.end(csvFor(fy));
    }

    if (p === '/api/export.json') {
      const all = db.prepare('SELECT * FROM days ORDER BY date').all();
      const days = {};
      for (const r of all) days[r.date] = { code: r.code, in: r.in_time, out: r.out_time, comment: r.comment };
      res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': `attachment; filename="attendance-backup-${todayStr()}.json"` });
      return res.end(JSON.stringify({ exported: new Date().toISOString(), settings: getSettings(db), days }, null, 2));
    }

    if (p === '/api/import' && req.method === 'POST') {
      const body = await readBody(req);
      const days = body.days || {};
      const clean = [];
      for (const [date, rec] of Object.entries(days)) {
        if (!validDate(date)) continue;
        clean.push([date, sanitiseRec(rec, date)]);
      }
      db.exec('BEGIN');
      try {
        if (body.replace) db.exec('DELETE FROM days');
        for (const [date, rec] of clean) upsertDay(db, date, rec);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      if (body.settings) setSettings(db, body.settings);
      return json(res, 200, { imported: clean.length });
    }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'no such endpoint' });
    return serveStatic(req, res, p);
  } catch (err) {
    console.error(err);
    return json(res, 400, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => console.log(`Office attendance tracker on http://0.0.0.0:${PORT}  (db: ${DB_FILE}, tz: ${TZ})`));
