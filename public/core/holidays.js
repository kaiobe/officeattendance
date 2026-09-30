import { iso, weekdayOf, daysInMonth, addDays, isWeekend } from '../lib/dates.js';

/**
 * Australian public holidays, for each state and territory.
 *
 * Most are computable from rules that don't change, so this works for any
 * year. The exception is Victoria's Friday before the AFL Grand Final: the
 * Victorian Government sets it each year once the AFL releases its schedule,
 * so it can only come from the confirmed table below. A year that isn't in
 * that table has no Grand Final holiday and is reported as unconfirmed rather
 * than guessed at.
 *
 * Only whole days that fall on a weekday matter to the app - weekends are W
 * whatever happens - so these are left out:
 *   - evening-only holidays: Christmas Eve and New Year's Eve from 6 or 7 pm
 *     in Queensland, South Australia and the Northern Territory
 *   - Tasmania's Easter Tuesday, which covers the state public service only
 *   - regional holidays outside the capital. Where a state's holidays differ by
 *     area, the capital city's are used: Brisbane gets the Royal Queensland
 *     Show, Hobart the Royal Hobart Regatta and Royal Hobart Show (not the
 *     north's Recreation Day), and Melbourne Cup Day is Victoria-wide.
 * A day that's wrong for where you are can be set by hand with the Public
 * holiday code, or cleared.
 *
 * Sources: the Fair Work Ombudsman's 2026 and 2027 national lists, the ACT
 * Government's 2028 list, and business.vic.gov.au for Victoria 2025-2028.
 * test/holidays.test.js checks every state against them.
 */

/** The states and territories, with the capital a regional holiday is taken from. */
export const STATES = Object.freeze({
  ACT: 'Australian Capital Territory',
  NSW: 'New South Wales',
  NT: 'Northern Territory',
  QLD: 'Queensland (Brisbane)',
  SA: 'South Australia',
  TAS: 'Tasmania (Hobart)',
  VIC: 'Victoria',
  WA: 'Western Australia',
});

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

/** The last occurrence of a weekday in a month, e.g. the last Monday in September. */
function lastWeekday(year, month, weekday) {
  for (let d = daysInMonth(year, month); d >= 1; d--) {
    const date = iso(year, month, d);
    if (weekdayOf(date) === weekday) return date;
  }
  return null;
}

/** The first given weekday on or after a date. */
function onOrAfter(date, weekday) {
  let d = date;
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}

/**
 * Royal Queensland Show (Ekka) day, Brisbane: the Wednesday of show week. The
 * show opens on the first Friday in August, or the second if the first falls
 * before the 5th.
 */
function ekkaWednesday(year) {
  let friday = nthWeekday(year, 8, 5, 1);
  if (Number(friday.slice(8)) < 5) friday = addDays(friday, 7);
  return addDays(friday, 5);
}

/** Royal Hobart Show day: the Thursday before the fourth Saturday in October. */
const hobartShowThursday = (year) => addDays(nthWeekday(year, 10, 6, 4), -2);

/**
 * When ANZAC Day falls on a weekend, some places add or move a day to the
 * Monday: on a Saturday or Sunday in NSW, the ACT and WA; on a Sunday only in
 * Queensland and the Northern Territory. Victoria, SA and Tasmania keep it
 * on the day.
 */
const ANZAC_MONDAY = { NSW: [6, 0], ACT: [6, 0], WA: [6, 0], QLD: [0], NT: [0], VIC: [], SA: [], TAS: [] };

const MON = 1, TUE = 2, WED = 3;

/**
 * Every public holiday in a calendar year for a state or territory.
 * Returns [{ date, name, substitute }], sorted by date.
 */
export function publicHolidays(year, state = 'VIC') {
  if (!Object.hasOwn(STATES, state)) throw new Error(`unknown state: ${state}`);
  const out = [];
  const taken = new Set();
  const add = (date, name, substitute = false) => {
    if (!date) return;
    out.push({ date, name, substitute });
    taken.add(date);
  };
  const nth = (month, weekday, n) => nthWeekday(year, month, weekday, n);

  // Fixed-date holidays that move to the next free weekday when they land on a weekend.
  const nyd = iso(year, 1, 1);
  const aus = iso(year, 1, 26);
  const anzac = iso(year, 4, 25);
  const xmas = iso(year, 12, 25);
  const boxing = iso(year, 12, 26);
  add(nyd, "New Year's Day");
  add(aus, 'Australia Day');

  const [em, ed] = easterSunday(year);
  const easter = iso(year, em, ed);
  add(addDays(easter, -2), 'Good Friday');
  if (!['TAS', 'WA'].includes(state)) add(addDays(easter, -1), state === 'VIC' ? 'Saturday before Easter Sunday' : 'Easter Saturday');
  if (state !== 'TAS') add(easter, 'Easter Sunday');
  add(addDays(easter, 1), 'Easter Monday');

  add(anzac, 'ANZAC Day');

  const kings = { QLD: nth(10, MON, 1), WA: lastWeekday(year, 9, MON) }[state] ?? nth(6, MON, 2);
  add(kings, "King's Birthday");

  switch (state) {
    case 'ACT':
      add(nth(3, MON, 2), 'Canberra Day');
      add(onOrAfter(iso(year, 5, 27), MON), 'Reconciliation Day');
      add(nth(10, MON, 1), 'Labour Day');
      break;
    case 'NSW':
      add(nth(10, MON, 1), 'Labour Day');
      break;
    case 'NT':
      add(nth(5, MON, 1), 'May Day');
      add(nth(8, MON, 1), 'Picnic Day');
      break;
    case 'QLD':
      add(nth(5, MON, 1), 'Labour Day');
      add(ekkaWednesday(year), 'Royal Queensland Show (Brisbane)');
      break;
    case 'SA':
      add(nth(3, MON, 2), 'Adelaide Cup Day');
      add(nth(10, MON, 1), 'Labour Day');
      break;
    case 'TAS':
      add(nth(2, MON, 2), 'Royal Hobart Regatta (Hobart)');
      add(nth(3, MON, 2), 'Eight Hours Day');
      add(hobartShowThursday(year), 'Royal Hobart Show (Hobart)');
      break;
    case 'VIC': {
      add(nth(3, MON, 2), 'Labour Day');
      const afl = AFL_GRAND_FINAL_FRIDAY[year];
      if (afl) add(afl, 'Friday before the AFL Grand Final');
      add(nth(11, TUE, 1), 'Melbourne Cup Day');
      break;
    }
    case 'WA':
      add(nth(3, MON, 1), 'Labour Day');
      add(nth(6, MON, 1), 'Western Australia Day');
      break;
  }

  add(xmas, 'Christmas Day');
  add(boxing, state === 'SA' ? 'Proclamation Day' : 'Boxing Day');

  // Substitutes, in calendar order so Christmas claims the earlier weekday.
  const subs = [[nyd, "New Year's Day"], [aus, 'Australia Day']];
  if (ANZAC_MONDAY[state].includes(weekdayOf(anzac))) subs.push([anzac, 'ANZAC Day']);
  subs.push([xmas, 'Christmas Day'], [boxing, state === 'SA' ? 'Proclamation Day' : 'Boxing Day']);
  for (const [date, name] of subs) {
    if (isWeekend(date)) add(nextFreeWeekday(date, taken), `${name} (substitute)`, true);
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Victoria's holidays: the original, kept for the Victorian tests and callers. */
export const vicPublicHolidays = (year) => publicHolidays(year, 'VIC');

/** Public holidays falling inside a date range, keyed by date. */
export function holidaysBetween(from, to, state = 'VIC') {
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  const map = {};
  for (let y = startYear; y <= endYear; y++) {
    for (const h of publicHolidays(y, state)) {
      if (h.date >= from && h.date <= to) map[h.date] = h;
    }
  }
  return map;
}

/** Calendar years in a range whose AFL Grand Final Friday hasn't been announced - Victoria only. */
export function unconfirmedHolidayYears(from, to, state = 'VIC') {
  const years = [];
  if (state !== 'VIC') return years;
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    if (AFL_GRAND_FINAL_FRIDAY[y]) continue;
    // Only flag it when that year's late-September window actually falls in range.
    if (iso(y, 9, 30) >= from && iso(y, 9, 1) <= to) years.push(y);
  }
  return years;
}
