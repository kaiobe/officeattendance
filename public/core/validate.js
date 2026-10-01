/**
 * Every value that arrives from outside - a request, or a backup file being
 * restored - goes through one of these before it touches the database. A bad
 * value is refused with a 400 that says what was wrong, never coerced into
 * something plausible and stored.
 */
import { HttpError } from './errors.js';
import { VALID } from './codes.js';
import { isRealDate, isTime } from '../lib/dates.js';
import { isSettingKey } from './settings.js';
import { STATES } from './holidays.js';

const bad = (msg) => new HttpError(400, msg);

export { isTime };

export function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad(`${label} must be a JSON object`);
  return value;
}

function numberValue(value, label) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    throw bad(`${label} must be a number`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw bad(`${label} must be a number`);
  return n;
}

/** A financial year number, or null when the value isn't a whole number. */
export function asFy(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (String(raw).trim() === '') return null;
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
 * One day's record, ready to store. Null or an explicitly empty code clears it;
 * a malformed record must never be mistaken for an instruction to delete data.
 * Clearing uses clearedValue - the calendar's own code for that date.
 */
export function parseDay(rec, date, clearedValue) {
  if (rec === null) return clearedValue(date);
  requireObject(rec, `record for ${date}`);
  if (!Object.hasOwn(rec, 'code')) throw bad(`missing code for ${date}`);
  if (rec.code === null || rec.code === '') return clearedValue(date);
  if (typeof rec.code !== 'string') throw bad(`code for ${date} must be text`);
  const code = rec.code.toUpperCase();
  if (!VALID.has(code)) throw bad(`unknown code: ${code}`);
  if (rec.comment != null && typeof rec.comment !== 'string') throw bad(`comment for ${date} must be text`);
  return {
    code,
    in: optionalTime(rec.in, 'in'),
    out: optionalTime(rec.out, 'out'),
    comment: rec.comment ? String(rec.comment).slice(0, 500) : null,
  };
}

const RULES = {
  stdDayHours: (v) => {
    const n = numberValue(v, 'standard day');
    if (v === '' || v == null || !Number.isFinite(n) || n <= 0 || n > 24) throw bad('standard day must be between 0 and 24 hours');
    return n;
  },
  officeReqPct: (v) => {
    const n = numberValue(v, 'office requirement');
    if (v === '' || v == null || !Number.isFinite(n) || n < 0 || n > 1) throw bad('office requirement must be between 0% and 100%');
    return n;
  },
  nonWorkingWeekday: (v) => {
    const n = numberValue(v, 'non-working weekday');
    if (!Number.isInteger(n) || n < -1 || n > 6) throw bad('non-working weekday must be -1 (none) or 0-6');
    return n;
  },
  lastFy: (v) => {
    if (v == null) return null;
    const n = numberValue(v, 'lastFy');
    if (!Number.isInteger(n) || n < 1 || n > 99) throw bad('lastFy must be a financial year number');
    return n;
  },
  holidayState: (v) => {
    if (typeof v !== 'string') throw bad('state must be text');
    const k = v.toUpperCase();
    if (!Object.hasOwn(STATES, k)) throw bad(`state must be one of ${Object.keys(STATES).join(', ')}`);
    return k;
  },
  defaultIn: (v) => { if (!isTime(v)) throw bad('default in time must be HH:MM'); return v; },
  defaultOut: (v) => { if (!isTime(v)) throw bad('default out time must be HH:MM'); return v; },
};

/** The recognised settings in body, validated. Unknown keys are ignored. */
export function parseSettings(body = {}) {
  const patch = {};
  requireObject(body, 'settings');
  for (const [k, v] of Object.entries(body)) {
    if (isSettingKey(k) && Object.hasOwn(RULES, k)) patch[k] = RULES[k](v);
  }
  return patch;
}
