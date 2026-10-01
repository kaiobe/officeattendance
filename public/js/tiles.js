/** The banner: office days, office hours against the target, and day length, for the chosen period. */
import { S } from './state.js';
import { $, longDate } from './format.js';
import { daysStat, hoursStat, dayLengthStat } from './stat.js';
import { pad, DAY_NAMES, MONTH_SHORT, parseIso, weekdayOf } from '../lib/dates.js';

/** The month the Month view opens on: the current one, else the last with any data. */
function defaultMonthIdx() {
  const ms = S.summary.months;
  if (S.todayInFy) {
    const i = ms.findIndex((m) => `${m.year}-${pad(m.month)}` === S.today.slice(0, 7));
    if (i >= 0) return i;
  }
  for (let i = ms.length - 1; i >= 0; i--) if (ms[i].workDays > 0) return i;
  return 0;
}

function periodStats() {
  if (S.period === 'month') {
    if (S.monthIdx == null) S.monthIdx = defaultMonthIdx();
    return S.summary.months[S.monthIdx];
  }
  if (S.period === 'mtd') return S.summary.mtd;
  return S.summary[S.period === 'ytd' ? 'ytd' : 'total'];
}

export function renderTiles() {
  const s = periodStats();
  const req = S.settings.officeReqPct;
  const std = S.settings.stdDayHours;
  // Periods that end today count what's done; a whole month or the full year
  // counts plans too - the hours entered on days still to come.
  const plans = S.period === 'month' || S.period === 'full';
  $('tiles').innerHTML = `
    <div class="tile hero">${daysStat(s, req)}</div>
    <div class="tile">${hoursStat(s, req, std, { plans })}</div>
    <div class="tile">${dayLengthStat(s, std)}</div>`;

  const m = S.period === 'month' ? S.summary.months[S.monthIdx] : null;
  const mtd = S.summary.mtd;
  $('tilesTitle').innerHTML = S.period === 'ytd' ? `Year to date · to ${longDate(S.today)}`
    : S.period === 'month' ? `${m.name} ${m.year}`
    : S.period === 'mtd' ? (mtd.partial ? `${mtd.name} ${mtd.year}<span class="through"> · to ${longDate(mtd.through)}</span>` : `${mtd.name} ${mtd.year}`)
    : `Full FY${S.fy}`;

  const ytd = $('periodYtd');
  ytd.disabled = !S.todayInFy;
  ytd.title = S.todayInFy ? '' : `Today is outside FY${S.fy}`;
  for (const [id, period] of [['periodYtd', 'ytd'], ['periodFull', 'full'], ['periodMtd', 'mtd'], ['periodMonth', 'month']]) {
    $(id).setAttribute('aria-pressed', String(S.period === period));
  }
  $('periodMtd').title = mtd.partial ? '' : `FY${S.fy} doesn't contain today, so this shows ${mtd.name} ${mtd.year}`;

  const sel = $('monthSel');
  sel.hidden = S.period !== 'month';
  if (!sel.hidden) {
    sel.innerHTML = S.summary.months
      .map((mo, i) => `<option value="${i}" ${i === S.monthIdx ? 'selected' : ''}>${mo.name} ${mo.year}</option>`)
      .join('');
  }
}

export function wireTiles() {
  const choose = (period) => () => { S.period = period; renderTiles(); };
  $('periodYtd').onclick = () => { if (S.todayInFy) choose('ytd')(); };
  $('periodFull').onclick = choose('full');
  $('periodMtd').onclick = choose('mtd');
  $('periodMonth').onclick = choose('month');
  $('monthSel').onchange = (e) => { S.monthIdx = Number(e.target.value); renderTiles(); };
}

/**
 * The phone's Today tab: how this month is going, in one card under the log -
 * office days and office hours, to date. Always month to date, whatever the
 * Year tab's period is set to.
 */
export function renderSoFar() {
  const m = S.summary.mtd;
  let through = '';
  if (m.partial) {
    const [, mo, d] = parseIso(m.through);
    through = `to ${DAY_NAMES[weekdayOf(m.through)].slice(0, 3)} ${d} ${MONTH_SHORT[mo - 1]}`;
  }
  $('soFar').innerHTML = `
    <div class="sf-head"><h2>${m.name} ${m.partial ? 'so far' : m.year}</h2><span>${through}</span></div>
    <div class="stat-pair">${daysStat(m, S.settings.officeReqPct, { label: 'Days' })}${hoursStat(m, S.settings.officeReqPct, S.settings.stdDayHours, { label: 'Hours' })}</div>`;
}
