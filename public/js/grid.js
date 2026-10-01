/** The year grid, the key totals under it, the holiday note and the legend. */
import { S } from './state.js';
import { $, esc, fmtHrs2, fmtNum, longDate, codeVars } from './format.js';
import { signedHtml, pctHtml } from './stat.js';
import { DAY_NAMES, pad, weekdayOf } from '../lib/dates.js';

/**
 * The stat columns. Under Hours the grid shows what matters - office hours,
 * H% and the gap to the target. The rest (Avail, Req, Avg, and Timed, how
 * many office days have their times) sit behind "All hour columns", so the
 * year fits the page without a sideways scroll. Missing times still show, as
 * amber H% and gap figures with the reason on hover. The choice is kept for
 * this browser.
 */
const HOUR_PREF = 'grid.allHourCols';
export function allHourCols() {
  try { return localStorage.getItem(HOUR_PREF) === '1'; } catch { return false; }
}
export function setAllHourCols(on) {
  try { localStorage.setItem(HOUR_PREF, on ? '1' : '0'); } catch {}
}

const dash = '<td class="stat">—</td>';

// A gap as a signed surplus - +3.00 ahead in green, −20.75 short in red - the
// same way the cards show it. Blank when there's nothing to compare.
function gapCell(gap, basis, fmt = fmtNum, extra = '') {
  if (!basis) return dash;
  return `<td class="stat"${extra}>${signedHtml(-gap, fmt)}</td>`;
}

function dayCols() {
  return ['Work', 'Office', '%'];
}
function hourCols(all) {
  return all ? ['Office', 'Avail', 'H%', 'Req', 'Gap', 'Avg', 'Timed'] : ['Office', 'H%', 'Gap'];
}

function dayStatCells(m) {
  const req = S.settings.officeReqPct;
  return `<td class="stat">${m.workDays || '—'}</td>
    <td class="stat">${m.officeDays || '—'}</td>
    <td class="stat endgroup">${pctHtml(m.pctDays, req)}</td>`;
}

/**
 * The hour columns count everything entered, like the day columns: hours done,
 * plus the times on days still to come (a planned office day with no times
 * counts as a standard day - see calc.js, withPlans). So a month mapped out
 * ahead shows where it will land.
 *
 * A month whose hours include such an estimate shows them in italics, with
 * the reason on hover. "Timed" says how many office days so far have their
 * times. While some don't, H% and the gap get an amber mark with the reason
 * on hover: the number may be low only because times are missing.
 */
function hourStatCells(m, all) {
  const has = m.workDays > 0;
  const patchy = m.untimedPastOfficeDays > 0;
  const why = [
    patchy ? `${m.untimedPastOfficeDays} of ${m.pastOfficeDays} office days so far have no times` : '',
    m.plannedUntimedOfficeDays ? `${m.plannedUntimedOfficeDays} planned office ${m.plannedUntimedOfficeDays === 1 ? 'day' : 'days'} without times counted as a standard day` : '',
  ].filter(Boolean).join('; ');
  const title = why ? ` title="${why}"` : '';
  const flag = (patchy ? ' flag' : '') + (m.plannedUntimedOfficeDays ? ' est' : '');
  const timed = m.pastOfficeDays
    ? `<td class="stat${flag}"${title}>${m.pastTimedOfficeDays} / ${m.pastOfficeDays}</td>`
    : dash;
  const office = `<td class="stat sep${m.plannedUntimedOfficeDays ? ' est' : ''}"${title}>${m.projOfficeHrs > 0 ? fmtHrs2(m.projOfficeHrs) : '—'}</td>`;
  const hpct = has && m.projPctHrs != null ? `<td class="stat${flag}"${title}>${pctHtml(m.projPctHrs, S.settings.officeReqPct)}</td>` : dash;
  const gap = has ? gapCell(m.projGapHrs, m.workDays, fmtHrs2, `${title}`).replace('<td class="stat"', `<td class="stat${flag}"`) : dash;
  if (!all) return office + hpct + gap;
  const avail = `<td class="stat" title="(Office + Home days) × standard day hours">${has ? fmtHrs2(m.availableHrs) : '—'}</td>`;
  const reqH = `<td class="stat">${has ? fmtHrs2(m.projReqHrs) : '—'}</td>`;
  const avg = `<td class="stat">${m.pastAvgHrsPerOfficeDay == null ? '—' : fmtHrs2(m.pastAvgHrsPerOfficeDay)}</td>`;
  return office + avail + hpct + reqH + gap + avg + timed;
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
// Closing it is remembered in this browser for those years; a new year's
// missing date shows it again.
const NOTE_KEY = 'office-attendance:afl-note-closed';
function closedYears() {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) || '[]'); } catch { return []; }
}
export function renderGridNote() {
  const el = $('gridnote');
  const closed = closedYears();
  const years = S.unconfirmed || [];
  const show = years.some((y) => !closed.includes(y));
  el.hidden = !show;
  if (!show) return;
  const many = years.length > 1;
  el.innerHTML = `<span>⚠</span><span class="gn-text">AFL Grand Final Friday ${many ? 'dates' : 'date'} for
    ${years.join(' and ')} ${many ? 'have' : 'has'} not been announced by the Victorian Government yet,
    so ${many ? 'those days are' : 'that day is'} not marked as a public holiday. Add it by hand once it's confirmed.</span>
    <button class="gn-close" type="button" aria-label="Dismiss this note" title="Dismiss">✕</button>`;
  el.querySelector('.gn-close').onclick = () => {
    try { localStorage.setItem(NOTE_KEY, JSON.stringify([...new Set([...closed, ...years])])); } catch { /* kept for this visit only */ }
    el.hidden = true;
  };
}

/**
 * The phone's Year tab: one row per month instead of the 31-column grid.
 * Tapping a month opens it in the month view.
 */
/**
 * The year list's hour columns, planned hours included: the share of hours in
 * the office, and hours ahead (+) or short (−) of the target. An amber mark
 * while some office days so far have no times.
 */
function hourCells(m) {
  if (!m.workDays) return ['<span>—</span>', '<span>—</span>'];
  const flag = m.untimedPastOfficeDays ? ' class="flag"' : '';
  return [
    `<span${flag}>${pctHtml(m.projPctHrs, S.settings.officeReqPct)}</span>`,
    `<span${flag}>${signedHtml(-m.projGapHrs, fmtHrs2)}</span>`,
  ];
}

export function renderYearList(onPickMonth) {
  const req = Math.round(S.settings.officeReqPct * 100);
  // Days: the office share and against the target; then the same for hours.
  const row = (m, label) => {
    const [hpct, hgap] = hourCells(m);
    return `<span class="m">${label}</span>
      <span>${pctHtml(m.pctDays, S.settings.officeReqPct)}</span>
      <span>${m.workDays ? signedHtml(-m.gapDays) : '—'}</span>
      ${hpct}
      ${hgap}`;
  };
  $('yearList').innerHTML =
    `<p class="yl-note">Office share and against the ${req}% target, for days then hours, incl. planned. Red is below ${req}%.</p>`
    + `<div class="yl-row yl-head"><span class="m">Month</span><span title="Office days as a share of work days">Days %</span><span title="Office days ahead (+) or short (−) of the target">Days +/-</span><span title="Office hours as a share of available hours">Hours %</span><span title="Office hours ahead (+) or short (−) of the target">Hours +/-</span></div>`
    + S.summary.months.map((m, i) => `<button class="yl-row" data-i="${i}" aria-label="Open ${m.name} ${m.year}">${row(m, `${m.name.slice(0, 3)} ${String(m.year).slice(2)}`)}</button>`).join('')
    + `<div class="yl-row yl-total">${row(S.summary.total, `FY${S.fy}`)}</div>`;
  $('yearList').querySelectorAll('button[data-i]').forEach((b) => { b.onclick = () => onPickMonth(Number(b.dataset.i)); });
}
