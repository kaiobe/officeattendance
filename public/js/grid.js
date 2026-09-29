/** The year grid, the key totals under it, the holiday note and the legend. */
import { S } from './state.js';
import { $, esc, fmtHrs2, fmtNum, pct, longDate } from './format.js';
import { DAY_NAMES, pad, weekdayOf } from '../lib/dates.js';

// Short names: the Days / Hours group headers above them supply the context.
const DAY_COLS = ['Work', 'Office', 'D%', 'Req'];
const HOUR_COLS = ['Office', 'Avail', 'H%', 'Req', 'Gap', 'Avg'];

// A gap is "ahead" at or below zero, "short" above it. Blank when there's nothing to compare.
function gapCell(gap, basis, fmt = fmtNum) {
  if (!basis) return '<td class="stat">—</td>';
  const cls = gap <= 0 ? 'gap-ok' : 'gap-short';
  return `<td class="stat"><span class="${cls}">${gap > 0 ? '+' : ''}${fmt(gap)}</span></td>`;
}

function dayStatCells(m) {
  return `<td class="stat">${m.workDays || '—'}</td>
    <td class="stat">${m.officeDays || '—'}</td>
    <td class="stat">${m.pctDays == null ? '—' : pct(m.pctDays) + '%'}</td>
    <td class="stat endgroup">${m.workDays ? fmtNum(m.reqDays) : '—'}</td>`;
}

function hourStatCells(m) {
  const hasHrs = m.officeHrs > 0;
  return `<td class="stat sep">${hasHrs ? fmtHrs2(m.officeHrs) : '—'}</td>
    <td class="stat">${m.availableHrs ? fmtHrs2(m.availableHrs) : '—'}</td>
    <td class="stat">${hasHrs && m.pctHrs != null ? pct(m.pctHrs) + '%' : '—'}</td>
    <td class="stat">${m.availableHrs ? fmtHrs2(m.reqHrs) : '—'}</td>
    ${gapCell(m.gapHrs, hasHrs ? m.availableHrs : 0, fmtHrs2)}
    <td class="stat">${m.avgHrsPerOfficeDay == null ? '—' : fmtHrs2(m.avgHrsPerOfficeDay)}</td>`;
}

/** What a screen reader says for a cell - the tooltip carries the same. */
function describe(date, rec, def) {
  const parts = [`${DAY_NAMES[weekdayOf(date)]} ${longDate(date)}`];
  parts.push(def ? def.label : 'nothing logged');
  if (rec?.in && rec?.out) parts.push(`${rec.in}–${rec.out}`);
  if (rec?.comment) parts.push(rec.comment);
  if (date === S.today) parts.push('today');
  return parts.join(' · ');
}

function dayCell(m, d) {
  if (d > m.days) return '<td class="cell"><button class="void" disabled tabindex="-1" aria-hidden="true"></button></td>';
  const date = `${m.year}-${pad(m.month)}-${pad(d)}`;
  const rec = S.days[date];
  const def = rec ? S.codeMap[rec.code] : null;
  const selected = S.range.length > 1 ? S.range.includes(date) : date === S.sel;
  const style = def ? `background:${def.bg};color:${def.fg}` : '';
  const cls = [def ? '' : 'empty', selected ? 'sel' : '', date === S.today ? 'today' : ''].filter(Boolean).join(' ');
  const label = esc(describe(date, rec, def));
  return `<td class="cell"><button class="${cls}" style="${style}" data-date="${date}" title="${label}" aria-label="${label}"`
    + ` aria-pressed="${selected}"${date === S.today ? ' aria-current="date"' : ''}>`
    + `${rec ? rec.code : ''}${rec?.in && rec?.out ? '<span class="mark"></span>' : ''}${rec?.comment ? '<span class="cmt"></span>' : ''}</button></td>`;
}

export function renderGrid(onPick) {
  let head = `<thead><tr class="grouphead"><th class="mth"></th><th colspan="31"></th>`
    + `<th class="grp endgroup" colspan="${DAY_COLS.length}">Days</th>`
    + `<th class="grp sep" colspan="${HOUR_COLS.length}">Hours</th></tr><tr><th class="mth">Month</th>`;
  for (let d = 1; d <= 31; d++) head += `<th class="num">${d}</th>`;
  head += DAY_COLS.map((c, i) => `<th class="stat${i === DAY_COLS.length - 1 ? ' endgroup' : ''}">${c}</th>`).join('');
  head += HOUR_COLS.map((c, i) => `<th class="stat${i === 0 ? ' sep' : ''}">${c}</th>`).join('');
  head += '</tr></thead>';

  let body = '<tbody>';
  for (const m of S.summary.months) {
    body += `<tr><td class="mth">${m.name.slice(0, 3)} ${String(m.year).slice(2)}</td>`;
    for (let d = 1; d <= 31; d++) body += dayCell(m, d);
    body += dayStatCells(m) + hourStatCells(m) + '</tr>';
  }
  const t = S.summary.total;
  body += `<tr class="totals"><td class="mth">FY${S.fy}</td><td class="cell" colspan="31"></td>`
    + dayStatCells(t) + hourStatCells(t) + '</tr></tbody>';

  // Keep keyboard focus on the same day across the re-render.
  const focused = document.activeElement?.closest?.('#cal button[data-date]')?.dataset.date;
  $('cal').innerHTML = head + body;
  $('cal').querySelectorAll('button[data-date]').forEach((b) => {
    b.onclick = (e) => onPick(b.dataset.date, e.shiftKey);
  });
  if (focused) $('cal').querySelector(`button[data-date="${focused}"]`)?.focus({ preventScroll: true });
}

export function renderLegend() {
  const counts = S.summary.total.byCode;
  $('legend').innerHTML = S.codes.map((c) => `
    <span class="item"><span class="sw" style="background:${c.bg};color:${c.fg}">${c.code}</span>
    ${c.label} <span class="n">${counts[c.code] || 0}</span></span>`).join('');
}

// The workbook's key panel: two totals counted differently from the monthly rows.
export function renderKeyTotals() {
  const t = S.summary.total;
  $('keytotals').innerHTML = `
    <span class="kt"><span class="k">Total days worked</span><span class="v">${t.daysWorked}</span>
      <span class="f">O + H + WS</span></span>
    <span class="kt"><span class="k">Total work days</span><span class="v">${t.totalWorkDays}</span>
      <span class="f">incl. leave</span></span>
    <span class="kt"><span class="k">Work days for the requirement</span><span class="v">${t.workDays}</span>
      <span class="f">O + H${t.workingSickDays ? ` · excludes ${t.workingSickDays} working sick` : ''}</span></span>`;
}

// Victoria sets the Friday before the AFL Grand Final each year once the AFL
// releases its schedule, so future years genuinely have no date yet.
export function renderGridNote() {
  const el = $('gridnote');
  const years = S.unconfirmed || [];
  el.hidden = !years.length;
  if (!years.length) return;
  const many = years.length > 1;
  el.innerHTML = `<span>⚠</span><span>AFL Grand Final Friday ${many ? 'dates' : 'date'} for
    ${years.join(' and ')} ${many ? 'have' : 'has'} not been announced by the Victorian Government yet,
    so ${many ? 'those days are' : 'that day is'} not marked as a public holiday. Add it by hand once it's confirmed.</span>`;
}
