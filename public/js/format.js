/** Formatting for display. Nothing here touches the page. */
import { MONTH_NAMES, MONTH_SHORT, pad, parseIso } from '../lib/dates.js';

export const $ = (id) => document.getElementById(id);

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const longDate = (s) => { const [y, m, d] = parseIso(s); return `${d} ${MONTH_NAMES[m - 1]} ${y}`; };
export const shortDate = (s) => { const [y, m, d] = parseIso(s); return `${d} ${MONTH_SHORT[m - 1]} ${y}`; };

export const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Hours for prose: trailing zeros dropped, so a figure reads "76 hrs" not "76.00 hrs". */
export const fmtHrs = (h) => (Math.round(h * 100) / 100).toLocaleString('en-AU', { maximumFractionDigits: 2 });

/**
 * Hours for the grid's columns, always to two places. Times are entered to the
 * quarter hour, so two places are exact - one place turns 1.75 into 1.8, a
 * number that was never worked.
 */
export const fmtHrs2 = (h) => h.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtNum = (n) => n.toLocaleString('en-AU', { maximumFractionDigits: 1 });
export const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1));
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/**
 * A gap to a target in words, the way the tiles say it: "2.5 ahead", "3
 * short", "on target". gap is target minus actual, so positive means short.
 */
export function gapWords(gap, fmt = (n) => (n % 1 === 0 ? String(n) : n.toFixed(1))) {
  if (Math.abs(gap) < 0.005) return { text: 'on target', cls: 'on' };
  return gap < 0 ? { text: `${fmt(-gap)} ahead`, cls: 'ahead' } : { text: `${fmt(gap)} short`, cls: 'short' };
}

/**
 * Office hours against the target, so far, for any summary (a month, month
 * to date, year to date, the year): the measure that matters for hours.
 * Returns what every view shows - the hours ahead or short, how it stands,
 * and the figures behind it - so they all say it the same way.
 */
export function hoursVsTarget(s, reqPct) {
  if (!s.pastWorkDays) return { empty: true, cls: 'idle', pill: 'No work days yet', word: '', abs: 0, tone: '' };
  const g = gapWords(s.pastGapHrs, fmtHrs2);
  const abs = Math.abs(s.pastGapHrs);
  const word = g.cls === 'on' ? 'on target' : g.cls;          // 'ahead' | 'short' | 'on target'
  const missing = s.untimedPastOfficeDays;
  const cls = missing ? 'warning'
    : g.cls !== 'short' ? 'good'
    : s.pastPctHrs != null && s.pastPctHrs >= reqPct - 0.05 ? 'warning' : 'critical';
  const pill = missing ? `▲ ${missing} office ${plural(missing, 'day')} without times`
    : g.cls === 'short' ? `▼ ${fmtHrs2(abs)} h short` : g.cls === 'on' ? '● On target' : `● ${fmtHrs2(abs)} h ahead`;
  const tone = g.cls === 'short' ? 'gap-short-t' : g.cls === 'ahead' ? 'gap-ok-t' : '';   // colours the word
  return { empty: false, cls, pill, word, abs, g, tone };
}

/** A code's light and dark colour pairs as CSS variables, for an element with class "code". */
export const codeVars = (def) => `--c-bg:${def.bg};--c-fg:${def.fg};--c-dbg:${def.dbg};--c-dfg:${def.dfg}`;

/** When the running build was deployed, in the viewer's time: "29 Sep 20:28". */
export function builtAt(build) {
  const d = build ? new Date(build) : null;
  return d ? `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}` : 'unknown';
}
