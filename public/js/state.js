/**
 * The page's copy of the server's state, and the only code that talks to the
 * API. Every response is applied through applyState, and every change to state
 * is announced to subscribers - the page re-renders from there.
 */
import { flash } from './dialogs.js';
import { fyOfDate, fyStart } from '../lib/dates.js';

export const S = {
  fy: null, today: '', todayInFy: false, settings: {}, codes: [], codeMap: {}, days: {}, summary: null,
  unconfirmed: [], lastFy: null, fys: [], version: null, build: null,
  sel: null, anchor: null, range: [], period: 'mtd', monthIdx: null,
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
const changed = (why) => listeners.forEach((fn) => fn(why));

export async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...opts.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/**
 * Responses can arrive out of order - a save's refresh still in flight when
 * you switch year, say. Each state request is numbered, and a response older
 * than one already applied is dropped rather than painting the wrong year.
 */
let requested = 0, applied = 0;

function applyState(data, n) {
  if (n < applied) return false;
  applied = n;
  const yearChanged = data.fy !== S.fy;
  Object.assign(S, {
    fy: data.fy,
    today: data.today,
    todayInFy: data.todayInFy,
    settings: data.settings,
    codes: data.codes,
    codeMap: Object.fromEntries(data.codes.map((c) => [c.code, c])),
    days: data.days,
    summary: data.summary,
    unconfirmed: data.unconfirmedHolidayYears || [],
    lastFy: data.lastFy,
    fys: data.availableFys,
    version: data.version,
    build: data.build,
  });
  if (!S.todayInFy && S.period === 'ytd') S.period = 'mtd';
  if (!S.sel || fyOfDate(S.sel) !== S.fy) {
    S.sel = fyOfDate(S.today) === S.fy ? S.today : fyStart(S.fy);
    S.anchor = S.sel;
    S.range = [];
  }
  if (yearChanged) S.monthIdx = null;
  return true;
}

/** Load a financial year (or the server's default) and select a sensible day in it. */
export async function loadState(fy) {
  const n = ++requested;
  const data = await api(`/api/state${fy ? `?fy=${fy}` : ''}`);
  if (applyState(data, n)) changed('load');
}

/** Re-read the open year after a change, keeping the selection. */
export async function refresh() {
  const n = ++requested;
  const data = await api(`/api/state?fy=${S.fy}`);
  if (data.fy !== S.fy) return;          // the year moved on while this was in flight
  if (applyState(data, n)) changed('refresh');
}

/**
 * Save days. Saves run one at a time, in the order they were made, so a quick
 * second tap can't overtake the first and leave the older value on record.
 * Resolves true when the save went through. `quiet` skips the "Saved" flag,
 * for callers that confirm the save their own way.
 */
let queue = Promise.resolve();
export function saveDays(days, msg, { quiet = false } = {}) {
  const run = async () => {
    try {
      await api('/api/days', { method: 'PUT', body: JSON.stringify({ days }) });
      await refresh();
      if (!quiet) flash(msg);
      return true;
    } catch (e) {
      flash(e.message, true);
      return false;
    }
  };
  queue = queue.then(run, run);
  return queue;
}

/** What the server says today is - for noticing that midnight has passed with the page open. */
export async function serverToday() {
  return (await api('/api/health')).today;
}
