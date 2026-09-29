/** The "Log a day" card: the selected date, the code chips, times and comment. */
import { S, saveDays } from './state.js';
import { $, longDate, shortDate, nowHHMM, fmtHrs, plural } from './format.js';
import { askConfirm, flash } from './dialogs.js';
import { DAY_NAMES, weekdayOf, minutesBetween } from '../lib/dates.js';

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
  renderedFor = date;

  $('dateInput').value = date;
  const dow = DAY_NAMES[weekdayOf(date)];
  // Long form on a wide screen, abbreviated on a phone so it stays on one line.
  $('dayline').innerHTML =
    `<span class="dl-long"><span class="dow">${dow}</span> ${longDate(date)}</span>` +
    `<span class="dl-short"><span class="dow">${dow.slice(0, 3)}</span> ${shortDate(date)}</span>`;

  const multi = S.range.length > 1;
  const note = $('rangenote');
  note.hidden = !multi;
  if (multi) {
    note.innerHTML = `<span>${S.range.length} days selected — choosing a code applies to the work days among them.</span><button id="clearRange">Clear</button>`;
    $('clearRange').onclick = () => { S.range = []; rerender(); };
  }

  const groups = [['work', 'Work'], ['leave', 'Leave'], ['off', 'Not a work day']];
  $('chipzone').innerHTML = groups.map(([g, title]) => `
    <div class="chipgroup"><div class="glabel">${title}</div><div class="chips">
      ${S.codes.filter((c) => c.group === g).map((c) => `
        <button class="chip" data-code="${c.code}" aria-pressed="${rec.code === c.code && !multi}"
          style="background:${c.bg};color:${c.fg}">
          <span class="dot" style="background:${c.fg}"></span>${c.label}
        </button>`).join('')}
    </div></div>`).join('') +
    '<div class="chipgroup"><div class="chips"><button class="chip clear" data-code="">Clear day</button></div></div>';
  $('chipzone').querySelectorAll('.chip').forEach((b) => { b.onclick = () => applyCode(b.dataset.code); });

  fill('inTime', rec.in || '', sameDay);
  fill('outTime', rec.out || '', sameDay);
  fill('comment', rec.comment || '', sameDay);
  // What's on record, so a direct edit of a time can be compared against it
  // and offered back if the change wasn't intended.
  S.prevTimes = { in: rec.in || '', out: rec.out || '' };
  updateHrs();
}

/** The running total beside the times - with a nudge when Out is before In. */
function updateHrs() {
  const inV = $('inTime').value, outV = $('outTime').value;
  const mins = minutesBetween(inV, outV);
  const el = $('hrsOut');
  const overnight = inV && outV && outV < inV;
  el.textContent = mins ? `${fmtHrs(mins / 60)} hrs${overnight ? ' · Out is before In' : ''}` : '';
  el.classList.toggle('warn', !!overnight);
  el.title = overnight ? 'Counted as a shift across midnight. If you meant a daytime Out, fix the time.' : '';
}

const fields = () => ({ in: $('inTime').value || null, out: $('outTime').value || null, comment: $('comment').value || null });

/**
 * Apply a code to the selected day, or to every day in a range. A range skips
 * weekends, public holidays and non-working days - blocking out a fortnight of
 * leave shouldn't recode the Saturdays in it - unless the code being applied is
 * one of those, or the range is being cleared.
 */
async function applyCode(code) {
  const multi = S.range.length > 1;
  if (!multi) return saveDays({ [S.sel]: code === '' ? null : { code, ...fields() } });

  const spares = code !== '' && !CALENDAR.has(code);
  const targets = S.range.filter((d) => !(spares && CALENDAR.has(S.days[d]?.code)));
  const skipped = S.range.length - targets.length;
  if (!targets.length) { flash('Nothing to change - every day in the range is a weekend, holiday or non-working day', true); return; }
  const payload = {};
  for (const date of targets) {
    const prev = S.days[date] || {};
    payload[date] = code === '' ? null : { code, in: prev.in, out: prev.out, comment: prev.comment };
  }
  return saveDays(payload, `${targets.length} ${plural(targets.length, 'day')} updated`
    + (skipped ? ` · ${skipped} weekend/holiday ${plural(skipped, 'day')} left as they were` : ''));
}

/**
 * Save what's in the fields against the selected day. Entering a time on a day
 * with no code yet - or one the calendar filled in - means you were in the
 * office, so it's saved as O.
 */
function saveCurrent() {
  const rec = S.days[S.sel];
  const f = fields();
  if (!rec || CALENDAR.has(rec.code)) {
    if (f.in || f.out) return saveDays({ [S.sel]: { code: 'O', ...f } }, 'Saved as Office');
    if (!rec && f.comment) { flash('Pick a code to save the comment with', true); return; }
    if (!rec) return;
  }
  return saveDays({ [S.sel]: { code: rec.code, ...f } });
}

/** Save the selected day as an office day, keeping whatever times are entered. */
function saveAsOffice() {
  const wasOffice = S.days[S.sel]?.code === 'O';
  return saveDays({ [S.sel]: { code: 'O', ...fields() } }, wasOffice ? null : 'Saved as Office');
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

/** Ask first when a button would overwrite a time already there. Punching in on a blank day stays one tap. */
const confirmReplace = (condition, question) => (condition ? askConfirm(question) : Promise.resolve(true));

export function wireLog(ctx) {
  rerender = ctx.rerender;

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

  // Punching in or out is a statement that you were in the office, so it codes
  // the day O whatever it was set to before.
  for (const [btn, field, label] of [['nowIn', 'inTime', 'In'], ['nowOut', 'outTime', 'Out']]) {
    $(btn).onclick = async () => {
      const now = nowHHMM(), current = $(field).value;
      if (!(await confirmReplace(current, {
        title: `Change the ${label} time?`,
        body: `${shortDate(S.sel)} already has an ${label} time of ${current}. Change it to ${now}?`,
        ok: 'Change it',
      }))) return;
      $(field).value = now;
      updateHrs();
      saveAsOffice();
    };
  }

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
