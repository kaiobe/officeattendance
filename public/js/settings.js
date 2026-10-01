/** The Settings dialog: working pattern, years, calendar fill, clearing, backup. */
import { S, api, loadState, refresh } from './state.js';
import { $, shortDate, plural, builtAt } from './format.js';
import { getTheme, setTheme, onThemeChange, ICON } from './theme.js';
import { askConfirm, flash, attempt } from './dialogs.js';
import { addDays, fyStart, fyEnd } from '../lib/dates.js';
import { STATES } from '../core/holidays.js';

const CALENDAR = new Set(['W', 'NW', 'PH']);

/** Everything logged against days still to come in the open year: tomorrow, or the year's start if later, to its end. */
function futureEntries() {
  const tomorrow = addDays(S.today, 1);
  const from = tomorrow > fyStart(S.fy) ? tomorrow : fyStart(S.fy);
  const to = fyEnd(S.fy);
  const dates = Object.entries(S.days)
    .filter(([date, rec]) => date >= from && date <= to && !CALENDAR.has(rec.code))
    .map(([date]) => date)
    .sort();
  return { from, to, dates };
}

/** Show a failure inside the dialog as well as in the log card, so it isn't hidden behind the backdrop. */
function report(fn) {
  return attempt(async () => {
    try { return await fn(); } catch (e) { $('settingsErr').textContent = e.message; throw e; }
  });
}

/**
 * Working pattern fields save the moment they change - there's no Save
 * button to forget. A refused value is explained in the dialog and put back.
 */
const FIELDS = {
  setStd: { key: 'stdDayHours', read: (v) => Number(v), show: (s) => s.stdDayHours },
  setReq: { key: 'officeReqPct', read: (v) => Number(v) / 100, show: (s) => Math.round(s.officeReqPct * 100) },
  setNw: { key: 'nonWorkingWeekday', read: (v) => Number(v), show: (s) => s.nonWorkingWeekday },
  setState: { key: 'holidayState', read: (v) => v, show: (s) => s.holidayState },
  setIn: { key: 'defaultIn', read: (v) => v, show: (s) => s.defaultIn },
  setOut: { key: 'defaultOut', read: (v) => v, show: (s) => s.defaultOut },
};

function fillForm() {
  for (const [id, f] of Object.entries(FIELDS)) $(id).value = f.show(S.settings);
  const next = S.lastFy + 1;
  $('addFyLabel').textContent = `Add FY${next}`;
  $('addFyNote').textContent = `Lays out Oct ${2000 + next - 1} – Sep ${2000 + next}`;
  const { from, to } = futureEntries();
  const none = from > to;                       // a year already over has no future days
  $('clearFuture').disabled = none;
  $('clearFutureNote').textContent = none ? `FY${S.fy} has no days after today`
    : from === fyStart(S.fy) ? `All of FY${S.fy} · asks first`
    : `${from === addDays(S.today, 1) ? 'Tomorrow' : shortDate(from)} to ${shortDate(to)} · asks first`;
  $('settingsVersion').textContent = `Version ${S.version || ''} · deployed ${builtAt(S.build)}`;
  showTheme();
}

function showTheme() {
  const t = getTheme();
  document.querySelectorAll('[data-theme-choice]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeChoice === t)));
}

let savedTimer;
function saved(text = 'Saved') {
  const el = $('settingsSaved');
  el.textContent = `✓ ${text}`;
  el.classList.add('ok');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { el.textContent = 'Saved as you change it'; el.classList.remove('ok'); }, 2500);
}

async function saveField(id) {
  const f = FIELDS[id];
  const el = $(id);
  if (el.value === '' && id !== 'setNw') { el.value = f.show(S.settings); return; }
  $('settingsErr').textContent = '';
  try {
    const r = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ [f.key]: f.read(el.value) }) });
    await refresh();
    saved();
    // A new non-working day or state moves the calendar's own days by itself.
    if (r.moved) {
      $('calHint').textContent = `${r.moved} ${plural(r.moved, 'day')} moved from today on to match. Days before today, and anything you've logged, stay as they were.`;
      $('calHint').hidden = false;
    }
  } catch (e) {
    $('settingsErr').textContent = e.message;
    el.value = f.show(S.settings);
  }
}

export function wireSettings() {
  const dlg = $('settingsDlg');
  $('setState').innerHTML = Object.entries(STATES).map(([k, name]) => `<option value="${k}">${name}</option>`).join('');

  $('settingsBtn').onclick = () => {
    if (!S.summary) return;
    fillForm();
    $('settingsErr').textContent = '';
    $('calHint').hidden = true;
    dlg.showModal();
  };
  $('closeSettings').onclick = () => dlg.close();
  for (const id of Object.keys(FIELDS)) $(id).onchange = () => saveField(id);

  document.querySelectorAll('[data-theme-choice]').forEach((b) => {
    b.insertAdjacentHTML('afterbegin', ICON[b.dataset.themeChoice]);
    b.onclick = () => setTheme(b.dataset.themeChoice);
  });
  onThemeChange(showTheme);

  // Adding a year can't be undone from here, and a stray tap would do it -
  // so it asks first. The next year is listed on its own once the year
  // before it starts, which the question says, since that's usually enough.
  $('addFy').onclick = () => report(async () => {
    const next = S.lastFy + 1;
    const ok = await askConfirm({
      title: `Add FY${next}?`,
      body: `This lays out Oct ${2000 + next - 1} – Sep ${2000 + next} with weekends, public holidays and your non-working day, `
        + `and adds FY${next} to the year list for good. It's added on its own on 1 October ${2000 + next - 2}, so you only need this to plan further ahead.`,
      ok: `Add FY${next}`,
    });
    if (!ok) return;
    const r = await api('/api/add-fy', { method: 'POST', body: '{}' });
    await loadState(r.lastFy);
    dlg.close();
    flash(`FY${r.lastFy} added · ${r.filled} days laid out`);
  });

  $('fillSkeleton').onclick = () => report(async () => {
    const r = await api('/api/calendar-skeleton', { method: 'POST', body: JSON.stringify({ fy: S.fy }) });
    await refresh();
    dlg.close();
    $('calHint').hidden = true;
    flash(`${r.filled} ${plural(r.filled, 'day')} updated`);
  });

  $('clearFuture').onclick = () => report(async () => {
    const { from, to, dates } = futureEntries();
    const n = dates.length;
    if (!n) { flash(`Nothing logged between ${shortDate(from)} and ${shortDate(to)}`); return; }
    const day = plural(n, 'day');
    const ok = await askConfirm({
      title: `Clear ${n} future ${day}?`,
      body: `This removes everything logged between ${shortDate(from)} and ${shortDate(to)} — ${n} ${day}`
        + `${dates[0] !== from ? `, starting ${shortDate(dates[0])}` : ''}. `
        + 'Weekends, public holidays and non-working days stay. Today and anything earlier is untouched.',
      ok: 'Clear them',
    });
    if (!ok) return;
    const r = await api('/api/clear-future', { method: 'POST', body: JSON.stringify({ fy: S.fy }) });
    await refresh();
    dlg.close();
    flash(`${r.cleared} future ${plural(r.cleared, 'day')} cleared`);
  });

  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = (e) => report(async () => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let backup;
    try { backup = JSON.parse(await file.text()); } catch { throw new Error(`${file.name} isn't a backup file`); }
    const count = Object.keys(backup.days || {}).length;
    const ok = await askConfirm({
      title: 'Restore this backup?',
      body: `${file.name} holds ${count} ${plural(count, 'day')}. Days with the same dates are overwritten, and its settings replace yours. Days not in the file are kept.`,
      ok: 'Restore',
    });
    if (!ok) return;
    const r = await api('/api/import', { method: 'POST', body: JSON.stringify({ days: backup.days, settings: backup.settings }) });
    await loadState(S.fy);
    dlg.close();
    flash(`${r.imported} ${plural(r.imported, 'day')} restored${r.skipped ? ` · ${r.skipped} with impossible dates skipped` : ''}`);
  });
}
