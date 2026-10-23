/**
 * The stat blocks every card is built from - desktop tiles, the phone's Today
 * card and Month tab - and the signed numbers used in the tables. One layout,
 * so the same figure reads the same way everywhere:
 *
 *   LABEL
 *   big number         (+ chip)
 *   one line of figures
 *   a note, only when something needs acting on
 *   bar with the target marked
 *
 * Ahead and short are a sign and a colour: +3h15m in green, −11h38m in red.
 * No helper text on the card: the working is on hover (title), which is also
 * what assistive tech and agents read.
 */
import { esc, fmtDur, durHtml, minutes, fmtNum, pct, plural } from './format.js';

const MINUS = '−';

/** A surplus as text and a class: +3.25 (pos), −11.63 (neg), 0 (zero). */
export function signed(n, fmt = fmtNum) {
  if (n == null || Math.abs(n) < 0.005 || fmt(Math.abs(n)) === fmt(0)) return { text: fmt(0), cls: 'zero' };
  return { text: `${n > 0 ? '+' : MINUS}${fmt(Math.abs(n))}`, cls: n > 0 ? 'pos' : 'neg' };
}

/** True when a share is below the target, compared as it's shown (1 dp). */
export const belowTarget = (v, req) => v != null && Number(pct(v)) < Math.round(req * 1000) / 10;

/** A percentage, in red when it's below the target. */
export const pctHtml = (v, req) => (v == null ? '—' : `<span${belowTarget(v, req) ? ' class="pct-low"' : ''}>${pct(v)}%</span>`);

/** A signed number as a coloured span. */
export const signedHtml = (n, fmt) => { const s = signed(n, fmt); return `<span class="num ${s.cls}">${s.text}</span>`; };

/** The bar: how far along, with the target marked. */
export function bar(value, target, cls) {
  const w = Math.max(0, Math.min(1, value || 0)) * 100;
  return `<div class="meter" title="Target ${Math.round(target * 100)}%"><div class="fill ${cls}" style="width:${w.toFixed(1)}%"></div>`
    + `<div class="target" style="left:${(target * 100).toFixed(1)}%"></div></div>`;
}

/** Office days: the percentage, with the days ahead or short beside it. */
export function daysStat(s, req, { label = 'Office days' } = {}) {
  if (!s.workDays) {
    return block({ label, value: '—', meter: bar(0, req, 'idle') });
  }
  const surplus = -s.gapDays;
  const sg = signed(surplus);
  // The why (target, working sick) is on hover; the card shows the figures.
  const why = `${fmtNum(s.officeDays)} office of ${fmtNum(s.workDays)} work days (Office + Home); target ${fmtNum(s.requiredOfficeDays)}`
    + (s.workingSickDays ? `. ${s.workingSickDays} working sick not counted` : '')
    + (s.futureWorkDays ? '. Includes days planned ahead' : '');
  return block({
    label, title: why,
    value: `<span${belowTarget(s.pctDays, req) ? ' class="pct-low"' : ''}>${pct(s.pctDays)}<span class="unit">%</span></span>`,
    chip: `<span class="chip-delta ${sg.cls}" title="Office days ahead (+) or short (−) of ${Math.round(req * 100)}%">${sg.text} d</span>`,
    sub: `${fmtNum(s.officeDays)} of ${fmtNum(s.workDays)} days`,
    meter: bar(s.pctDays, req, sg.cls === 'neg' ? 'critical' : 'good'),
  });
}

/**
 * Office hours against the target. So far by default: the days to date.
 * With plans: everything entered, hours planned on days still to come
 * included - what the period comes to if the plan holds (calc.js, withPlans).
 */
export function hoursStat(s, req, std, { plans = false, label = 'Office hours' } = {}) {
  const work = plans ? s.workDays : s.pastWorkDays;
  const hasPlans = plans && s.plannedWorkDays > 0;
  // The working is on hover; the card shows the figures and anything to act on.
  const why = `Office hours ahead (+) or short (−) of ${Math.round(req * 100)}% × ${work} work ${plural(work, 'day')} × ${fmtDur(std)}`
    + (hasPlans ? `, including ${fmtDur(s.plannedOfficeHrs)} planned` : ' to date')
    + (hasPlans && s.plannedUntimedOfficeDays ? `; ${s.plannedUntimedOfficeDays} planned ${plural(s.plannedUntimedOfficeDays, 'day')} without times counted as ${fmtDur(std)}` : '');
  if (!work) return block({ label, value: '—', meter: bar(0, req, 'idle'), title: why });
  const office = plans ? s.projOfficeHrs : s.pastOfficeHrs;
  const need = plans ? s.projReqHrs : s.pastReqHrs;
  // From the rounded minutes, so "60h25m of 48h8m" and +12h17m add up.
  const surplus = (minutes(office) - minutes(need)) / 60;
  const sg = signed(surplus, fmtDur);
  const notes = [];
  if (hasPlans && s.pastWorkDays) notes.push(`so far ${signedHtml((minutes(s.pastOfficeHrs) - minutes(s.pastReqHrs)) / 60, fmtDur)}`);
  if (s.untimedPastOfficeDays) notes.push(`<span class="warn">${s.untimedPastOfficeDays} ${plural(s.untimedPastOfficeDays, 'day')} missing times</span>`);
  return block({
    label, title: why,
    value: signedDurHtml(surplus),
    sub: `${fmtDur(office)} of ${fmtDur(need)}`,
    noteHtml: notes.join(' · '),
    meter: bar(plans ? s.projPctHrs : s.pastPctHrs, req, s.untimedPastOfficeDays ? 'warning' : sg.cls === 'neg' ? 'critical' : 'good'),
  });
}

/** A headline duration with its sign and colour: +12h17m, with the h and m small. */
function signedDurHtml(n) {
  const sg = signed(n, fmtDur);
  const sign = sg.cls === 'zero' ? '' : sg.text[0];
  return `<span class="num ${sg.cls}">${sign}${durHtml(sg.cls === 'zero' ? 0 : n)}</span>`;
}

/** Average day length: background information, so no bar and no colour. */
export function dayLengthStat(s, std, { label = 'Average day length' } = {}) {
  const avg = s.pastAvgHrsPerOfficeDay;
  if (avg == null) return block({ label, value: '—', title: `Standard day ${fmtDur(std)}` });
  const d = signed((minutes(avg) - minutes(std)) / 60, fmtDur);
  return block({
    label,
    value: durHtml(avg),
    title: `Average of ${s.pastTimedOfficeDays} completed office ${plural(s.pastTimedOfficeDays, 'day')}, against a ${fmtDur(std)} standard day`,
    chip: `<span class="chip-delta zero">${d.text}</span>`,
  });
}

function block({ label, value, chip = '', sub = '', note = '', noteHtml = '', meter = '', title = '' }) {
  return `<div class="stat-block"${title ? ` title="${esc(title)}"` : ''}>
    <div class="stat-head"><span class="stat-label">${label}</span></div>
    <div class="stat-value"><span class="v">${value}</span>${chip}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    ${note || noteHtml ? `<div class="stat-note">${noteHtml || esc(note)}</div>` : ''}
    ${meter}
  </div>`;
}
