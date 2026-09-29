/** The Settings dialog: working pattern, years, calendar fill, clearing, backup. */
import { S, api, loadState, refresh } from './state.js';
import { $, shortDate, plural } from './format.js';
import { askConfirm, flash, attempt } from './dialogs.js';
import { addDays, fyStart, fyEnd } from '../lib/dates.js';

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

export function wireSettings() {
  const dlg = $('settingsDlg');

  $('settingsBtn').onclick = () => {
    $('setStd').value = S.settings.stdDayHours;
    $('setReq').value = Math.round(S.settings.officeReqPct * 100);
    $('setNw').value = S.settings.nonWorkingWeekday;
    $('addFyLabel').textContent = `Add FY${S.lastFy + 1}`;
    $('setIn').value = S.settings.defaultIn;
    $('setOut').value = S.settings.defaultOut;
    $('settingsErr').textContent = '';
    dlg.showModal();
  };
  $('closeSettings').onclick = () => dlg.close();

  $('saveSettings').onclick = () => report(async () => {
    const before = S.settings.nonWorkingWeekday;
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({
      stdDayHours: Number($('setStd').value),
      officeReqPct: Number($('setReq').value) / 100,
      nonWorkingWeekday: Number($('setNw').value),
      defaultIn: $('setIn').value,
      defaultOut: $('setOut').value,
    }) });
    dlg.close();
    await refresh();
    flash(S.settings.nonWorkingWeekday !== before
      ? 'Settings saved · use "Fill weekends…" to move your non-working days'
      : 'Settings saved');
  });

  $('addFy').onclick = () => report(async () => {
    const r = await api('/api/add-fy', { method: 'POST', body: '{}' });
    await loadState(r.lastFy);
    dlg.close();
    flash(`FY${r.lastFy} added · ${r.filled} days laid out`);
  });

  $('fillSkeleton').onclick = () => report(async () => {
    const r = await api('/api/calendar-skeleton', { method: 'POST', body: JSON.stringify({ fy: S.fy }) });
    await refresh();
    dlg.close();
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
