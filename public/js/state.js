/**
 * The page's copy of the server's state, and the only code that talks to the
 * API. Every response is applied through applyState, and every change to state
 * is announced to subscribers - the page re-renders from there.
 */
import { flash } from './dialogs.js';
import { fyOfDate, fyStart } from '../lib/dates.js';

export const S = {
  fy: null, today: '', tz: '', todayInFy: false, settings: {}, codes: [], codeMap: {}, days: {}, summary: null,
  unconfirmed: [], lastFy: null, fys: [], version: null, build: null,
  sel: null, anchor: null, range: [], period: 'mtd', monthIdx: null,
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
const changed = (why) => listeners.forEach((fn) => fn(why));

/**
 * How the page is being run. The server version leaves this alone and talks
 * to /api over the network. The standalone version (public/local/) fills it
 * in before the page starts: `transport` answers the same API calls in the
 * browser, and the hooks run its first-run setup and backup reminders.
 */
export const runtime = {
  local: false,
  appVersion: '',
  transport: null,        // (method, path, body) => result, throwing Error on refusal
  beforeLoad: null,       // async, before the first loadState
  afterLoad: null,        // after the first loadState
  saveFile: null,         // (path) => save or share an export
  saveRecovery: null,     // download the original browser data if it cannot be read
};

async function request(path, opts) {
  if (runtime.transport) return runtime.transport(opts.method || 'GET', path, opts.body ? JSON.parse(opts.body) : {});
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...opts.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

let mutations = Promise.resolve();
export function api(path, opts = {}) {
  if (['GET', 'HEAD'].includes(opts.method || 'GET')) return request(path, opts);
  const result = mutations.then(() => request(path, opts));
  mutations = result.catch(() => {});
  return result;
}

/**
 * Responses can arrive out of order - a save's refresh still in flight when
 * you switch year, say. Each state request is numbered, and a response older
 * than the latest request is dropped rather than painting the wrong year.
 */
let requested = 0, navigation = null;
let confirmedDays = {};
const pendingDays = new Map();

function mergeDays(base, changes) {
  const out = { ...base };
  for (const [date, rec] of Object.entries(changes)) {
    if (fyOfDate(date) !== S.fy) continue;
    if (rec === null) delete out[date];
    else out[date] = { ...rec };
  }
  return out;
}

function showPendingDays() {
  S.days = { ...confirmedDays };
  for (const days of pendingDays.values()) S.days = mergeDays(S.days, days);
}

function applyState(data, n) {
  if (n !== requested) return false;
  const yearChanged = data.fy !== S.fy;
  Object.assign(S, {
    fy: data.fy,
    today: data.today,
    tz: data.tz || '',
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
  confirmedDays = data.days;
  showPendingDays();
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
  const task = api(`/api/state${fy ? `?fy=${fy}` : ''}`);
  navigation = task;
  try {
    const data = await task;
    const accepted = applyState(data, n);
    if (accepted) changed('load');
    return accepted;
  } finally {
    if (navigation === task) navigation = null;
  }
}

/** Re-read the open year after a change, keeping the selection. */
export async function refresh() {
  while (navigation) await navigation.catch(() => {});
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
export async function saveDays(days, msg, { quiet = false } = {}) {
  // Later edits must see earlier pending edits, even before the network replies.
  // Keep them over refreshes so an older response cannot erase a newer input.
  const snapshot = JSON.parse(JSON.stringify(days));
  const token = Symbol();
  pendingDays.set(token, snapshot);
  showPendingDays();
  try {
    await api('/api/days', { method: 'PUT', body: JSON.stringify({ days: snapshot }) });
  } catch (e) {
    pendingDays.delete(token);
    showPendingDays();
    changed('refresh');
    flash(e.message, true);
    return false;
  }
  confirmedDays = mergeDays(confirmedDays, snapshot);
  pendingDays.delete(token);
  showPendingDays();
  try { await refresh(); }
  catch (e) {
    flash(`Saved, but the totals could not refresh: ${e.message}`, true);
    return true;
  }
  if (!quiet) flash(msg);
  return true;
}

/** What the server says today is - for noticing that midnight has passed with the page open. */
export async function serverToday() {
  return (await api('/api/health')).today;
}
