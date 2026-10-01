/**
 * The standalone app's storage: the same methods as the server's SQLite store
 * (sqliteStore in server/db.js), kept in the browser's localStorage on this
 * device and nowhere else.
 *
 * localStorage is synchronous, like node:sqlite, so the shared service runs
 * unchanged over it. Everything lives under one key as a single JSON document,
 * written after each change. A year is about 30 KB, far inside the browser's
 * few megabytes. A transaction snapshots the document first and puts it back
 * if anything inside throws, so a refused change leaves nothing half-written.
 */
import { DEFAULT_SETTINGS, isSettingKey } from '../core/settings.js';
import { requireObject } from '../core/validate.js';
import { isLoggedDay } from '../core/calendar.js';

const EMPTY = () => ({ settings: {}, days: {}, meta: {} });

export function localStore({ key = 'office-attendance', storage, defaults = {} } = {}) {
  const backing = () => storage ?? globalThis.localStorage;
  let doc = EMPTY();
  let lastRaw;
  let depth = 0;

  function sync() {
    if (depth > 0) return;
    const raw = backing().getItem(key);
    if (raw === lastRaw) return;
    try {
      const parsed = raw === null ? EMPTY() : requireObject(JSON.parse(raw), 'saved attendance');
      const loaded = { ...EMPTY(), ...parsed };
      for (const k of ['settings', 'days', 'meta']) requireObject(loaded[k], `saved ${k}`);
      for (const r of Object.values(loaded.days)) requireObject(r, 'saved day');
      doc = loaded;
      lastRaw = raw;
    } catch {
      throw new Error("Saved attendance couldn't be read. Your original data has been kept; download it before restoring a backup.");
    }
  }

  function transaction(fn) {
    sync();
    const snapshot = JSON.stringify(doc);
    const outer = depth === 0;
    depth++;
    try {
      const out = fn();
      if (outer) {
        const next = JSON.stringify(doc);
        if (next !== lastRaw) {
          try { backing().setItem(key, next); }
          catch (e) { throw new Error(`couldn't save on this device: ${e.message}`); }
          lastRaw = next;
        }
      }
      return out;
    } catch (e) {
      doc = JSON.parse(snapshot);
      throw e;
    } finally {
      depth--;
    }
  }
  // Every mutation rolls back if persistence fails, including settings/meta
  // outside a service call. Existing transactions write only once at the end.
  const change = (fn) => depth ? fn() : transaction(fn);
  const sortedDates = () => Object.keys(doc.days).sort();

  return {
    getSettings() {
      sync();
      const out = { ...DEFAULT_SETTINGS, ...defaults };
      for (const [k, v] of Object.entries(doc.settings)) if (isSettingKey(k)) out[k] = v;
      return out;
    },
    setSettings(patch) {
      return change(() => {
        for (const [k, v] of Object.entries(patch)) if (isSettingKey(k)) doc.settings[k] = v;
        return this.getSettings();
      });
    },
    getDays(from, to) {
      sync();
      const out = {};
      for (const d of sortedDates()) if (d >= from && d <= to) out[d] = { ...doc.days[d] };
      return out;
    },
    getAllDays() {
      sync();
      const out = {};
      for (const d of sortedDates()) out[d] = { ...doc.days[d] };
      return out;
    },
    getDaySummaries() {
      sync();
      return Object.entries(doc.days).map(([date, r]) => ({ date, code: r.code, in_time: r.in, out_time: r.out, comment: r.comment }));
    },
    upsertDay(date, rec) {
      change(() => {
        if (rec == null || rec.code == null || rec.code === '') delete doc.days[date];
        else doc.days[date] = { code: rec.code, in: rec.in || null, out: rec.out || null, comment: rec.comment || null };
      });
    },
    deleteDaysBetween(from, to) {
      change(() => { for (const d of Object.keys(doc.days)) if (d >= from && d <= to) delete doc.days[d]; });
    },
    deleteAllDays() {
      change(() => { doc.days = {}; });
    },
    transaction,

    /* Beyond the shared interface: small bookkeeping for the standalone app. */
    getMeta(k) { sync(); return doc.meta[k]; },
    setMeta(k, v) { change(() => { doc.meta[k] = v; }); },
    raw: () => backing().getItem(key),
    /** Anything logged at all - a day that isn't just the calendar's. */
    hasEntries() { return this.getDaySummaries().some(isLoggedDay); },
  };
}
