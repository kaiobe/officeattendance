/** The "Log a day" card: the selected date, the code chips, times and comment. */
import { S, saveDays } from './state.js';
import { $, longDate, shortDate, nowHHMM, fmtHrs, plural, codeVars } from './format.js';
import { askConfirm, flash } from './dialogs.js';
import { DAY_NAMES, weekdayOf, minutesBetween, isWeekend } from '../lib/dates.js';

/** Codes the calendar puts down by itself - not something you log. */
const CALENDAR = new Set(['W', 'NW', 'PH']);

let rerender = () => {};
let renderedFor = null;          // the date the fields currently show

/** Set a field from the record, unless you're typing in it right now. */
function fill(id, value, sameDay) {
  const el = $(id);
  if (sameDay && document.activeElement === el) return;
  el.value = value;
}

export function renderLog() {
  const date = S.sel;
  const rec = S.days[date] || {};
  const sameDay = renderedFor === date;
  if (!sameDay) hidePunched();
  renderedFor = date;

  $('dateInput').value = date;
  const dow = DAY_NAMES[weekdayOf(date)];
  // Long form on a wide screen, abbreviated on a phone so it stays on one line.
  // The heading is also the date picker: tap it to choose another day.
  $('dayline').innerHTML =
    `<span class="dl-long"><span class="dow">${dow}</span> ${longDate(date)}</span>` +
    `<span class="dl-short"><span><span class="dow">${dow.slice(0, 3)}</span> ${shortDate(date)}<svg class="pick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span></span>` +
    '<span class="today-tag">Today</span>';
  $('dayline').setAttribute('aria-label', `${dow} ${longDate(date)}${date === S.today ? ', today' : ''}. Choose another date`);
  $('logCard').classList.toggle('on-today', date === S.today);

  const multi = S.range.length > 1;
  const note = $('rangenote');
  note.hidden = !multi;
  if (multi) {
    note.innerHTML = `<span>${S.range.length} days selected — choosing a code applies to the work days among them.</span><button id="clearRange">Clear</button>`;
    $('clearRange').onclick = () => { S.range = []; rerender(); };
  }

  // Weekends aren't worked: nothing on a Saturday or Sunday can be changed.
  // A range or set of picks that merely includes one still works - the
  // weekend days in it are skipped.
  const weekend = isWeekend(date);
  const locked = weekend && !multi;
  $('logCard').classList.toggle('locked', weekend);
  $('lockNote').hidden = !locked;
  for (const id of ['inTime', 'outTime', 'comment', 'stdTimes', 'clearTimes']) $(id).disabled = weekend;

  const groups = [['work', 'Work'], ['leave', 'Leave'], ['off', 'Not a work day']];
  $('chipzone').innerHTML = groups.map(([g, title]) => `
    <div class="chipgroup"><div class="glabel">${title}</div><div class="chips">
      ${S.codes.filter((c) => c.group === g).map((c) => `
        <button class="chip code" data-code="${c.code}" aria-pressed="${rec.code === c.code && !multi}"${locked ? ' disabled' : ''}
          style="${codeVars(c)}">
          <span class="dot"></span>${c.label}
        </button>`).join('')}
    </div></div>`).join('') +
    `<div class="chipgroup"><div class="chips"><button class="chip clear" data-code=""${locked ? ' disabled' : ''}>Clear day</button></div></div>`;
  $('chipzone').querySelectorAll('.chip').forEach((b) => { b.onclick = () => applyCode(b.dataset.code); });

  fill('inTime', rec.in || '', sameDay);
  fill('outTime', rec.out || '', sameDay);
  fill('comment', rec.comment || '', sameDay);
  // What's on record, so a direct edit of a time can be compared against it
  // and offered back if the change wasn't intended.
  S.prevTimes = { in: rec.in || '', out: rec.out || '' };
  updateHrs();
}

/**
 * The running total beside the times. While you're in today and haven't
 * punched out, it counts up from the In time instead. An Out earlier than the
 * In gets a nudge, in case it was meant as a daytime time.
 */
function updateHrs() {
  const inV = $('inTime').value, outV = $('outTime').value;
  const el = $('hrsOut');
  const overnight = inV && outV && outV < inV;
  let text = '';
  if (inV && outV) {
    text = `${fmtHrs(minutesBetween(inV, outV) / 60)} hrs${overnight ? ' · Out is before In' : ''}`;
  } else if (inV && !outV && S.sel === S.today && nowHHMM() > inV) {
    const mins = minutesBetween(inV, nowHHMM());
    text = `${Math.floor(mins / 60)} h ${mins % 60} m so far`;
  }
  el.textContent = text;
  el.classList.toggle('warn', !!overnight);
  el.classList.toggle('sofar', !!(inV && !outV && text));
  el.title = overnight ? 'Counted as a shift across midnight. If you meant a daytime Out, fix the time.' : '';
  updatePunch();
}

/** What the punch button does next: In until there's an In time, then Out. */
function punchMode() {
  if (!$('inTime').value) return 'in';
  return $('outTime').value ? 'again' : 'out';
}

function updatePunch() {
  const mode = punchMode(), now = nowHHMM(), b = $('punchBtn');
  const weekend = isWeekend(S.sel);
  b.disabled = weekend;
  const label = weekend ? 'Weekend' : mode === 'in' ? 'In now' : 'Out now';
  b.classList.toggle('out', mode === 'out');
  b.classList.toggle('again', mode === 'again');
  $('punchLabel').textContent = label;
  $('punchTime').textContent = weekend ? '' : now;
  b.setAttribute('aria-label', weekend ? 'Weekend: no punching in' : `${label}, ${now}`);
}

let punchedTimer, undoPunch = null;
function hidePunched() {
  clearTimeout(punchedTimer);
  $('punched').hidden = true;
  undoPunch = null;
}
/** The confirmation under the button, with a way back. It stays for ten seconds. */
function showPunched(text, undo) {
  $('punchedText').textContent = text;
  $('punched').hidden = false;
  undoPunch = undo;
  clearTimeout(punchedTimer);
  punchedTimer = setTimeout(hidePunched, 10000);
}

const weekendRefused = () => { flash("Weekends aren't work days, so they can't be changed", true); return false; };

const fields = () => ({ in: $('inTime').value || null, out: $('outTime').value || null, comment: $('comment').value || null });

/**
 * Apply a code to the selected day, or to every day in a range. A range skips
 * weekends, public holidays and non-working days - blocking out a fortnight of
 * leave shouldn't recode the Saturdays in it - unless the code being applied is
 * one of those, or the range is being cleared.
 */
async function applyCode(code) {
  if (S.range.length <= 1 && isWeekend(S.sel)) return weekendRefused();
  if (S.range.length <= 1) return saveDays({ [S.sel]: code === '' ? null : { code, ...fields() } });
  return applyCodeTo(S.range, code);
}

/**
 * Apply a code to a set of days - a Shift-click range, or a range picked by
 * touch in the month view. Each day keeps its own times and comment.
 */
export async function applyCodeTo(dates, code) {
  // Weekends are never changed. Holidays and non-working days are spared too,
  // unless it's one of those codes being put down, or the range being cleared.
  const spares = code !== '' && !CALENDAR.has(code);
  const targets = dates.filter((d) => !isWeekend(d) && !(spares && CALENDAR.has(S.days[d]?.code)));
  const skipped = dates.length - targets.length;
  if (!targets.length) { flash('Nothing to change - every day in the range is a weekend, holiday or non-working day', true); return false; }
  const payload = {};
  for (const date of targets) {
    const prev = S.days[date] || {};
    payload[date] = code === '' ? null : { code, in: prev.in, out: prev.out, comment: prev.comment };
  }
  return saveDays(payload, `${targets.length} ${plural(targets.length, 'day')} ${code === '' ? 'cleared' : 'updated'}`
    + (skipped ? ` · ${skipped} weekend/holiday ${plural(skipped, 'day')} left as they were` : ''));
}

/**
 * Save what's in the fields against the selected day. Entering a time on a day
 * with no code yet - or one the calendar filled in - means you were in the
 * office, so it's saved as O.
 */
function saveCurrent() {
  if (isWeekend(S.sel)) return weekendRefused();
  const rec = S.days[S.sel];
  const f = fields();
  if (!rec || CALENDAR.has(rec.code)) {
    if (f.in || f.out) return saveDays({ [S.sel]: { code: 'O', ...f } }, 'Saved as Office');
    if (!rec && f.comment) { flash('Pick a code to save the comment with', true); return; }
    if (!rec) return;
  }
  return saveDays({ [S.sel]: { code: rec.code, ...f } });
}

const shownTime = (t) => t || 'not set';

/**
 * Editing a time field gets the same guard as the buttons - typing over a
 * recorded time, or fumbling the picker on a phone, loses it just as easily.
 * Declining puts the original back.
 */
const asking = new Set();          // fields with a question already on screen
async function onTimeEdited(which) {
  if (asking.has(which)) return;    // a second change event for the same edit
  const el = $(which === 'in' ? 'inTime' : 'outTime');
  const prev = (S.prevTimes || {})[which] || '';
  const next = el.value;
  if (prev && next !== prev) {
    const label = which === 'in' ? 'In' : 'Out';
    asking.add(which);
    const ok = await askConfirm({
      title: `Change the ${label} time?`,
      body: next
        ? `${shortDate(S.sel)} has a recorded ${label} time of ${prev}. Change it to ${next}?`
        : `${shortDate(S.sel)} has a recorded ${label} time of ${prev}. Remove it?`,
      ok: next ? 'Change it' : 'Remove it',
    }).finally(() => asking.delete(which));
    if (!ok) { el.value = prev; updateHrs(); return; }
  }
  S.prevTimes[which] = next;
  updateHrs();
  saveCurrent();
}

/**
 * Punch in or out now. Punching is a statement that you were in the office, so
 * it codes the day O whatever it was before; the confirmation says so, and
 * Undo puts the day back exactly as it was.
 */
export async function punch() {
  if (isWeekend(S.sel)) return weekendRefused();
  const which = punchMode() === 'in' ? 'in' : 'out';
  const field = which === 'in' ? 'inTime' : 'outTime', label = which === 'in' ? 'In' : 'Out';
  const now = nowHHMM(), current = $(field).value;
  if (!(await confirmReplace(current, {
    title: `Change the ${label} time?`,
    body: `${shortDate(S.sel)} already has an ${label} time of ${current}. Change it to ${now}?`,
    ok: 'Change it',
  }))) return;
  const date = S.sel;
  const before = S.days[date] ? { ...S.days[date] } : null;
  $(field).value = now;
  S.prevTimes[which] = now;
  updateHrs();
  const ok = await saveDays({ [date]: { code: 'O', ...fields() } }, null, { quiet: true });
  if (!ok) return;
  showPunched(`${label} at ${now}${before?.code === 'O' ? '' : ' · saved as an Office day'}`,
    () => saveDays({ [date]: before }, 'Put back as it was'));
}

/** Ask first when a button would overwrite a time already there. Punching in on a blank day stays one tap. */
const confirmReplace = (condition, question) => (condition ? askConfirm(question) : Promise.resolve(true));

export function wireLog(ctx) {
  rerender = ctx.rerender;

  // The date heading opens the browser's own date picker.
  $('dayline').onclick = () => {
    const input = $('dateInput');
    try { input.showPicker(); } catch { input.focus(); input.click(); }
  };

  $('inTime').oninput = updateHrs;
  $('outTime').oninput = updateHrs;
  $('inTime').onchange = () => onTimeEdited('in');
  $('outTime').onchange = () => onTimeEdited('out');
  $('comment').onchange = saveCurrent;

  $('stdTimes').onclick = async () => {
    const inV = $('inTime').value, outV = $('outTime').value;
    const { defaultIn, defaultOut } = S.settings;
    if (!(await confirmReplace(inV || outV, {
      title: 'Replace the times?',
      body: `${shortDate(S.sel)} is ${shownTime(inV)} to ${shownTime(outV)}. Replace with the standard day, ${defaultIn} to ${defaultOut}?`,
      ok: 'Replace',
    }))) return;
    $('inTime').value = defaultIn;
    $('outTime').value = defaultOut;
    updateHrs();
    saveCurrent();
  };

  $('punchBtn').onclick = punch;
  $('undoPunch').onclick = () => { const undo = undoPunch; hidePunched(); if (undo) undo(); };
  // Keep the time on the button and the running total current.
  setInterval(updateHrs, 20000);

  $('clearTimes').onclick = async () => {
    const inV = $('inTime').value, outV = $('outTime').value;
    if (!(await confirmReplace(inV || outV, {
      title: 'Clear the times?',
      body: `${shortDate(S.sel)} is ${shownTime(inV)} to ${shownTime(outV)}. Clearing removes both.`,
      ok: 'Clear them',
    }))) return;
    $('inTime').value = '';
    $('outTime').value = '';
    updateHrs();
    saveCurrent();
  };
}
