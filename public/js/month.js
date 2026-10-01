/**
 * The phone's Month tab: one month as a seven-column calendar, with that
 * month's figures underneath. It stands in for the 31-column grid, which is
 * ten times wider than a phone. Swipe or use the arrows to change month;
 * tap a day to open it on the Today tab.
 *
 * Select turns taps into a range: the first day, then the last. A sheet
 * then applies a code to the work days in it - the touch version of
 * Shift-click on the desktop grid.
 */
import { S, loadState } from './state.js';
import { $, esc, fmtHrs, fmtHrs2, plural, codeVars } from './format.js';
import { daysStat, hoursStat } from './stat.js';
import { describe } from './grid.js';
import { attempt } from './dialogs.js';
import { applyCodeTo } from './log.js';
import { pad, weekdayOf, daysInMonth, datesBetween, DAY_NAMES, MONTH_SHORT, parseIso } from '../lib/dates.js';

let ctx = { openDay: () => {} };
let swipedAt = 0;          // a swipe ends on a day; that's not a tap on it

/* ---------- selecting a range by touch ---------- */
const CALENDAR = new Set(['W', 'NW', 'PH']);
const sel = { on: false, start: null, end: null, fy: null };

function rangeDates() {
  if (!sel.start) return [];
  const [a, b] = [sel.start, sel.end || sel.start].sort();
  return datesBetween(a, b);
}

function setSelecting(on) {
  sel.on = on;
  sel.start = sel.end = null;
  sel.fy = S.fy;
  $('mSelect').setAttribute('aria-pressed', String(on));
  $('mSelect').textContent = on ? 'Done' : 'Select';
  $('mHint').hidden = !on;
  renderMonth();
}

function pick(date) {
  if (!sel.start || sel.end) { sel.start = date; sel.end = null; }
  else sel.end = date;
  renderMonth();
}

const shortDay = (d) => { const [, m, day] = parseIso(d); return `${DAY_NAMES[weekdayOf(d)].slice(0, 3)} ${day} ${MONTH_SHORT[m - 1]}`; };

function renderSheet() {
  const dates = sel.on ? rangeDates() : [];
  $('rangeSheet').hidden = !dates.length;
  document.body.classList.toggle('sheet-open', !!dates.length);
  if (!dates.length) return;
  const kept = dates.filter((d) => CALENDAR.has(S.days[d]?.code));
  const work = dates.length - kept.length;
  $('rsTitle').textContent = dates.length === 1 ? `${shortDay(dates[0])}: apply a code`
    : `${shortDay(dates[0])} – ${shortDay(dates[dates.length - 1])}: apply to ${work} work ${plural(work, 'day')}`;
  $('rsNote').textContent = kept.length
    ? `${kept.length} weekend, holiday or non-working ${plural(kept.length, 'day')} in the range ${kept.length === 1 ? 'stays' : 'stay'} as ${kept.length === 1 ? 'it is' : 'they are'}.`
    : sel.end ? 'Tap another day to start a new range.' : 'Tap the last day of the range, or pick a code for just this day.';
  $('rsChips').innerHTML = S.codes.map((c) =>
    `<button class="sheet-chip code" data-code="${c.code}" style="${codeVars(c)}">${c.label}</button>`).join('');
  $('rsChips').querySelectorAll('button[data-code]').forEach((b) => { b.onclick = () => apply(b.dataset.code); });
  keepInView(sel.end || sel.start);
}

/** The sheet covers the lower half of the screen: make room for it, and keep the day just tapped above it. */
function keepInView(date) {
  requestAnimationFrame(() => {
    const sheet = $('rangeSheet');
    document.body.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`);
    const cell = $('mGrid').querySelector(`[data-day="${date}"]`);
    if (!cell) return;
    const limit = sheet.getBoundingClientRect().top - 8;
    const r = cell.getBoundingClientRect();
    if (r.bottom > limit) window.scrollBy({ top: r.bottom - limit, behavior: 'smooth' });
  });
}

async function apply(code) {
  const dates = rangeDates();
  if (!dates.length) return;
  const ok = await applyCodeTo(dates, code);
  if (ok !== false) setSelecting(false);
}

/** The month to show when a year is opened: this month if the year holds today, else the first with work in it. */
function defaultIdx() {
  const ms = S.summary.months;
  if (S.todayInFy) {
    const i = ms.findIndex((m) => `${m.year}-${pad(m.month)}` === S.today.slice(0, 7));
    if (i >= 0) return i;
  }
  const i = ms.findIndex((m) => m.workDays > 0);
  return i >= 0 ? i : 0;
}

/** Show a given month of the open year. Called by the Year tab's month list too. */
export function showMonth(idx) {
  S.mIdx = idx;
  S.mFy = S.fy;
  renderMonth();
}

export function renderMonth() {
  if (S.mFy !== S.fy || S.mIdx == null) { S.mIdx = defaultIdx(); S.mFy = S.fy; }
  if (sel.on && sel.fy !== S.fy) { sel.start = sel.end = null; sel.fy = S.fy; }   // a range stays within one year
  const inRange = new Set(sel.on ? rangeDates() : []);
  const m = S.summary.months[S.mIdx];
  $('mTitle').textContent = `${m.name} ${m.year}`;
  $('mPrev').disabled = S.mIdx === 0 && !S.fys.includes(S.fy - 1);
  $('mNext').disabled = S.mIdx === 11 && !S.fys.includes(S.fy + 1);

  // Monday first, as the work week runs.
  const first = `${m.year}-${pad(m.month)}-01`;
  const lead = (weekdayOf(first) + 6) % 7;
  let html = '<span class="mcell pad"></span>'.repeat(lead);
  for (let d = 1; d <= daysInMonth(m.year, m.month); d++) {
    const date = `${m.year}-${pad(m.month)}-${pad(d)}`;
    const rec = S.days[date];
    const def = rec ? S.codeMap[rec.code] : null;
    const weekend = rec?.code === 'W' || (!rec && [0, 6].includes(weekdayOf(date)));
    const cls = ['mcell',
      weekend ? 'we' : def ? 'coded code' : '',
      date > S.today ? 'plan' : '',
      date === S.today ? 'today' : '',
      !sel.on && date === S.sel ? 'sel' : '',
      inRange.has(date) ? (CALENDAR.has(rec?.code) ? 'kept' : 'picked') : ''].filter(Boolean).join(' ');
    const style = def && !weekend ? ` style="${codeVars(def)}"` : '';
    const label = esc(describe(date, rec, def));
    const pressed = sel.on ? ` aria-pressed="${inRange.has(date)}"` : '';
    html += `<button class="${cls}"${style} data-day="${date}" aria-label="${label}"${pressed}${date === S.today ? ' aria-current="date"' : ''}>`
      + `<span class="d">${d}</span>${weekend ? 'W' : def ? rec.code : ''}${rec?.in && rec?.out ? '<span class="dot"></span>' : ''}</button>`;
  }
  $('mGrid').innerHTML = html;
  $('mGrid').querySelectorAll('button[data-day]').forEach((b) => {
    b.onclick = () => {
      if (Date.now() - swipedAt < 400) return;
      if (sel.on) pick(b.dataset.day); else ctx.openDay(b.dataset.day);
    };
  });

  // Office days, and office hours for the whole month with plans included:
  // hours done plus the times entered on days still to come, with where it
  // stands today in the note. A month already over is just what happened.
  const req = S.settings.officeReqPct, std = S.settings.stdDayHours;
  const avg = m.avgHrsPerOfficeDay;
  $('mStats').innerHTML = daysStat(m, req, { label: 'Days' }) + hoursStat(m, req, std, { plans: true, label: 'Hours' })
    + `<p class="mfoot">${avg == null ? '' : `Avg office day ${fmtHrs2(avg)} h · std ${fmtHrs(std)} h`}</p>`;
  renderSheet();
}

/** Leaving the Month tab ends a selection. */
export function endSelecting() { if (sel.on) setSelecting(false); }

/** Move a month, crossing into the neighbouring financial year when there is one. */
async function step(dir) {
  const next = S.mIdx + dir;
  if (next >= 0 && next <= 11) { showMonth(next); return; }
  const fy = S.fy + dir;
  if (!S.fys.includes(fy)) return;
  await attempt(() => loadState(fy));
  showMonth(dir < 0 ? 11 : 0);
}

export function wireMonth(context) {
  ctx = context;
  $('mPrev').onclick = () => step(-1);
  $('mNext').onclick = () => step(1);
  $('mSelect').onclick = () => setSelecting(!sel.on);
  $('rsCancel').onclick = () => setSelecting(false);
  $('rsClear').onclick = () => apply('');

  // A sideways swipe changes month; anything more vertical is left to scroll the page.
  let start = null;
  const grid = $('mGrid');
  grid.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    start = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipedAt = Date.now(); step(dx < 0 ? 1 : -1); }
  });
}
