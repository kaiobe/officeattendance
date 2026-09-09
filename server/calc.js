import { CODE_MAP } from './codes.js';

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
// 0=Sun..6=Sat
export const weekdayOf = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
export const fyStartYear = (fy) => 2000 + fy - 1;      // FY27 -> Oct 2026
export const fyOfDate = (dateStr) => {
  const [y, m] = dateStr.split('-').map(Number);
  return (m >= 10 ? y + 1 : y) - 2000; // Oct-Dec belong to the following FY
};

/** The 12 (year, month) pairs of a financial year, Oct -> Sep. */
export function fyMonths(fy) {
  const sy = fyStartYear(fy);
  const out = [];
  for (let i = 0; i < 12; i++) {
    const m = ((9 + i) % 12) + 1;
    const y = i < 3 ? sy : sy + 1;
    out.push({ year: y, month: m });
  }
  return out;
}

export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Minutes between two "HH:MM" strings; handles a shift that crosses midnight. */
export function minutesBetween(inT, outT) {
  if (!inT || !outT) return 0;
  const [ih, im] = inT.split(':').map(Number);
  const [oh, om] = outT.split(':').map(Number);
  let mins = oh * 60 + om - (ih * 60 + im);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

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
export function summarise(dates, days, settings) {
  let workDays = 0, officeDays = 0, officeMins = 0, timedOfficeDays = 0;
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
  };
}

/** Full financial-year rollup: per month, plus year to date and full year. */
export function buildSummary(fy, days, settings, todayStr) {
  const months = fyMonths(fy).map(({ year, month }) => {
    const n = daysInMonth(year, month);
    const dates = [];
    for (let d = 1; d <= n; d++) dates.push(iso(year, month, d));
    return { year, month, name: MONTH_NAMES[month - 1], days: n, dates, ...summarise(dates, days, settings) };
  });
  const all = months.flatMap((m) => m.dates);
  const ytdDates = all.filter((d) => d <= todayStr);
  return {
    months: months.map(({ dates, ...rest }) => rest),
    total: summarise(all, days, settings),
    ytd: summarise(ytdDates, days, settings),
    firstDate: all[0],
    lastDate: all[all.length - 1],
  };
}
