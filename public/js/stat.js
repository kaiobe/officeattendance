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
    return block({ label, value: '—', sub: 'No work days yet', meter: bar(0, req, 'idle') });
  }
  const surplus = -s.gapDays;
  const sg = signed(surplus);
  return block({
    label,
    tag: s.futureWorkDays ? 'incl. planned' : '',
    value: `<span${belowTarget(s.pctDays, req) ? ' class="pct-low"' : ''}>${pct(s.pctDays)}<span class="unit">%</span></span>`,
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
  const why = `Office hours ahead (+) or short (−) of ${Math.round(req * 100)}% × (Office + Home days) × a ${fmtDur(std)} standard day`
    + (hasPlans ? ', counting the hours planned on days still to come' : ' to date');
  if (!work) return block({ label, tag, value: '—', sub: 'No work days yet', meter: bar(0, req, 'idle'), title: why });
  const office = plans ? s.projOfficeHrs : s.pastOfficeHrs;
  const need = plans ? s.projReqHrs : s.pastReqHrs;
  // From the rounded minutes, so "60h25m of 48h8m" and +12h17m add up.
  const surplus = (minutes(office) - minutes(need)) / 60;
  const sg = signed(surplus, fmtDur);
  const notes = [];
  notes.push(`${Math.round(req * 100)}% × ${work} work ${plural(work, 'day')} × ${fmtDur(std)}`);
  if (hasPlans) notes.push(`${fmtDur(s.plannedOfficeHrs)} planned`);
  if (hasPlans && s.pastWorkDays) notes.push(`so far ${signedHtml((minutes(s.pastOfficeHrs) - minutes(s.pastReqHrs)) / 60, fmtDur)}`);
  if (hasPlans && s.plannedUntimedOfficeDays) notes.push(`<span title="Planned office days with no times count as a standard ${fmtDur(std)} day">${s.plannedUntimedOfficeDays} est.</span>`);
  if (s.untimedPastOfficeDays) notes.push(`<span class="warn">${s.untimedPastOfficeDays} ${plural(s.untimedPastOfficeDays, 'day')} missing times</span>`);
  return block({
    label, tag, title: why,
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
  if (avg == null) return block({ label, value: '—', sub: `No office times yet · std ${fmtDur(std)}` });
  const d = signed((minutes(avg) - minutes(std)) / 60, fmtDur);
  return block({
    label,
    value: durHtml(avg),
    chip: `<span class="chip-delta zero" title="Against the standard ${fmtDur(std)} day">${d.text}</span>`,
    sub: `${s.pastTimedOfficeDays} completed ${plural(s.pastTimedOfficeDays, 'day')} · std ${fmtDur(std)}`,
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
