/**
 * The stat blocks every card is built from - desktop tiles, the phone's Today
 * card and Month tab - and the signed numbers used in the tables. One layout,
 * so the same figure reads the same way everywhere:
 *
 *   LABEL              tag
 *   big number         (+ chip)
 *   one line of figures
 *   a note, only when something needs flagging
 *   bar with the target marked
 *
 * Ahead and short are a sign and a colour: +3.25 in green, −11.63 in red.
 * The longer explanation is on hover (title), not on the card.
 */
import { esc, fmtHrs, fmtHrs2, fmtNum, pct, plural } from './format.js';

const MINUS = '−';

/** A surplus as text and a class: +3.25 (pos), −11.63 (neg), 0 (zero). */
export function signed(n, fmt = fmtNum) {
  if (n == null || Math.abs(n) < 0.005) return { text: fmt(0), cls: 'zero' };
  return { text: `${n > 0 ? '+' : MINUS}${fmt(Math.abs(n))}`, cls: n > 0 ? 'pos' : 'neg' };
}

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
    return block({ label, value: '—', sub: 'No work days yet', meter: bar(0, req, 'idle') });
  }
  const surplus = -s.gapDays;
  const sg = signed(surplus);
  return block({
    label,
    tag: s.futureWorkDays ? 'incl. planned' : '',
    value: `${pct(s.pctDays)}<span class="unit">%</span>`,
    chip: `<span class="chip-delta ${sg.cls}" title="Office days ahead (+) or short (−) of ${Math.round(req * 100)}%">${sg.text} d</span>`,
    sub: `${fmtNum(s.officeDays)} of ${fmtNum(s.workDays)} days · target ${fmtNum(s.requiredOfficeDays)}`,
    note: s.workingSickDays ? `${s.workingSickDays} working sick not counted` : '',
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
  const tag = hasPlans ? 'incl. planned' : '';
  const why = `Office hours ahead (+) or short (−) of ${Math.round(req * 100)}% × (Office + Home days) × a ${fmtHrs(std)} h standard day`
    + (hasPlans ? ', counting the hours planned on days still to come' : ' to date');
  if (!work) return block({ label, tag, value: '—', sub: 'No work days yet', meter: bar(0, req, 'idle'), title: why });
  const office = plans ? s.projOfficeHrs : s.pastOfficeHrs;
  const need = plans ? s.projReqHrs : s.pastReqHrs;
  const surplus = -(plans ? s.projGapHrs : s.pastGapHrs);
  const sg = signed(surplus, fmtHrs2);
  const notes = [];
  notes.push(`${Math.round(req * 100)}% × ${work} work ${plural(work, 'day')} × ${fmtHrs(std)} h`);
  if (hasPlans) notes.push(`${fmtHrs2(s.plannedOfficeHrs)} planned`);
  if (hasPlans && s.pastWorkDays) notes.push(`so far ${signedHtml(-s.pastGapHrs, fmtHrs2)}`);
  if (hasPlans && s.plannedUntimedOfficeDays) notes.push(`<span title="Planned office days with no times count as a standard ${fmtHrs(std)} h day">${s.plannedUntimedOfficeDays} est.</span>`);
  if (s.untimedPastOfficeDays) notes.push(`<span class="warn">${s.untimedPastOfficeDays} ${plural(s.untimedPastOfficeDays, 'day')} missing times</span>`);
  return block({
    label, tag, title: why,
    value: `<span class="num ${sg.cls}">${sg.text}</span><span class="unit">h</span>`,
    sub: `${fmtHrs2(office)} of ${fmtHrs2(need)} h`,
    noteHtml: notes.join(' · '),
    meter: bar(plans ? s.projPctHrs : s.pastPctHrs, req, s.untimedPastOfficeDays ? 'warning' : sg.cls === 'neg' ? 'critical' : 'good'),
  });
}

/** Average day length: background information, so no bar and no colour. */
export function dayLengthStat(s, std, { label = 'Average day length' } = {}) {
  const avg = s.pastAvgHrsPerOfficeDay;
  if (avg == null) return block({ label, value: '—', sub: `No office times yet · std ${fmtHrs(std)} h` });
  const d = signed(avg - std, fmtHrs2);
  return block({
    label,
    value: `${fmtHrs2(avg)}<span class="unit">h</span>`,
    chip: `<span class="chip-delta zero" title="Against the standard ${fmtHrs(std)} h day">${d.text}</span>`,
    sub: `${s.pastTimedOfficeDays} completed ${plural(s.pastTimedOfficeDays, 'day')} · std ${fmtHrs(std)} h`,
  });
}

function block({ label, tag = '', value, chip = '', sub = '', note = '', noteHtml = '', meter = '', title = '' }) {
  return `<div class="stat-block"${title ? ` title="${esc(title)}"` : ''}>
    <div class="stat-head"><span class="stat-label">${label}</span>${tag ? `<span class="stat-tag">${tag}</span>` : ''}</div>
    <div class="stat-value"><span class="v">${value}</span>${chip}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    ${note || noteHtml ? `<div class="stat-note">${noteHtml || esc(note)}</div>` : ''}
    ${meter}
  </div>`;
}
