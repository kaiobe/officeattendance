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
