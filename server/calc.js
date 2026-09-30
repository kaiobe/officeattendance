import { CODE_MAP } from './codes.js';
import { MONTH_NAMES, daysInMonth, iso, fyMonths, minutesBetween } from '../public/lib/dates.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Roll up one month. Mirrors the FY27 workbook exactly.
 *
 * The monthly row (drives the requirement):
 *   WORK DAYS = days coded O or H — working sick is excluded, as in the row formula
 *   OFFICE DAYS = days coded O
 *   REQ DAYS = WORK DAYS * officeReqPct
 *   GAP = REQ - OFFICE   (positive = short of requirement)
 *   AVAILABLE HRS = WORK DAYS * stdDayHours
 *   OFFICE HRS = sum of (OUT - IN) on office days
 *
 * The key totals (a separate count, as in the workbook's key panel):
 *   DAYS WORKED = O + H + WS
 *   TOTAL WORK DAYS = everything except public holidays, non-working days and weekends
 */
export function summarise(dates, days, settings, todayStr = null) {
  let workDays = 0, officeDays = 0, officeMins = 0, timedOfficeDays = 0;
  let pastOfficeDays = 0, pastTimedOfficeDays = 0;   // up to today: the days that could have times by now
  let daysWorked = 0, totalWorkDays = 0;
  const byCode = {};
  for (const date of dates) {
    const rec = days[date];
    if (!rec || !rec.code) continue;
    byCode[rec.code] = (byCode[rec.code] || 0) + 1;
    const def = CODE_MAP[rec.code];
    if (!def) continue;
    if (def.workDay) workDays++;
    if (def.worked) daysWorked++;
    if (def.keyWork) totalWorkDays++;
    if (def.office) {
      officeDays++;
      const mins = minutesBetween(rec.in, rec.out);
      if (mins > 0) { officeMins += mins; timedOfficeDays++; }
      if (!todayStr || date <= todayStr) { pastOfficeDays++; if (mins > 0) pastTimedOfficeDays++; }
    }
  }
  const officeHrs = officeMins / 60;
  const availableHrs = workDays * settings.stdDayHours;
  const reqDays = workDays * settings.officeReqPct;
  const reqHrs = availableHrs * settings.officeReqPct;
  return {
    byCode,
    workDays,
    daysWorked,
    totalWorkDays,
    officeDays,
    homeDays: byCode.H || 0,
    workingSickDays: byCode.WS || 0,
    pctDays: workDays ? officeDays / workDays : null,
    reqDays: round2(reqDays),
    gapDays: round2(reqDays - officeDays),
    officeHrs: round2(officeHrs),
    availableHrs: round2(availableHrs),
    pctHrs: availableHrs ? officeHrs / availableHrs : null,
    reqHrs: round2(reqHrs),
    gapHrs: round2(reqHrs - officeHrs),
    avgHrsPerOfficeDay: timedOfficeDays ? round2(officeHrs / timedOfficeDays) : null,
    timedOfficeDays,
    untimedOfficeDays: officeDays - timedOfficeDays,
    pastOfficeDays,
    pastTimedOfficeDays,
    untimedPastOfficeDays: pastOfficeDays - pastTimedOfficeDays,
  };
}

/** Full financial-year rollup: per month, plus year to date and full year. */
export function buildSummary(fy, days, settings, todayStr) {
  const months = fyMonths(fy).map(({ year, month }) => {
    const n = daysInMonth(year, month);
    const dates = [];
    for (let d = 1; d <= n; d++) dates.push(iso(year, month, d));
    return { year, month, name: MONTH_NAMES[month - 1], days: n, dates, ...summarise(dates, days, settings, todayStr) };
  });
  const all = months.flatMap((m) => m.dates);
  const ytdDates = all.filter((d) => d <= todayStr);

  // Month to date. For the financial year containing today that's the current
  // month up to today; for a year already finished it's that year's last month,
  // and for one not yet started, its first.
  const containsToday = todayStr >= all[0] && todayStr <= all[all.length - 1];
  const idx = containsToday ? months.findIndex((m) => m.dates.includes(todayStr))
    : todayStr > all[all.length - 1] ? 11
    : 0;
  const src = months[idx];
  const mtdDates = containsToday ? src.dates.filter((d) => d <= todayStr) : src.dates;
  const mtd = {
    year: src.year,
    month: src.month,
    name: src.name,
    monthIndex: idx,
    partial: containsToday,
    through: mtdDates[mtdDates.length - 1],
    ...summarise(mtdDates, days, settings),
  };

  return {
    months: months.map(({ dates, ...rest }) => rest),
    total: summarise(all, days, settings, todayStr),
    ytd: summarise(ytdDates, days, settings),
    mtd,
    firstDate: all[0],
    lastDate: all[all.length - 1],
  };
}
