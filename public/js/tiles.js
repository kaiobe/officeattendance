/** The banner: office days, office hours against the target, and day length, for the chosen period. */
import { S } from './state.js';
import { $, fmtHrs, fmtHrs2, fmtNum, pct, longDate, plural, gapWords, hoursVsTarget } from './format.js';
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

  // Office hours against the target. Periods that end today (month to date,
  // year to date) count what's done so far; a whole month or the full year
  // counts plans too - the hours entered on days still to come.
  const plans = S.period === 'month' || S.period === 'full';
  const hv = hoursVsTarget(s, req, { plans });
  const reqPct = Math.round(req * 100);
  const hoursTile = `
    <div class="tile">
      <div class="label">Office hours vs ${reqPct}%${hv.planned ? ' · with plans' : ''}</div>
      <div class="value">${hv.empty ? '—' : `${fmtHrs2(hv.abs)}<span class="unit"> h <span class="${hv.tone}">${hv.word}</span></span>`}</div>
      <div class="sub">${hv.empty ? `No days to date yet · ${reqPct}% of ${fmtHrs(std)} h a work day`
        : `${hv.made} · ${reqPct}% of ${fmtHrs(std)} h a work day`}</div>
      ${hv.soFar ? `<div class="sub sofar-line">${hv.soFar}</div>` : ''}
      ${hv.cls === 'warning' ? `<div class="status warning">${hv.pill}</div>` : ''}
      ${hv.assumed ? `<div class="sub assumed">${hv.assumed}</div>` : ''}
      ${meter(hv.pctHrs, req, hv.empty ? 'idle' : hv.cls)}
    </div>`;

  $('tiles').innerHTML = `
    <div class="tile hero">
      <div class="label">Office days</div>
      <div class="value">${empty ? '—' : pct(s.pctDays)}${empty ? '' : '<span class="unit">%</span>'}</div>
      <div class="sub">${fmtNum(s.officeDays)} office of ${fmtNum(s.workDays)} work days${empty ? '' : ` · ${fmtNum(s.reqDays)} needed`}${s.workingSickDays ? ` · ${s.workingSickDays} working sick excluded` : ''}</div>
      ${dayNote}
      ${meter(s.pctDays, req, dStat)}
    </div>
    ${hoursTile}
    <div class="tile">
      <div class="label">Day length</div>
      <div class="value">${avg == null ? '—' : fmtHrs2(avg) + '<span class="unit">h</span>'}</div>
      <div class="sub">${lenSub}</div>
      ${lenNote}
      ${meter(avg == null ? 0 : avg / (std * 1.2), 1 / 1.2, 'info', ['0 h', `Standard ${fmtHrs(std)} h`, `${fmtHrs(std * 1.2)} h`])}
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
  const hv = hoursVsTarget(m, req);
  const reqPct = Math.round(req * 100);
  const avg = m.avgHrsPerOfficeDay;
  $('soFar').innerHTML = `
    <div class="sf-head"><h2>${m.name} ${m.partial ? 'so far' : m.year}</h2><span>${through}</span></div>
    <div class="sf-main">
      <span class="sf-val">${empty ? '—' : pct(m.pctDays)}${empty ? '' : '<span class="unit">%</span>'}</span>
      <span class="sub">office · ${m.officeDays} of ${m.workDays} work days</span>
      <span class="status ${cls}">${pill}</span>
    </div>
    ${meter(m.pctDays, req, empty ? 'idle' : cls).split('<div class="metercap">')[0]}
    <div class="sf-main sf-hours">
      <span class="sf-val">${hv.empty ? '—' : `${fmtHrs2(hv.abs)}<span class="unit"> h <span class="${hv.tone}">${hv.word}</span></span>`}</span>
      <span class="sub">${hv.empty ? `office hours vs ${reqPct}%` : `office hours · ${fmtHrs2(m.pastOfficeHrs)} of ${fmtHrs2(m.pastReqHrs)} h needed`}</span>
      ${hv.cls === 'warning' ? `<span class="status warning">${hv.pill}</span>` : ''}
    </div>
    ${meter(m.pastPctHrs, req, hv.empty ? 'idle' : hv.cls).split('<div class="metercap">')[0]}
    <div class="sf-foot">${avg == null ? 'No office times yet this month'
      : `Average office day ${fmtHrs2(avg)} h · standard ${fmtHrs(S.settings.stdDayHours)} h`}</div>`;
}
