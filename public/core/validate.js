/**
 * Every value that arrives from outside - a request, or a backup file being
 * restored - goes through one of these before it touches the database. A bad
 * value is refused with a 400 that says what was wrong, never coerced into
 * something plausible and stored.
 */
import { HttpError } from './errors.js';
import { VALID } from './codes.js';
import { isRealDate } from '../lib/dates.js';
import { isSettingKey } from './settings.js';
import { STATES } from './holidays.js';

const bad = (msg) => new HttpError(400, msg);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (s) => typeof s === 'string' && TIME.test(s);

/** A financial year number, or null when the value isn't a whole number. */
export function asFy(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export function requireDate(s) {
  if (!isRealDate(s)) throw bad(`bad date: ${s}`);
  return s;
}

/** "HH:MM", or null for none. */
function optionalTime(v, which) {
  if (v == null || v === '') return null;
  if (!isTime(v)) throw bad(`${which} time must be HH:MM`);
  return v;
}

/**
 * One day's record, ready to store. A missing code means "clear this day",
 * which is answered by clearedValue - the calendar's own code for that date.
 */
export function parseDay(rec, date, clearedValue) {
  if (rec == null || rec.code == null || rec.code === '') return clearedValue(date);
  if (typeof rec !== 'object') throw bad(`bad record for ${date}`);
  const code = String(rec.code).toUpperCase();
  if (!VALID.has(code)) throw bad(`unknown code: ${code}`);
  return {
    code,
    in: optionalTime(rec.in, 'in'),
    out: optionalTime(rec.out, 'out'),
    comment: rec.comment ? String(rec.comment).slice(0, 500) : null,
  };
}

const RULES = {
  stdDayHours: (v) => {
    const n = Number(v);
    if (v === '' || v == null || !Number.isFinite(n) || n <= 0 || n > 24) throw bad('standard day must be between 0 and 24 hours');
    return n;
  },
  officeReqPct: (v) => {
    const n = Number(v);
    if (v === '' || v == null || !Number.isFinite(n) || n < 0 || n > 1) throw bad('office requirement must be between 0% and 100%');
    return n;
  },
  nonWorkingWeekday: (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < -1 || n > 6) throw bad('non-working weekday must be -1 (none) or 0-6');
    return n;
  },
  lastFy: (v) => {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 99) throw bad('lastFy must be a financial year number');
    return n;
  },
  holidayState: (v) => {
    const k = String(v ?? '').toUpperCase();
    if (!Object.hasOwn(STATES, k)) throw bad(`state must be one of ${Object.keys(STATES).join(', ')}`);
    return k;
  },
  defaultIn: (v) => { if (!isTime(v)) throw bad('default in time must be HH:MM'); return v; },
  defaultOut: (v) => { if (!isTime(v)) throw bad('default out time must be HH:MM'); return v; },
};

/** The recognised settings in body, validated. Unknown keys are ignored. */
export function parseSettings(body) {
  const patch = {};
  if (body == null || typeof body !== 'object') return patch;
  for (const [k, v] of Object.entries(body)) {
    if (isSettingKey(k) && Object.hasOwn(RULES, k)) patch[k] = RULES[k](v);
  }
  return patch;
}
