/**
 * The request handler: a table of routes over the database. Built by
 * createApp so tests can drive it in-process with their own database and
 * their own idea of what day it is.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSettings, setSettings, getDays, getAllDays, upsertDay, deleteAllDays, transaction } from './db.js';
import { buildSummary } from './calc.js';
import { CODES } from './codes.js';
import { unconfirmedHolidayYears } from './holidays.js';
import { versionInfo, VERSION, BUILD } from './version.js';
import { HttpError, send, json, download, readJson, serveStatic } from './http.js';
import { asFy, requireDate, parseDay, parseSettings } from './validate.js';
import { SKELETON_CODES, fyBounds, yearSpan, availableFys, clearedValueFor, layCalendar, needsCalendar } from './calendar.js';
import { toCsv } from './csv.js';
import { addDays, isWeekend } from '../public/lib/dates.js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * @param {object} opts
 * @param {import('node:sqlite').DatabaseSync} opts.db
 * @param {() => string} opts.today  today's date as YYYY-MM-DD, in the app's timezone
 * @param {string} [opts.tz]         reported by /api/health
 */
export function createApp({ db, today, tz = 'Australia/Melbourne', log = console }) {
  /** A financial year from a request: a whole number the app can open, or the default. */
  function fyParam(raw, span, { fallback = span.current, strict = true } = {}) {
    const fy = asFy(raw);
    if (fy == null) {
      if (raw == null || raw === '' || !strict) return fallback;
      throw new HttpError(400, `bad financial year: ${raw}`);
    }
    if (span.openable(fy)) return fy;
    // Past the horizon reads as "the furthest year there is"; before the first
    // year it's a bad link, and opening today's year beats laying down a
    // calendar for one nobody asked for.
    if (!strict) return fy > span.last ? span.last : fallback;
    throw new HttpError(400, `FY${fy} is outside the years this app manages (FY${span.first - 1}-FY${span.last})`);
  }

  /**
   * Store days. Weekends aren't worked, so a Saturday or Sunday is always the
   * calendar's plain W: an edit to one is refused, and a restore puts W back
   * whatever the backup says (strict: false).
   */
  function writeDays(entries, settings, { replace = false, strict = true } = {}) {
    const cleared = clearedValueFor(settings);
    const clean = entries.map(([date, rec]) => {
      const day = parseDay(rec, date, cleared);
      if (!isWeekend(date)) return [date, day];
      const plainW = day.code === 'W' && !day.in && !day.out && !day.comment;
      if (strict && !plainW) throw new HttpError(400, `${date} is a weekend - weekends can't be changed`);
      return [date, cleared(date)];
    });
    transaction(db, () => {
      if (replace) deleteAllDays(db);
      for (const [date, rec] of clean) upsertDay(db, date, rec);
    });
    return clean.length;
  }

  const routes = {
    'GET /api/health': () => ({ ok: true, today: today(), tz, ...versionInfo() }),

    'GET /api/state': ({ url }) => {
      const settings = getSettings(db);
      const now = today();
      const span = yearSpan(db, settings, now);
      // Out-of-range years are clamped rather than refused, so an old bookmark
      // still opens something sensible.
      const fy = fyParam(url.searchParams.get('fy'), span, { strict: false });
      const autofilled = needsCalendar(db, fy) ? layCalendar(db, fy, settings) : 0;
      const [from, to] = fyBounds(fy);
      const days = getDays(db, from, to);
      return {
        fy,
        today: now,
        todayInFy: now >= from && now <= to,
        settings,
        codes: CODES,
        days,
        summary: buildSummary(fy, days, settings, now),
        autofilled,
        lastFy: span.last,
        ...versionInfo(),
        unconfirmedHolidayYears: unconfirmedHolidayYears(from, to),
        availableFys: availableFys(span, fy),
      };
    },

    'PUT /api/days': async ({ req }) => {
      const body = await readJson(req);
      const entries = Object.entries(body.days || {});
      if (!entries.length) throw new HttpError(400, 'no days supplied');
      for (const [date] of entries) requireDate(date);
      return { updated: writeDays(entries, getSettings(db)) };
    },

    'PUT /api/settings': async ({ req }) => {
      const patch = parseSettings(await readJson(req));
      return { settings: setSettings(db, patch) };
    },

    // Take the app one financial year further ahead and lay that year out.
    'POST /api/add-fy': async ({ req }) => {
      await readJson(req);
      const settings = getSettings(db);
      const lastFy = yearSpan(db, settings, today()).last + 1;
      const updated = setSettings(db, { lastFy });
      return { lastFy, filled: layCalendar(db, lastFy, updated) };
    },

    // Fill weekends, public holidays and non-working days by hand - also the
    // way to move non-working days after changing the weekday in Settings.
    'POST /api/calendar-skeleton': async ({ req }) => {
      const body = await readJson(req);
      const settings = getSettings(db);
      const now = today();
      const fy = fyParam(body.fy, yearSpan(db, settings, now));
      return { filled: layCalendar(db, fy, settings, { overwrite: body.overwrite === true, reapplyFrom: now }) };
    },

    /**
     * Wipe what's been entered against still-to-come days: tomorrow through the
     * end of the financial year. Today is left alone - it's usually already
     * logged - and cleared days go back to their calendar code, so the year
     * keeps its shape and only the entries go. Dates come from the server's
     * clock, never the caller's.
     */
    'POST /api/clear-future': async ({ req }) => {
      const body = await readJson(req);
      const settings = getSettings(db);
      const now = today();
      const fy = fyParam(body.fy, yearSpan(db, settings, now));
      const [fyFrom, fyTo] = fyBounds(fy);
      const tomorrow = addDays(now, 1);
      const from = tomorrow > fyFrom ? tomorrow : fyFrom;
      if (from > fyTo) return { cleared: 0, from, to: fyTo };
      const targets = Object.entries(getDays(db, from, fyTo))
        .filter(([, r]) => !SKELETON_CODES.has(r.code))
        .map(([date]) => [date, null]);
      writeDays(targets, settings);
      return { cleared: targets.length, from, to: fyTo };
    },

    'GET /api/export.csv': ({ res, url }) => {
      const now = today();
      const fy = fyParam(url.searchParams.get('fy'), yearSpan(db, getSettings(db), now));
      const [from, to] = fyBounds(fy);
      download(res, 'text/csv; charset=utf-8', `attendance-fy${fy}.csv`, toCsv(getDays(db, from, to)));
    },

    'GET /api/export.json': ({ res }) => {
      const body = { exported: new Date().toISOString(), settings: getSettings(db), days: getAllDays(db) };
      download(res, 'application/json; charset=utf-8', `attendance-backup-${today()}.json`, JSON.stringify(body, null, 2));
    },

    /**
     * Restore a backup. Everything is checked before anything is written, and
     * it all goes in one transaction, so a bad file changes nothing. Days with
     * impossible dates are skipped and counted rather than failing the lot.
     */
    'POST /api/import': async ({ req }) => {
      const body = await readJson(req);
      const settingsPatch = parseSettings(body.settings);
      const all = Object.entries(body.days && typeof body.days === 'object' ? body.days : {});
      const entries = all.filter(([date]) => requireDateOrSkip(date));
      const settings = { ...getSettings(db), ...settingsPatch };
      const imported = writeDays(entries, settings, { replace: body.replace === true, strict: false });
      setSettings(db, settingsPatch);
      return { imported, skipped: all.length - entries.length };
    },
  };

  const allowed = (path) => Object.keys(routes).filter((k) => k.endsWith(` ${path}`)).map((k) => k.split(' ')[0]);

  return async function handle(req, res) {
    try {
      let url;
      try { url = new URL(req.url, 'http://app.local'); } catch { throw new HttpError(400, 'bad request path'); }
      const path = url.pathname;
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      const route = routes[`${method} ${path}`];
      if (route) {
        const out = await route({ req, res, url });
        if (out !== undefined) json(res, 200, out);
        return;
      }
      if (path.startsWith('/api/')) {
        const methods = allowed(path);
        if (methods.length) throw new HttpError(405, `use ${methods.join(' or ')}`);
        throw new HttpError(404, 'no such endpoint');
      }
      if (path === '/' || path === '/index.html') return await sendPage(req, res);
      // /b/<build>/... is the same file as /...: see sendPage.
      const pinned = path.match(/^\/b\/[^/]+(\/.+)$/);
      await serveStatic(req, res, PUBLIC, pinned ? pinned[1] : path);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) log.error(err);
      if (res.headersSent) { res.destroy(); return; }
      json(res, status, { error: status === 500 ? 'internal error - see the server log' : err.message });
    }
  };
}

/**
 * The page, pointing at this build's own copy of the code. A proxy or CDN that
 * caches .js and .css by extension - Nginx Proxy Manager's "Cache assets" does,
 * ignoring the no-store header - would otherwise keep serving the previous
 * release's JavaScript after a redeploy, and no reload could shake it off.
 * Under /b/<version>-<build>/ every deploy's files have addresses no cache
 * has seen, and the modules' relative imports stay inside the same prefix.
 * The page itself is never cached, so it always names the current build.
 */
const BUILD_PREFIX = `/b/${VERSION}-${BUILD ?? 0}`;
async function sendPage(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
  const html = (await readFile(join(PUBLIC, 'index.html'), 'utf8'))
    .replace('href="/styles.css"', `href="${BUILD_PREFIX}/styles.css"`)
    .replace('src="/app.js"', `src="${BUILD_PREFIX}/app.js"`);
  send(res, 200, { 'content-type': 'text/html; charset=utf-8' }, req.method === 'HEAD' ? '' : html);
}

function requireDateOrSkip(date) {
  try { requireDate(date); return true; } catch { return false; }
}
