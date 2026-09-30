/** The banner: office days, office hours and average hours for the chosen period. */
import { S } from './state.js';
import { $, fmtHrs, fmtHrs2, fmtNum, pct, longDate, plural, gapWords } from './format.js';
import { pad, DAY_NAMES, MONTH_SHORT, parseIso, weekdayOf } from '../lib/dates.js';

const ICON = { good: '●', warning: '▲', critical: '▼' };

function statusOf(p, req) {
  if (p == null) return 'warning';
  if (p >= req) return 'good';
  if (p >= req - 0.05) return 'warning';
  return 'critical';
}

function meter(value, target, cls, caps = ['0%', `Target ${(target * 100).toFixed(0)}%`, '100%']) {
  const w = Math.max(0, Math.min(1, value || 0)) * 100;
  return `<div class="meter"><div class="fill ${cls}" style="width:${w.toFixed(1)}%"></div>
    <div class="target" style="left:${(target * 100).toFixed(1)}%" title="Target"></div></div>
    <div class="metercap">${caps.map((c) => `<span>${c}</span>`).join('')}</div>`;
}

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
  const empty = s.workDays === 0;
  const dStat = empty ? 'idle' : statusOf(s.pctDays, req);

  // Being ahead and meeting the requirement are the same fact - gap is
  // req - office, and the requirement is met exactly when that's at or below
  // zero - so one pill carries both.
  const g = gapWords(s.gapDays);
  const dayNote = empty ? '<div class="status idle">No work days logged</div>'
    : g.cls === 'short'
      ? `<div class="status ${dStat === 'warning' ? 'warning' : 'critical'}">▼ ${g.text.replace(' short', '')} ${plural(Math.abs(s.gapDays), 'day')} short</div>`
      : `<div class="status good">● ${g.cls === 'on' ? 'On target' : `${g.text.replace(' ahead', '')} ${plural(Math.abs(s.gapDays), 'day')} ahead`}</div>`;

  // Day length: how long office days actually are, against the standard day.
  // This is the number behind the hours target, stated on its own.
  const avg = s.avgHrsPerOfficeDay;
  const diff = avg == null ? null : avg - std;
  const lenNote = avg == null ? '<div class="status idle">No office times yet</div>'
    : Math.abs(diff) < 0.005 ? '<div class="status good">● Matches the standard day</div>'
    : diff > 0 ? `<div class="status good">● ${fmtHrs(diff)} h over standard</div>`
    : `<div class="status idle">${fmtHrs(-diff)} h under standard</div>`;
  const lenSub = avg == null ? `Standard day ${fmtHrs(std)} h`
    : `average of ${s.timedOfficeDays} timed ${plural(s.timedOfficeDays, 'day')} · standard day ${fmtHrs(std)} h`;

  // Office hours against the workbook's target. The target assumes every office
  // day is a standard day, so it's shown as information, not as a failure.
  const patchy = s.untimedPastOfficeDays > 0;
  const hStat = empty || !s.officeHrs ? 'idle' : s.gapHrs <= 0 ? 'good' : 'idle';
  const hourNote = empty ? '<div class="status idle">No hours logged</div>'
    : !s.officeHrs ? '<div class="status idle">No office times entered</div>'
    : patchy ? `<div class="status warning">${s.untimedPastOfficeDays} office ${plural(s.untimedPastOfficeDays, 'day')} without times</div>`
    : s.gapHrs <= 0 ? '<div class="status good">● Target met</div>'
    : `<div class="status idle">${fmtHrs(s.gapHrs)} h to go</div>`;

  $('tiles').innerHTML = `
    <div class="tile hero">
      <div class="label">Office days</div>
      <div class="value">${empty ? '—' : pct(s.pctDays)}${empty ? '' : '<span class="unit">%</span>'}</div>
      <div class="sub">${fmtNum(s.officeDays)} office of ${fmtNum(s.workDays)} work days${empty ? '' : ` · ${fmtNum(s.reqDays)} needed`}${s.workingSickDays ? ` · ${s.workingSickDays} working sick excluded` : ''}</div>
      ${dayNote}
      ${meter(s.pctDays, req, dStat)}
    </div>
    <div class="tile">
      <div class="label">Day length</div>
      <div class="value">${avg == null ? '—' : fmtHrs2(avg) + '<span class="unit">h</span>'}</div>
      <div class="sub">${lenSub}${s.untimedPastOfficeDays && avg != null ? ` · ${s.untimedPastOfficeDays} untimed` : ''}</div>
      ${lenNote}
      ${meter(avg == null ? 0 : avg / (std * 1.2), 1 / 1.2, 'info', ['0 h', `Standard ${fmtHrs(std)} h`, `${fmtHrs(std * 1.2)} h`])}
    </div>
    <div class="tile">
      <div class="label">Office hours against the target</div>
      <div class="value">${empty || !s.officeHrs ? '—' : `${fmtHrs(s.officeHrs)}<span class="unit"> of ${fmtHrs(s.reqHrs)} h</span>`}</div>
      <div class="sub">The target assumes every office day is a ${fmtHrs(std)} h standard day</div>
      ${hourNote}
      ${meter(s.pctHrs, req, hStat)}
    </div>`;

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
 * The phone's Today tab: how this month is going, in one card under the log.
 * Always month to date, whatever the Year tab's period is set to.
 */
export function renderSoFar() {
  const m = S.summary.mtd;
  const req = S.settings.officeReqPct;
  const empty = m.workDays === 0;
  const g = gapWords(m.gapDays);
  const cls = empty ? 'idle' : g.cls === 'short' ? (statusOf(m.pctDays, req) === 'warning' ? 'warning' : 'critical') : 'good';
  const pill = empty ? 'No work days yet'
    : g.cls === 'on' ? 'On target'
    : `${g.text.split(' ')[0]} ${plural(Math.abs(m.gapDays), 'day')} ${g.cls}`;
  let through = '';
  if (m.partial) {
    const [, mo, d] = parseIso(m.through);
    through = `to ${DAY_NAMES[weekdayOf(m.through)].slice(0, 3)} ${d} ${MONTH_SHORT[mo - 1]}`;
  }
  const avg = m.avgHrsPerOfficeDay;
  $('soFar').innerHTML = `
    <div class="sf-head"><h2>${m.name} ${m.partial ? 'so far' : m.year}</h2><span>${through}</span></div>
    <div class="sf-main">
      <span class="sf-val">${empty ? '—' : pct(m.pctDays)}${empty ? '' : '<span class="unit">%</span>'}</span>
      <span class="sub">office · ${m.officeDays} of ${m.workDays} work days</span>
      <span class="status ${cls}">${pill}</span>
    </div>
    ${meter(m.pctDays, req, empty ? 'idle' : cls).split('<div class="metercap">')[0]}
    <div class="sf-foot">${avg == null ? 'No office times yet this month'
      : `Days in the office average ${fmtHrs(avg)} h, against a ${fmtHrs(S.settings.stdDayHours)} h standard day`}</div>`;
}
