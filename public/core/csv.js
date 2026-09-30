import { MONTH_NAMES, DAY_NAMES, parseIso, weekdayOf, minutesBetween } from '../lib/dates.js';

/**
 * One cell. Quoted when it holds a comma, quote or line break; and a leading
 * = + - @ is neutralised with an apostrophe, because Excel would otherwise run
 * a comment like =HYPERLINK(...) as a formula when the file is opened.
 */
function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per logged day, in date order. */
export function toCsv(days) {
  const rows = [['date', 'weekday', 'month', 'code', 'in', 'out', 'hours', 'comment']];
  for (const date of Object.keys(days).sort()) {
    const r = days[date];
    const mins = minutesBetween(r.in, r.out);
    rows.push([
      date,
      DAY_NAMES[weekdayOf(date)].slice(0, 3),
      MONTH_NAMES[parseIso(date)[1] - 1],
      r.code,
      r.in || '',
      r.out || '',
      r.in && r.out ? (mins / 60).toFixed(2) : '',
      r.comment || '',
    ]);
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}
