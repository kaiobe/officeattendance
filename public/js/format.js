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
 * Office hours against the target, for any summary (a month, month to date,
 * year to date, the year): the measure that matters for hours. Returns what
 * every view shows - the hours ahead or short, how it stands, and the figures
 * behind it - so they all say it the same way.
 *
 * By default it's so far: the days to date. With { plans: true } it counts
 * everything entered for the period, the hours planned on days still to come
 * included (see calc.js, withPlans) - what the period comes to if the plan holds.
 */
export function hoursVsTarget(s, reqPct, { plans = false } = {}) {
  const workDays = plans ? s.workDays : s.pastWorkDays;
  if (!workDays) return { empty: true, cls: 'idle', pill: 'No work days yet', word: '', abs: 0, tone: '' };
  const gap = plans ? s.projGapHrs : s.pastGapHrs;
  const pctHrs = plans ? s.projPctHrs : s.pastPctHrs;
  const g = gapWords(gap, fmtHrs2);
  const abs = Math.abs(gap);
  const word = g.cls === 'on' ? 'on target' : g.cls;          // 'ahead' | 'short' | 'on target'
  const missing = s.untimedPastOfficeDays;
  const cls = missing ? 'warning'
    : g.cls !== 'short' ? 'good'
    : pctHrs != null && pctHrs >= reqPct - 0.05 ? 'warning' : 'critical';
  const pill = missing ? `▲ ${missing} office ${plural(missing, 'day')} without times`
    : g.cls === 'short' ? `▼ ${fmtHrs2(abs)} h short` : g.cls === 'on' ? '● On target' : `● ${fmtHrs2(abs)} h ahead`;
  const tone = g.cls === 'short' ? 'gap-short-t' : g.cls === 'ahead' ? 'gap-ok-t' : '';   // colours the word
  // How the figure is made up - "68.25 done + 40.00 planned of 105.00 h needed" -
  // and, with plans, where things stand today.
  const planned = plans && s.plannedWorkDays > 0;
  const made = planned
    ? `${fmtHrs2(s.pastOfficeHrs)} done + ${fmtHrs2(s.plannedOfficeHrs)} planned of ${fmtHrs2(s.projReqHrs)} h needed`
    : plans ? `${fmtHrs2(s.projOfficeHrs)} of ${fmtHrs2(s.projReqHrs)} h needed`
    : `${fmtHrs2(s.pastOfficeHrs)} of ${fmtHrs2(s.pastReqHrs)} h needed`;
  const assumed = planned && s.plannedUntimedOfficeDays
    ? `${s.plannedUntimedOfficeDays} planned office ${plural(s.plannedUntimedOfficeDays, 'day')} without times counted as a standard day`
    : '';
  const sg = gapWords(s.pastGapHrs, fmtHrs2);
  const soFar = planned && s.pastWorkDays
    ? `So far: ${sg.cls === 'on' ? 'on target' : `${fmtHrs2(Math.abs(s.pastGapHrs))} h ${sg.cls}`}` : '';
  return { empty: false, cls, pill, word, abs, g, tone, pctHrs, planned, made, assumed, soFar };
}

/** A code's light and dark colour pairs as CSS variables, for an element with class "code". */
export const codeVars = (def) => `--c-bg:${def.bg};--c-fg:${def.fg};--c-dbg:${def.dbg};--c-dfg:${def.dfg}`;

/** When the running build was deployed, in the viewer's time: "29 Sep 20:28". */
export function builtAt(build) {
  const d = build ? new Date(build) : null;
  return d ? `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}` : 'unknown';
}
