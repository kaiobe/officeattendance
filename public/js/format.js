/** Formatting for display. Nothing here touches the page. */
import { MONTH_NAMES, MONTH_SHORT, pad, parseIso } from '../lib/dates.js';

export const $ = (id) => document.getElementById(id);

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const longDate = (s) => { const [y, m, d] = parseIso(s); return `${d} ${MONTH_NAMES[m - 1]} ${y}`; };
export const shortDate = (s) => { const [y, m, d] = parseIso(s); return `${d} ${MONTH_SHORT[m - 1]} ${y}`; };

export const nowHHMM = (timeZone, date = new Date()) => new Intl.DateTimeFormat('en-GB', {
  timeZone: timeZone || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(date);

/*
 * Hours are shown as time, not decimals: 8.75 is 8h 45m. Two forms:
 *   fmtDur   - words, where there's room (cards, notes): "8h 45m", "45m", "8h"
 *   fmtClock - compact, for tight columns (grid, year list): "8:45", "113:55"
 * Both round to the nearest minute. Where a gap sits beside the figures it
 * comes from, take it from the rounded minutes (minutes()) so they add up.
 */

/** Hours as whole minutes. */
export const minutes = (h) => Math.round((h || 0) * 60 + 1e-9);

/** "8h 45m", "8h", "45m", "0m"; "1,234h 5m" past a thousand. Negative input shows its size only. */
export function fmtDur(h) {
  const m = Math.abs(minutes(h));
  const hh = Math.floor(m / 60), mm = m % 60;
  if (!hh) return `${mm}m`;
  const hs = hh.toLocaleString('en-AU');
  return mm ? `${hs}h ${mm}m` : `${hs}h`;
}

/** "8:45", "0:45", "113:55". Negative input shows its size only. */
export function fmtClock(h) {
  const m = Math.abs(minutes(h));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}

/** fmtDur with the numbers big and the h/m small, for a card's headline figure. */
export function durHtml(h) {
  return fmtDur(h).replace(/([\d,]+)([hm])/g, '$1<span class="unit">$2</span>');
}

/**
 * A typed duration in hours, or null if it isn't one. Takes 8:45, 8h 45m,
 * 8h, 45m, 845 (as 8:45), 8 (hours) and decimals like 8.75.
 */
export function parseHours(raw) {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) return Number(m[2]) < 60 ? Number(m[1]) + Number(m[2]) / 60 : null;
  if ((m = s.match(/^(?:(\d{1,2}) ?h(?:rs?|ours?)?)? ?(?:(\d{1,2}) ?m(?:in(?:s|utes?)?)?)?$/)) && (m[1] || m[2])) {
    const mm = Number(m[2] || 0);
    return mm < 60 || !m[1] ? Number(m[1] || 0) + mm / 60 : null;
  }
  if ((m = s.match(/^\d+$/))) {
    // One or two digits are hours (so 30 is refused as too long, not misread);
    // three or four are hours and minutes, the way times are typed: 845 is 8:45.
    if (s.length <= 2) return Number(s);
    if (s.length <= 4 && Number(s.slice(-2)) < 60) return Number(s.slice(0, -2)) + Number(s.slice(-2)) / 60;
    return null;
  }
  if ((m = s.match(/^(\d{1,2})?[.,](\d+)$/))) return Number(`${m[1] || 0}.${m[2]}`);
  return null;
}

export const fmtNum = (n) => n.toLocaleString('en-AU', { maximumFractionDigits: 1 });
export const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1));
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/** A code's light and dark colour pairs as CSS variables, for an element with class "code". */
export const codeVars = (def) => `--c-bg:${def.bg};--c-fg:${def.fg};--c-dbg:${def.dbg};--c-dfg:${def.dfg}`;

/** When the running build was deployed, in the viewer's time: "29 Sep 20:28". */
export function builtAt(build) {
  const d = build ? new Date(build) : null;
  return d ? `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}` : 'unknown';
}
