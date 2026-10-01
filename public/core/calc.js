import { CODE_MAP } from './codes.js';
import { MONTH_NAMES, daysInMonth, iso, fyMonths, minutesBetween } from '../lib/dates.js';

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
  // "So far": the days that could have their hours in by now. That's every day
  // before today, and today once it's settled - an office day when both times
  // are in, any other work day straight away. A day still in progress isn't
  // counted, so being at work doesn't read as hours behind.
  let pastOfficeDays = 0, pastTimedOfficeDays = 0, pastWorkDays = 0, pastOfficeMins = 0;
  // Planned: office days still to come (or today, still in progress). Their
  // entered times are the plan; one without both times counts as a standard day.
  let plannedOfficeMins = 0, plannedUntimed = 0;
  let daysWorked = 0, totalWorkDays = 0;
  const byCode = {};
  for (const date of dates) {
    const rec = days[date];
    if (!rec || !rec.code) continue;
    byCode[rec.code] = (byCode[rec.code] || 0) + 1;
    const def = CODE_MAP[rec.code];
    if (!def) continue;
    const mins = def.office ? minutesBetween(rec.in, rec.out) : 0;
    const soFar = !todayStr || date < todayStr || (date === todayStr && (!def.office || mins > 0));
    if (def.workDay) { workDays++; if (soFar) pastWorkDays++; }
    if (def.worked) daysWorked++;
    if (def.keyWork) totalWorkDays++;
    if (def.office) {
      officeDays++;
      if (mins > 0) { officeMins += mins; timedOfficeDays++; }
      if (soFar) { pastOfficeDays++; if (mins > 0) { pastTimedOfficeDays++; pastOfficeMins += mins; } }
      else if (mins > 0 && rec.in && rec.out) plannedOfficeMins += mins;
      else plannedUntimed++;
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
    // Office hours against the target, so far - the number to watch.
    pastWorkDays,
    pastOfficeHrs: round2(pastOfficeMins / 60),
    pastAvailableHrs: round2(pastWorkDays * settings.stdDayHours),
    pastReqHrs: round2(pastWorkDays * settings.stdDayHours * settings.officeReqPct),
    pastGapHrs: round2(pastWorkDays * settings.stdDayHours * settings.officeReqPct - pastOfficeMins / 60),
    pastPctHrs: pastWorkDays ? (pastOfficeMins / 60) / (pastWorkDays * settings.stdDayHours) : null,
    // With plans: everything entered for the period - hours done, plus the
    // hours planned on days still to come - against the target for all its
    // work days. What a month will come to if the plan holds.
    ...withPlans(pastOfficeMins, plannedOfficeMins, plannedUntimed, workDays, pastWorkDays, settings),
  };
}

function withPlans(pastMins, plannedMins, plannedUntimed, workDays, pastWorkDays, settings) {
  const estimated = plannedUntimed * settings.stdDayHours;
  const projOfficeHrs = pastMins / 60 + plannedMins / 60 + estimated;
  const available = workDays * settings.stdDayHours;
  const req = available * settings.officeReqPct;
  return {
    plannedWorkDays: workDays - pastWorkDays,
    plannedOfficeHrs: round2(plannedMins / 60 + estimated),
    plannedUntimedOfficeDays: plannedUntimed,
    projOfficeHrs: round2(projOfficeHrs),
    projReqHrs: round2(req),
    projGapHrs: round2(req - projOfficeHrs),
    projPctHrs: available ? projOfficeHrs / available : null,
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
    ...summarise(mtdDates, days, settings, todayStr),
  };

  return {
    months: months.map(({ dates, ...rest }) => rest),
    total: summarise(all, days, settings, todayStr),
    ytd: summarise(ytdDates, days, settings, todayStr),
    mtd,
    firstDate: all[0],
    lastDate: all[all.length - 1],
  };
}
