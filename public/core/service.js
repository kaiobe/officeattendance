/**
 * What the app does with its data, as plain calls: the API without the HTTP.
 *
 * The server wraps this in node:http (server/app.js), over SQLite. The
 * standalone app calls it directly in the browser, over the phone's own
 * storage (public/local/). Both hand it a store with the same methods - see
 * sqliteStore in server/db.js and localStore in public/local/store.js - so
 * there is one copy of every rule, whichever way the app is run.
 *
 * A route receives { query, body } - query as URLSearchParams, body as the
 * already-parsed JSON - and returns an object to send as JSON, or a Download.
 */
import { HttpError } from './errors.js';
import { buildSummary } from './calc.js';
import { CODES } from './codes.js';
import { unconfirmedHolidayYears } from './holidays.js';
import { asFy, requireDate, parseDay, parseSettings } from './validate.js';
import { SKELETON_CODES, fyBounds, yearSpan, availableFys, clearedValueFor, layCalendar, needsCalendar } from './calendar.js';
import { toCsv } from './csv.js';
import { addDays, isWeekend, fyOfDate } from '../lib/dates.js';

/** A file to hand over rather than JSON: the server sends it as an attachment, the phone saves or shares it. */
export class Download {
  constructor(type, filename, body) {
    Object.assign(this, { type, filename, body });
  }
}

/**
 * @param {object} opts
 * @param {object} opts.store          the storage (see the note above)
 * @param {() => string} opts.today    today's date as YYYY-MM-DD, where the user is
 * @param {string} [opts.tz]           reported by /api/health
 * @param {() => object} [opts.versionInfo]  { version, build, buildUtc }
 */
export function createService({ store, today, tz = 'Australia/Melbourne', versionInfo = () => ({}) }) {
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
    store.transaction(() => {
      if (replace) store.deleteAllDays();
      for (const [date, rec] of clean) store.upsertDay(date, rec);
    });
    return clean.length;
  }

  /**
   * After the non-working day or the holiday state changes, move the calendar's
   * own days - NW and PH with no times - to match, from today on, in every
   * year already laid out. Earlier days are history and stay as they were;
   * anything you logged is never touched.
   */
  function relayFromToday(settings) {
    const now = today();
    const span = yearSpan(store, settings, now);
    let moved = 0;
    for (let fy = fyOfDate(now); fy <= span.last; fy++) {
      if (!needsCalendar(store, fy)) moved += layCalendar(store, fy, settings, { reapplyFrom: now, onlyFrom: now });
    }
    return moved;
  }

  const routes = {
    'GET /api/health': () => ({ ok: true, today: today(), tz, ...versionInfo() }),

    'GET /api/state': ({ query }) => {
      const settings = store.getSettings();
      const now = today();
      const span = yearSpan(store, settings, now);
      // Out-of-range years are clamped rather than refused, so an old bookmark
      // still opens something sensible.
      const fy = fyParam(query.get('fy'), span, { strict: false });
      const autofilled = needsCalendar(store, fy) ? layCalendar(store, fy, settings) : 0;
      const [from, to] = fyBounds(fy);
      const days = store.getDays(from, to);
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
        unconfirmedHolidayYears: unconfirmedHolidayYears(from, to, settings.holidayState),
        availableFys: availableFys(span, fy),
      };
    },

    'PUT /api/days': ({ body }) => {
      const entries = Object.entries(body.days || {});
      if (!entries.length) throw new HttpError(400, 'no days supplied');
      for (const [date] of entries) requireDate(date);
      return { updated: writeDays(entries, store.getSettings()) };
    },

    'PUT /api/settings': ({ body }) => {
      const before = store.getSettings();
      const patch = parseSettings(body);
      const settings = store.setSettings(patch);
      const calendarChanged = settings.nonWorkingWeekday !== before.nonWorkingWeekday
        || settings.holidayState !== before.holidayState;
      const moved = calendarChanged ? relayFromToday(settings) : 0;
      return { settings, moved };
    },

    // Take the app one financial year further ahead and lay that year out.
    'POST /api/add-fy': () => {
      const settings = store.getSettings();
      const lastFy = yearSpan(store, settings, today()).last + 1;
      const updated = store.setSettings({ lastFy });
      return { lastFy, filled: layCalendar(store, lastFy, updated) };
    },

    // Fill weekends, public holidays and non-working days by hand.
    'POST /api/calendar-skeleton': ({ body }) => {
      const settings = store.getSettings();
      const now = today();
      const fy = fyParam(body.fy, yearSpan(store, settings, now));
      return { filled: layCalendar(store, fy, settings, { overwrite: body.overwrite === true, reapplyFrom: now }) };
    },

    /**
     * Wipe what's been entered against still-to-come days: tomorrow through the
     * end of the financial year. Today is left alone - it's usually already
     * logged - and cleared days go back to their calendar code, so the year
     * keeps its shape and only the entries go. Dates come from this side's
     * clock, never the caller's.
     */
    'POST /api/clear-future': ({ body }) => {
      const settings = store.getSettings();
      const now = today();
      const fy = fyParam(body.fy, yearSpan(store, settings, now));
      const [fyFrom, fyTo] = fyBounds(fy);
      const tomorrow = addDays(now, 1);
      const from = tomorrow > fyFrom ? tomorrow : fyFrom;
      if (from > fyTo) return { cleared: 0, from, to: fyTo };
      const targets = Object.entries(store.getDays(from, fyTo))
        .filter(([, r]) => !SKELETON_CODES.has(r.code))
        .map(([date]) => [date, null]);
      writeDays(targets, settings);
      return { cleared: targets.length, from, to: fyTo };
    },

    'GET /api/export.csv': ({ query }) => {
      const now = today();
      const fy = fyParam(query.get('fy'), yearSpan(store, store.getSettings(), now));
      const [from, to] = fyBounds(fy);
      return new Download('text/csv; charset=utf-8', `attendance-fy${fy}.csv`, toCsv(store.getDays(from, to)));
    },

    'GET /api/export.json': () => {
      const body = { exported: new Date().toISOString(), settings: store.getSettings(), days: store.getAllDays() };
      return new Download('application/json; charset=utf-8', `attendance-backup-${today()}.json`, JSON.stringify(body, null, 2));
    },

    /**
     * Restore a backup. Everything is checked before anything is written, and
     * it all goes in one transaction, so a bad file changes nothing. Days with
     * impossible dates are skipped and counted rather than failing the lot.
     */
    'POST /api/import': ({ body }) => {
      const settingsPatch = parseSettings(body.settings);
      const all = Object.entries(body.days && typeof body.days === 'object' ? body.days : {});
      const entries = all.filter(([date]) => requireDateOrSkip(date));
      const settings = { ...store.getSettings(), ...settingsPatch };
      const imported = writeDays(entries, settings, { replace: body.replace === true, strict: false });
      store.setSettings(settingsPatch);
      return { imported, skipped: all.length - entries.length };
    },
  };

  return {
    /** The handler for a method and path, or undefined. */
    route: (method, path) => routes[`${method} ${path}`],
    /** Methods a path answers to - for a 405 that says which to use. */
    allowed: (path) => Object.keys(routes).filter((k) => k.endsWith(` ${path}`)).map((k) => k.split(' ')[0]),
  };
}

function requireDateOrSkip(date) {
  try { requireDate(date); return true; } catch { return false; }
}
