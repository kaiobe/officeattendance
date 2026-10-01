/**
 * 24-hour time boxes.
 *
 * The browser's own <input type="time"> shows 12- or 24-hour time depending on
 * the computer's language settings, and nothing a page does can override it.
 * So times are plain text boxes (class "time24") that always read HH:MM on a
 * 24-hour clock, whatever the device.
 *
 * Whatever is typed is tidied when the box is left: "930", "9:30", "9.30" and
 * "9:30am" all become 09:30; "1745", "17:45" and "5:45pm" become 17:45; "9"
 * becomes 09:00. Something that isn't a time puts the box back as it was and
 * says why, so the rest of the page only ever sees a proper HH:MM or nothing -
 * the same contract <input type="time"> had.
 */
import { flash } from './dialogs.js';
export { isTime } from '../lib/dates.js';

const pad = (n) => String(n).padStart(2, '0');

/** A typed time as HH:MM, '' for an empty box, or null when it isn't a time. */
export function normaliseTime(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  const pm = /p/.test(s), am = /a/.test(s);
  s = s.replace(/\s*(am|pm|a|p)\.?$/, '').replace(/[.\-h ]/g, ':');
  if (!/^\d{1,2}(:\d{1,2})?$|^\d{3,4}$/.test(s)) return null;
  let h, m;
  if (s.includes(':')) [h, m] = s.split(':').map(Number);
  else if (s.length <= 2) [h, m] = [Number(s), 0];
  else [h, m] = [Number(s.slice(0, -2)), Number(s.slice(-2))];
  if (pm || am) {
    if (h < 1 || h > 12) return null;
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
  }
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/**
 * Tidy every .time24 box on the page as it's committed. Listens at the
 * document in the capture phase, so the tidy value is in place before any
 * box's own change handler runs - and a value that isn't a time never
 * reaches it at all.
 */
export function installTimeFields() {
  const isField = (el) => el?.classList?.contains('time24');

  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) e.target.dataset.last = e.target.value;
  }, true);

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!isField(el)) return;
    const t = normaliseTime(el.value);
    if (t === null) {
      e.stopPropagation();
      el.value = el.dataset.last ?? '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      flash(`Times are 24-hour, like 09:30 or 17:45`, true);
      return;
    }
    el.value = t;
    el.dataset.last = t;
  }, true);

  // A text box doesn't commit on Enter by itself; make it, as the time picker did.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && isField(e.target)) e.target.blur();
  }, true);
}
