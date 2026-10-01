/**
 * The calendar side of the data: which financial years exist, how far ahead
 * the app goes, and the weekends / public holidays / non-working days that
 * every year is laid out with before anything is logged.
 */
import { holidaysBetween, publicHolidays, STATES } from './holidays.js';
import { fyOfDate, fyStart, fyEnd, fyMonths, daysInMonth, iso, weekdayOf, isWeekend, isRealDate, datesBetween } from '../lib/dates.js';

/** Codes the calendar lays down by itself; times or custom notes still count as logged. */
export const SKELETON_CODES = new Set(['W', 'NW', 'PH']);

export const fyBounds = (fy) => [fyStart(fy), fyEnd(fy)];

const holidayNames = new Map();
function hasCalendarNote(r) {
  if (!r.comment) return false;
  if (r.code !== 'PH' || !isRealDate(r.date)) return true;
  const year = Number(r.date.slice(0, 4));
  if (!holidayNames.has(year)) {
    const names = new Map();
    for (const state of Object.keys(STATES)) {
      for (const { date, name } of publicHolidays(year, state)) {
        if (!names.has(date)) names.set(date, new Set());
        names.get(date).add(name);
      }
    }
    holidayNames.set(year, names);
  }
  // Holiday names written by the calendar are automatic; any other text is
  // a user's note. Check every state so changing states can move old holidays.
  return !holidayNames.get(year).get(r.date)?.has(r.comment);
}

export const isLoggedDay = (r) => !!(!SKELETON_CODES.has(r.code)
  || r.in_time || r.out_time || r.in || r.out || hasCalendarNote(r));

/**
 * The span of financial years the app works with, worked out afresh on every
 * call rather than stored, so it moves forward with the date on its own:
 *
 *   first - the earliest year with anything logged, or this year if earlier
 *   last  - one year past this one, or further if a year was added by hand
 *           (settings.lastFy) or already holds entries
 *
 * A year can be opened from one before `first` up to `last`. Stepping back a
 * year at a time is how you'd backfill; jumping to FY1 by URL is not, and is
 * refused rather than laying down a calendar nobody asked for.
 */
export function yearSpan(store, settings, today) {
  const current = fyOfDate(today);
  const logged = new Set();
  for (const r of store.getDaySummaries()) {
    if (!isRealDate(r.date)) continue;
    if (isLoggedDay(r)) logged.add(fyOfDate(r.date));
  }
  const manual = Number.isInteger(settings.lastFy) ? settings.lastFy : 0;
  const first = Math.min(current, ...logged);
  const last = Math.max(current + 1, manual, ...logged);
  // The picker lists only years that matter: any with something logged, this
  // one, and those ahead. A past year holding nothing but the calendar isn't
  // listed; it can still be reached a month at a time for backfilling.
  const listedFrom = first;
  return {
    current, first, last, listedFrom,
    openable: (fy) => Number.isInteger(fy) && fy >= Math.min(first - 1, listedFrom) && fy <= last,
  };
}

/** The years to offer in the picker, plus the one open if it's outside them. */
export function availableFys(span, openFy) {
  const out = [];
  for (let fy = Math.min(span.listedFrom, openFy); fy <= span.last; fy++) out.push(fy);
  return out;
}

/**
 * The code a date gets from the calendar alone. Precedence is weekend, then
 * public holiday, then non-working day, as in the original spreadsheet: a
 * Monday public holiday reads PH, not NW.
 */
export function skeletonCode(date, settings, holidays) {
  if (isWeekend(date)) return 'W';
  if (holidays[date]) return 'PH';
  if (settings.nonWorkingWeekday >= 0 && weekdayOf(date) === settings.nonWorkingWeekday) return 'NW';
  return null;
}

function skeletonRecord(date, settings, holidays, keepComment = null) {
  const code = skeletonCode(date, settings, holidays);
  if (!code) return null;
  return { code, in: null, out: null, comment: keepComment || (code === 'PH' ? holidays[date].name : null) };
}

/**
 * What a day goes back to when it's cleared: its calendar code, so clearing
 * never loses the shape of the year - a weekend reads W again, Melbourne Cup
 * reads PH, your non-working day reads NW. An ordinary weekday clears to empty.
 */
export function clearedValueFor(settings) {
  const byYear = new Map();
  const holidaysIn = (year) => {
    if (!byYear.has(year)) byYear.set(year, holidaysBetween(`${year}-01-01`, `${year}-12-31`, settings.holidayState));
    return byYear.get(year);
  };
  return (date) => skeletonRecord(date, settings, holidaysIn(date.slice(0, 4)));
}

/**
 * Lay the calendar down over a financial year. Fills blank days only unless
 * overwrite is set. With reapplyFrom, the calendar's own days from that date
 * on - NW and PH with no times against them - are brought in line with the
 * current settings: a non-working day no longer on your non-working weekday
 * goes, a public holiday of the state you've moved from goes, and the new ones
 * take their place. Earlier days are history and stay; weekends are W either
 * way, and anything you logged is never touched. onlyFrom leaves every
 * earlier day alone entirely, blank ones included.
 */
export function layCalendar(store, fy, settings, { overwrite = false, reapplyFrom = null, onlyFrom = null } = {}) {
  const [from, to] = fyBounds(fy);
  const existing = store.getDays(from, to);
  const holidays = holidaysBetween(from, to, settings.holidayState);
  let changed = 0;
  store.transaction(() => {
    for (const date of datesBetween(from, to)) {
      if (onlyFrom && date < onlyFrom) continue;
      const prev = existing[date];
      const want = skeletonRecord(date, settings, holidays, prev?.code === 'PH' ? null : prev?.comment);
      const ours = prev && (prev.code === 'NW' || prev.code === 'PH') && !isLoggedDay({ date, ...prev });
      const reapply = reapplyFrom && date >= reapplyFrom && ours;
      if (!want) {
        if (reapply) { store.upsertDay(date, null); changed++; }
        continue;
      }
      if (prev && prev.code === want.code && !(reapply && prev.comment !== want.comment)) continue;
      if (prev && !overwrite && !reapply) continue;
      store.upsertDay(date, want);
      changed++;
    }
  });
  return changed;
}

/**
 * Has this year had its calendar laid down? The test is the calendar itself -
 * a year missing any of its weekends hasn't been filled - rather than a stored
 * marker, which could claim "done" for a year that never actually got filled.
 * Weekends can be recoded but never cleared, so once filled this stays settled.
 */
export function needsCalendar(store, fy) {
  const [from, to] = fyBounds(fy);
  const existing = store.getDays(from, to);
  return datesBetween(from, to).some((d) => isWeekend(d) && !existing[d]);
}

/**
 * Remove calendars nobody logged anything in, outside the span of years the
 * app offers - left by an earlier build that went too far ahead, or by opening
 * a year and never using it. Strictly limited to years holding nothing but
 * weekends, public holidays and non-working days with no times against them.
 * Rows with impossible dates, which only an old bug could create, go too.
 */
export function tidyYears(store, span) {
  const byFy = new Map();
  let removed = 0;
  store.transaction(() => {
    for (const r of store.getDaySummaries()) {
      if (!isRealDate(r.date)) {
        if (!isLoggedDay(r)) { store.upsertDay(r.date, null); removed++; }
        continue;
      }
      const fy = fyOfDate(r.date);
      if (!byFy.has(fy)) byFy.set(fy, []);
      byFy.get(fy).push(r);
    }
    for (const [fy, rows] of byFy) {
      if (fy >= span.current - 1 && fy <= span.last) continue;   // this year, last year, and ahead
      if (rows.some(isLoggedDay)) continue;
      const [from, to] = fyBounds(fy);
      store.deleteDaysBetween(from, to);
      removed += rows.length;
    }
  });
  return removed;
}

/**
 * Give public holidays with no note their holiday's name, as the calendar does
 * when it lays a year out. Days that came from the spreadsheet import, or were
 * laid out before names were written, have none. Only a PH day with an empty
 * note that falls on one of the state's holidays is touched; codes, times and
 * anyone's own notes never are. Returns how many were named.
 */
export function nameHolidays(store, settings) {
  const blank = store.getDaySummaries().filter((r) => r.code === 'PH' && !r.comment && isRealDate(r.date));
  if (!blank.length) return 0;
  const dates = blank.map((r) => r.date).sort();
  const holidays = holidaysBetween(dates[0], dates.at(-1), settings.holidayState);
  let named = 0;
  store.transaction(() => {
    for (const r of blank) {
      const h = holidays[r.date];
      if (!h) continue;
      store.upsertDay(r.date, { code: 'PH', in: r.in_time || null, out: r.out_time || null, comment: h.name });
      named++;
    }
  });
  return named;
}

export { fyMonths, daysInMonth, iso };
