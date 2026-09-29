/** The banner: office days, office hours and average hours for the chosen period. */
import { S } from './state.js';
import { $, fmtHrs, fmtNum, pct, longDate, plural } from './format.js';
import { pad } from '../lib/dates.js';

const ICON = { good: '●', warning: '▲', critical: '▼' };

function statusOf(p, req) {
  if (p == null) return 'warning';
  if (p >= req) return 'good';
  if (p >= req - 0.05) return 'warning';
  return 'critical';
}

function meter(value, target, cls) {
  const w = Math.max(0, Math.min(1, value || 0)) * 100;
  return `<div class="meter"><div class="fill ${cls}" style="width:${w.toFixed(1)}%"></div>
    <div class="target" style="left:${(target * 100).toFixed(1)}%" title="Requirement"></div></div>
    <div class="metercap"><span>0%</span><span>Target ${(target * 100).toFixed(0)}%</span><span>100%</span></div>`;
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
  const empty = s.workDays === 0;
  const dStat = empty ? 'idle' : statusOf(s.pctDays, req);
  // Hours only mean something once most office days have times against them.
  const patchy = s.untimedOfficeDays > s.timedOfficeDays;
  const hStat = empty || !s.officeHrs || patchy ? 'idle' : statusOf(s.pctHrs, req);

  // Being ahead and meeting the requirement are the same fact - gap is
  // req - office, and the requirement is met exactly when that's at or below
  // zero - so one pill carries both.
  const gapVal = Math.abs(s.gapDays);
  const gapText = gapVal % 1 === 0 ? String(gapVal) : gapVal.toFixed(1);
  const dayNote = empty ? '<div class="status idle">No work days logged</div>'
    : s.gapDays <= 0
      ? `<div class="status good">● ${gapVal === 0 ? 'On target' : `${gapText} ${plural(gapVal, 'day')} ahead`}</div>`
      : `<div class="status ${dStat === 'warning' ? 'warning' : 'critical'}">▼ ${gapText} ${plural(gapVal, 'day')} short</div>`;
  const hourNote = empty ? '<div class="status idle">No hours logged</div>'
    : !s.officeHrs ? '<div class="status idle">No office times entered</div>'
    : patchy ? `<div class="status idle">${s.untimedOfficeDays} office days still need times</div>`
    : `<div class="status ${hStat}">${ICON[hStat]} ${s.gapHrs <= 0 ? 'Above target' : `${fmtHrs(s.gapHrs)} hrs to go`}</div>`;

  $('tiles').innerHTML = `
    <div class="tile hero">
      <div class="label">Office days</div>
      <div class="value">${empty ? '—' : pct(s.pctDays)}${empty ? '' : '<span class="unit">%</span>'}</div>
      <div class="sub">${fmtNum(s.officeDays)} office of ${fmtNum(s.workDays)} work days${empty ? '' : ` · ${fmtNum(s.reqDays)} needed`}${s.workingSickDays ? ` · ${s.workingSickDays} working sick excluded` : ''}</div>
      ${dayNote}
      ${meter(s.pctDays, req, dStat)}
    </div>
    <div class="tile">
      <div class="label">Office hours</div>
      <div class="value">${empty || !s.officeHrs ? '—' : pct(s.pctHrs) + '<span class="unit">%</span>'}</div>
      <div class="sub">${fmtHrs(s.officeHrs)} of ${fmtHrs(s.availableHrs)} available hrs</div>
      ${hourNote}
      ${meter(s.pctHrs, req, hStat)}
    </div>
    <div class="tile">
      <div class="label">Avg per office day</div>
      <div class="value">${s.avgHrsPerOfficeDay == null ? '—' : fmtHrs(s.avgHrsPerOfficeDay) + '<span class="unit">hrs</span>'}</div>
      <div class="sub">${s.timedOfficeDays} ${plural(s.timedOfficeDays, 'day')} with times${s.untimedOfficeDays ? ` · ${s.untimedOfficeDays} untimed` : ''}</div>
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
