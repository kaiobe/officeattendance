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

const EMPTY = () => ({ settings: {}, days: {}, meta: {} });

export function localStore({ key = 'office-attendance', storage = globalThis.localStorage, defaults = {} } = {}) {
  let doc = load();
  let depth = 0;

  function load() {
    try {
      const raw = storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') return { ...EMPTY(), ...parsed };
    } catch { /* unreadable: start empty rather than not at all */ }
    return EMPTY();
  }
  function save() {
    if (depth > 0) return;
    storage.setItem(key, JSON.stringify(doc));
  }
  const sortedDates = () => Object.keys(doc.days).sort();

  return {
    getSettings() {
      const out = { ...DEFAULT_SETTINGS, ...defaults };
      for (const [k, v] of Object.entries(doc.settings)) if (isSettingKey(k)) out[k] = v;
      return out;
    },
    setSettings(patch) {
      for (const [k, v] of Object.entries(patch)) if (isSettingKey(k)) doc.settings[k] = v;
      save();
      return this.getSettings();
    },
    getDays(from, to) {
      const out = {};
      for (const d of sortedDates()) if (d >= from && d <= to) out[d] = { ...doc.days[d] };
      return out;
    },
    getAllDays() {
      const out = {};
      for (const d of sortedDates()) out[d] = { ...doc.days[d] };
      return out;
    },
    getDaySummaries() {
      return Object.entries(doc.days).map(([date, r]) => ({ date, code: r.code, in_time: r.in, out_time: r.out }));
    },
    upsertDay(date, rec) {
      if (rec == null || rec.code == null || rec.code === '') delete doc.days[date];
      else doc.days[date] = { code: rec.code, in: rec.in || null, out: rec.out || null, comment: rec.comment || null };
      save();
    },
    deleteDaysBetween(from, to) {
      for (const d of Object.keys(doc.days)) if (d >= from && d <= to) delete doc.days[d];
      save();
    },
    deleteAllDays() {
      doc.days = {};
      save();
    },
    transaction(fn) {
      const snapshot = JSON.stringify(doc);
      depth++;
      let out;
      try { out = fn(); } catch (e) { depth--; doc = JSON.parse(snapshot); throw e; }
      depth--;
      // A write the browser refuses (storage full) must not leave memory ahead of storage.
      try { save(); } catch (e) { doc = JSON.parse(snapshot); throw new Error(`couldn't save on this device: ${e.message}`); }
      return out;
    },

    /* Beyond the shared interface: small bookkeeping for the standalone app. */
    getMeta: (k) => doc.meta[k],
    setMeta(k, v) { doc.meta[k] = v; save(); },
    /** Anything logged at all - a day that isn't just the calendar's. */
    hasEntries: () => Object.values(doc.days).some((r) => !['W', 'NW', 'PH'].includes(r.code) || r.in || r.out),
  };
}
