/**
 * The calendar side of the data: which financial years exist, how far ahead
 * the app goes, and the weekends / public holidays / non-working days that
 * every year is laid out with before anything is logged.
 */
import { getDays, getDaySummaries, upsertDay, deleteDaysBetween, transaction } from './db.js';
import { holidaysBetween } from './holidays.js';
import { fyOfDate, fyStart, fyEnd, fyMonths, daysInMonth, iso, weekdayOf, isWeekend, isRealDate, datesBetween } from '../public/lib/dates.js';

/** Codes the calendar lays down by itself. A year holding only these has nothing logged in it. */
export const SKELETON_CODES = new Set(['W', 'NW', 'PH']);

export const fyBounds = (fy) => [fyStart(fy), fyEnd(fy)];

const isLogged = (r) => !SKELETON_CODES.has(r.code) || r.in_time || r.out_time;

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
export function yearSpan(db, settings, today) {
  const current = fyOfDate(today);
  const logged = new Set();
  for (const r of getDaySummaries(db)) {
    if (!isRealDate(r.date)) continue;
    if (isLogged(r)) logged.add(fyOfDate(r.date));
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
    if (!byYear.has(year)) byYear.set(year, holidaysBetween(`${year}-01-01`, `${year}-12-31`));
    return byYear.get(year);
  };
  return (date) => skeletonRecord(date, settings, holidaysIn(date.slice(0, 4)));
}

/**
 * Lay the calendar down over a financial year. Fills blank days only unless
 * overwrite is set. With reapplyFrom, a non-working day left on a weekday that
 * is no longer your non-working one - because the setting changed - goes back
 * to blank from that date on; earlier ones are history and stay.
 */
export function layCalendar(db, fy, settings, { overwrite = false, reapplyFrom = null } = {}) {
  const [from, to] = fyBounds(fy);
  const existing = getDays(db, from, to);
  const holidays = holidaysBetween(from, to);
  let changed = 0;
  transaction(db, () => {
    for (const date of datesBetween(from, to)) {
      const prev = existing[date];
      const want = skeletonRecord(date, settings, holidays, prev?.comment);
      if (!want) {
        const stale = reapplyFrom && date >= reapplyFrom && prev?.code === 'NW' && !prev.in && !prev.out;
        if (stale) { upsertDay(db, date, null); changed++; }
        continue;
      }
      if (prev && !overwrite) continue;
      if (prev && prev.code === want.code) continue;
      upsertDay(db, date, want);
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
export function needsCalendar(db, fy) {
  const [from, to] = fyBounds(fy);
  const existing = getDays(db, from, to);
  return datesBetween(from, to).some((d) => isWeekend(d) && !existing[d]);
}

/**
 * Remove calendars nobody logged anything in, outside the span of years the
 * app offers - left by an earlier build that went too far ahead, or by opening
 * a year and never using it. Strictly limited to years holding nothing but
 * weekends, public holidays and non-working days with no times against them.
 * Rows with impossible dates, which only an old bug could create, go too.
 */
export function tidyYears(db, span) {
  const byFy = new Map();
  let removed = 0;
  transaction(db, () => {
    for (const r of getDaySummaries(db)) {
      if (!isRealDate(r.date)) {
        if (!isLogged(r)) { upsertDay(db, r.date, null); removed++; }
        continue;
      }
      const fy = fyOfDate(r.date);
      if (!byFy.has(fy)) byFy.set(fy, []);
      byFy.get(fy).push(r);
    }
    for (const [fy, rows] of byFy) {
      if (fy >= span.current - 1 && fy <= span.last) continue;   // this year, last year, and ahead
      if (rows.some(isLogged)) continue;
      const [from, to] = fyBounds(fy);
      deleteDaysBetween(db, from, to);
      removed += rows.length;
    }
  });
  return removed;
}

export { fyMonths, daysInMonth, iso };
