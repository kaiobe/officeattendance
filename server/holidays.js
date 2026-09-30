import { iso, weekdayOf, daysInMonth, addDays, isWeekend } from '../public/lib/dates.js';

/**
 * Victorian public holidays.
 *
 * Most are computable from rules that don't change, so this works for any year.
 * The one exception is the Friday before the AFL Grand Final: the Victorian
 * Government sets it each year once the AFL releases its schedule, so it can
 * only come from the confirmed table below. A year that isn't in that table
 * simply has no Grand Final holiday and is reported as unconfirmed rather than
 * guessed at.
 *
 * Source: business.vic.gov.au/business-information/public-holidays
 * Verified against the 2025, 2026, 2027 and 2028 listings.
 */

/** Friday before the AFL Grand Final - announced annually, never inferred. */
export const AFL_GRAND_FINAL_FRIDAY = {
  2025: '2025-09-26',
  2026: '2026-09-25',
  // 2027+: "subject to AFL schedule" - add the date here once Victoria announces it.
};

/** Anonymous Gregorian computus. Returns [month, day] of Easter Sunday. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/** The nth occurrence of a weekday in a month, e.g. 2nd Monday in March. */
export function nthWeekday(year, month, weekday, n) {
  let count = 0;
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = iso(year, month, d);
    if (weekdayOf(date) === weekday) {
      if (++count === n) return date;
    }
  }
  return null;
}

/** Next weekday that isn't already taken by another holiday. */
function nextFreeWeekday(date, taken) {
  let d = addDays(date, 1);
  while (isWeekend(d) || taken.has(d)) d = addDays(d, 1);
  return d;
}

/**
 * Every Victorian public holiday in a calendar year.
 * Returns [{ date, name, substitute }], sorted, plus any unconfirmed entries.
 */
export function vicPublicHolidays(year) {
  const out = [];
  const taken = new Set();
  const add = (date, name, substitute = false) => {
    if (!date) return;
    out.push({ date, name, substitute });
    taken.add(date);
  };

  // Fixed-date holidays that shift to the next free weekday when they land on a weekend.
  const nyd = iso(year, 1, 1);
  add(nyd, "New Year's Day");
  const aus = iso(year, 1, 26);
  add(aus, 'Australia Day');

  add(nthWeekday(year, 3, 1, 2), 'Labour Day');                 // 2nd Monday in March

  const [em, ed] = easterSunday(year);
  const easter = iso(year, em, ed);
  add(addDays(easter, -2), 'Good Friday');
  add(addDays(easter, -1), 'Saturday before Easter Sunday');
  add(easter, 'Easter Sunday');
  add(addDays(easter, 1), 'Easter Monday');

  // ANZAC Day is commemorated on the day it falls - Victoria grants no substitute.
  add(iso(year, 4, 25), 'ANZAC Day');

  add(nthWeekday(year, 6, 1, 2), "King's Birthday");            // 2nd Monday in June

  const afl = AFL_GRAND_FINAL_FRIDAY[year];
  if (afl) add(afl, 'Friday before the AFL Grand Final');

  add(nthWeekday(year, 11, 2, 1), 'Melbourne Cup Day');         // 1st Tuesday in November

  const xmas = iso(year, 12, 25);
  const boxing = iso(year, 12, 26);
  add(xmas, 'Christmas Day');
  add(boxing, 'Boxing Day');

  // Substitutes, in calendar order so Christmas claims the earlier weekday.
  for (const [date, name] of [[nyd, "New Year's Day"], [aus, 'Australia Day'], [xmas, 'Christmas Day'], [boxing, 'Boxing Day']]) {
    if (isWeekend(date)) add(nextFreeWeekday(date, taken), `${name} (substitute)`, true);
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Public holidays falling inside a date range, keyed by date. */
export function holidaysBetween(from, to) {
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  const map = {};
  for (let y = startYear; y <= endYear; y++) {
    for (const h of vicPublicHolidays(y)) {
      if (h.date >= from && h.date <= to) map[h.date] = h;
    }
  }
  return map;
}

/** Calendar years in a range whose AFL Grand Final Friday hasn't been announced. */
export function unconfirmedHolidayYears(from, to) {
  const years = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    if (AFL_GRAND_FINAL_FRIDAY[y]) continue;
    // Only flag it when that year's late-September window actually falls in range.
    if (iso(y, 9, 30) >= from && iso(y, 9, 1) <= to) years.push(y);
  }
  return years;
}
