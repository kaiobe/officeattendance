/** The year grid, the key totals under it, the holiday note and the legend. */
import { S } from './state.js';
import { $, esc, fmtHrs2, fmtNum, pct, longDate, gapWords, codeVars } from './format.js';
import { DAY_NAMES, pad, weekdayOf } from '../lib/dates.js';

/**
 * The stat columns. The grid shows the ones worth scanning; the rest of the
 * workbook's hour columns (Avail, H%, Req, Gap) sit behind "All hour columns",
 * so the year fits the page without a sideways scroll. The choice is kept
 * for this browser.
 */
const HOUR_PREF = 'grid.allHourCols';
export function allHourCols() {
  try { return localStorage.getItem(HOUR_PREF) === '1'; } catch { return false; }
}
export function setAllHourCols(on) {
  try { localStorage.setItem(HOUR_PREF, on ? '1' : '0'); } catch {}
}

const dash = '<td class="stat">—</td>';

// A gap in words - "20.75 short", "3.00 ahead" - the way the tiles say it. A
// plus sign read as extra, when it meant short. Blank when there's nothing to compare.
function gapCell(gap, basis, fmt = fmtNum, extra = '') {
  if (!basis) return dash;
  const g = gapWords(gap, fmt);
  const cls = g.cls === 'short' ? 'gap-short' : g.cls === 'ahead' ? 'gap-ok' : '';
  return `<td class="stat"${extra}><span class="${cls}">${g.text}</span></td>`;
}

function dayCols() {
  return ['Work', 'Office', '%', `vs ${Math.round(S.settings.officeReqPct * 100)}%`];
}
function hourCols(all) {
  return all ? ['Office', 'Avail', 'H%', 'Req', 'Gap', 'Avg', 'Timed'] : ['Office', 'Avg', 'Timed'];
}

function dayStatCells(m) {
  return `<td class="stat">${m.workDays || '—'}</td>
    <td class="stat">${m.officeDays || '—'}</td>
    <td class="stat">${m.pctDays == null ? '—' : pct(m.pctDays) + '%'}</td>
    ${gapCell(m.gapDays, m.workDays, fmtNum, ' data-col="vs"').replace('<td class="stat"', '<td class="stat endgroup"')}`;
}

/**
 * Hours need every office day timed to mean much. "Timed" says how complete
 * they are; while some office days have no times, H% and the gap are shown
 * in amber with the reason on hover, rather than as a confident number.
 */
function hourStatCells(m, all) {
  const hasHrs = m.officeHrs > 0;
  // Only days up to today count: a planned office day can't have times yet.
  const patchy = m.untimedPastOfficeDays > 0;
  const title = patchy ? ` title="${m.untimedPastOfficeDays} of ${m.pastOfficeDays} office days so far have no times"` : '';
  const why = patchy ? `${title} class="stat patchy"` : '';
  const timed = m.pastOfficeDays
    ? `<td class="stat${patchy ? ' patchy' : ''}"${title}>${m.pastTimedOfficeDays} / ${m.pastOfficeDays}</td>`
    : dash;
  const office = `<td class="stat sep">${hasHrs ? fmtHrs2(m.officeHrs) : '—'}</td>`;
  const avg = `<td class="stat">${m.avgHrsPerOfficeDay == null ? '—' : fmtHrs2(m.avgHrsPerOfficeDay)}</td>`;
  if (!all) return office + avg + timed;
  const hpct = hasHrs && m.pctHrs != null
    ? `<td${why || ' class="stat"'}>${pct(m.pctHrs)}%</td>` : dash;
  const gap = hasHrs && m.availableHrs
    ? gapCell(m.gapHrs, m.availableHrs, fmtHrs2).replace('<td class="stat"', `<td${why || ' class="stat"'}`) : dash;
  return office
    + `<td class="stat">${m.availableHrs ? fmtHrs2(m.availableHrs) : '—'}</td>`
    + hpct
    + `<td class="stat">${m.availableHrs ? fmtHrs2(m.reqHrs) : '—'}</td>`
    + gap + avg + timed;
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
  const style = def ? codeVars(def) : '';
  const cls = [def ? 'code' : 'empty', rec?.code === 'W' ? 'we' : '', selected ? 'sel' : '', date === S.today ? 'today' : ''].filter(Boolean).join(' ');
  const label = esc(describe(date, rec, def));
  return `<td class="cell"><button class="${cls}" style="${style}" data-date="${date}" title="${label}" aria-label="${label}"`
    + ` aria-pressed="${selected}"${date === S.today ? ' aria-current="date"' : ''}>`
    + `${rec ? rec.code : ''}${rec?.in && rec?.out ? '<span class="mark"></span>' : ''}${rec?.comment ? '<span class="cmt"></span>' : ''}</button></td>`;
}

/** What a cell says to a screen reader, for other views too. */
export { describe };

export function renderGrid(onPick) {
  const all = allHourCols();
  const DAY_COLS = dayCols(), HOUR_COLS = hourCols(all);
  $('cal').classList.toggle('all-hours', all);
  $('hourColsBtn').setAttribute('aria-pressed', String(all));
  $('hourColsBtn').textContent = all ? 'Fewer hour columns' : 'All hour columns';
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
    body += dayStatCells(m) + hourStatCells(m, all) + '</tr>';
  }
  const t = S.summary.total;
  body += `<tr class="totals"><td class="mth">FY${S.fy}</td><td class="cell" colspan="31"></td>`
    + dayStatCells(t) + hourStatCells(t, all) + '</tr></tbody>';

  // Keep keyboard focus on the same day across the re-render.
  const focused = document.activeElement?.closest?.('#cal button[data-date]')?.dataset.date;
  $('cal').innerHTML = head + body;
  $('cal').querySelectorAll('button[data-date]').forEach((b) => {
    b.onclick = (e) => onPick(b.dataset.date, e.shiftKey, e.ctrlKey || e.metaKey);
  });
  if (focused) $('cal').querySelector(`button[data-date="${focused}"]`)?.focus({ preventScroll: true });
}

export function renderLegend() {
  const counts = S.summary.total.byCode;
  $('legend').innerHTML = S.codes.map((c) => `
    <span class="item"><span class="sw code" style="${codeVars(c)}">${c.code}</span>
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

/**
 * The phone's Year tab: one row per month instead of the 31-column grid.
 * Tapping a month opens it in the month view.
 */
export function renderYearList(onPickMonth) {
  const req = Math.round(S.settings.officeReqPct * 100);
  const row = (m, label) => {
    const g = m.workDays ? gapWords(m.gapDays) : null;
    const cls = !g ? '' : g.cls === 'short' ? 'gap-short-t' : g.cls === 'ahead' ? 'gap-ok-t' : '';
    return `<span class="m">${label}</span>
      <span>${m.pctDays == null ? '—' : pct(m.pctDays) + '%'}</span>
      <span class="${cls}">${g ? g.text : '—'}</span>
      <span>${m.avgHrsPerOfficeDay == null ? '—' : fmtHrs2(m.avgHrsPerOfficeDay) + ' h'}</span>`;
  };
  $('yearList').innerHTML =
    `<div class="yl-row yl-head"><span class="m">Month</span><span>Office</span><span>vs ${req}%</span><span>Avg day</span></div>`
    + S.summary.months.map((m, i) => `<button class="yl-row" data-i="${i}" aria-label="Open ${m.name} ${m.year}">${row(m, `${m.name.slice(0, 3)} ${String(m.year).slice(2)}`)}</button>`).join('')
    + `<div class="yl-row yl-total">${row(S.summary.total, `FY${S.fy}`)}</div>`;
  $('yearList').querySelectorAll('button[data-i]').forEach((b) => { b.onclick = () => onPickMonth(Number(b.dataset.i)); });
}
