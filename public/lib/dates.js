/**
 * Calendar helpers shared by the server and the browser.
 *
 * Everything works on "YYYY-MM-DD" strings and UTC arithmetic, so no local
 * timezone or daylight-saving change can shift a date. The server imports this
 * file straight out of public/, which is what lets the two sides share one
 * copy without a build step.
 *
 * Financial years run October to September and are named for the year they
 * end in: FY27 is 1 Oct 2026 to 30 Sep 2027.
 */

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const parseIso = (s) => s.split('-').map(Number);

export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** True for a date that exists on the calendar - 2027-02-29 and 2026-13-01 do not. */
export function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parseIso(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(s) {
  const [y, m, d] = parseIso(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isWeekend = (s) => { const w = weekdayOf(s); return w === 0 || w === 6; };

export function addDays(s, n) {
  const [y, m, d] = parseIso(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Oct-Dec belong to the financial year that ends the following September. */
export function fyOfDate(s) {
  const [y, m] = parseIso(s);
  return (m >= 10 ? y + 1 : y) - 2000;
}

export const fyStart = (fy) => `${2000 + fy - 1}-10-01`;
export const fyEnd = (fy) => `${2000 + fy}-09-30`;

/** The twelve { year, month } pairs of a financial year, October first. */
export function fyMonths(fy) {
  const startYear = 2000 + fy - 1;
  return Array.from({ length: 12 }, (_, i) => ({
    year: i < 3 ? startYear : startYear + 1,
    month: ((9 + i) % 12) + 1,
  }));
}

/** Every date in an inclusive range, in order. */
export function datesBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Minutes between two "HH:MM" times. An out earlier than the in is read as a shift across midnight. */
export function minutesBetween(inT, outT) {
  if (!isTime(inT) || !isTime(outT)) return 0;
  const [ih, im] = inT.split(':').map(Number);
  const [oh, om] = outT.split(':').map(Number);
  let mins = oh * 60 + om - (ih * 60 + im);
  if (mins < 0) mins += 24 * 60;
  return mins;
}
