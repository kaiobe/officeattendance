/**
 * Cloud backup for the standalone version: an encrypted copy of this phone's
 * data, kept by the site's Worker (worker/index.js), restorable anywhere with
 * the recovery code.
 *
 * The recovery code is 16 characters - 80 random bits - shown as
 * XXXX-XXXX-XXXX-XXXX in Crockford base32 (no I, L, O or U, so it's hard to
 * misread; typing one of those is forgiven). From it, two things are derived
 * on the phone with HKDF-SHA-256:
 *   - the backup's id, which is all the server ever sees of the code, and
 *   - an AES-GCM key that encrypts the backup before it leaves the phone.
 * The server stores ciphertext it can't read. Lose the code and the backup
 * can't be opened by anyone - that's the point, and the setup says so.
 *
 * A backup goes up a few seconds after each change, so a run of edits is one
 * upload. With no signal it waits, and goes when the connection is back or the
 * app is next opened. Each upload names the revision it replaces, so if
 * another device has backed up to the same code since, this one stops and
 * asks rather than overwriting it.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DEBOUNCE_MS = 4000;
const enc = new TextEncoder();

/** A new recovery code: 16 random base32 characters, in fours. */
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => ALPHABET[b & 31]).join('');
  return chars.match(/.{4}/g).join('-');
}

/** A typed code as XXXX-XXXX-XXXX-XXXX, or null if it can't be one. Spaces, dashes and case don't matter. */
export function normaliseCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(s)) return null;
  return s.match(/.{4}/g).join('-');
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The backup id and encryption key a code stands for. */
export async function deriveFromCode(code) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code.replace(/-/g, '')), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = enc.encode('office-attendance');
  const id = hex(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('backup-id') }, base, 256));
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('backup-key') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { id, key };
}

export async function encryptBackup(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}

export async function decryptBackup(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/**
 * The backup engine for one phone. `store` keeps the code and status in its
 * meta; `snapshot()` returns the data to back up; `onChange()` is told when
 * the status changes, for Settings to redraw.
 */
export function createCloud({ store, snapshot, onChange = () => {}, fetchImpl = (...a) => fetch(...a), base = '' }) {
  let timer = null;
  let running = null;
  const meta = (k) => store.getMeta(k);
  const set = (k, v) => store.setMeta(k, v);

  const status = () => ({
    on: !!meta('cloudCode'),
    code: meta('cloudCode') || null,
    last: meta('cloudLast') || null,
    pending: !!meta('cloudPending'),
    error: meta('cloudError') || null,
    conflict: meta('cloudConflict') || null,
  });

  async function push({ force = false, keepalive = false } = {}) {
    const code = meta('cloudCode');
    if (!code) return status();
    if (meta('cloudConflict') && !force) return status();
    const { id, key } = await deriveFromCode(code);
    const box = await encryptBackup(key, await snapshot());
    let res;
    try {
      res = await fetchImpl(`${base}/sync/${id}`, {
        method: 'PUT', keepalive,
        headers: { 'content-type': 'application/json', 'if-match': force ? '*' : (meta('cloudRev') || 'new') },
        body: JSON.stringify(box),
      });
    } catch {
      set('cloudPending', true);
      set('cloudError', 'offline');
      onChange(status());
      return status();
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      set('cloudRev', body.rev);
      set('cloudLast', body.updated || Date.now());
      set('cloudPending', false);
      set('cloudError', null);
      set('cloudConflict', null);
    } else if (res.status === 409) {
      set('cloudConflict', { rev: body.rev, updated: body.updated || null });
      set('cloudPending', true);
    } else {
      set('cloudPending', true);
      set('cloudError', body.error || `HTTP ${res.status}`);
    }
    onChange(status());
    return status();
  }

  /** Back up soon: a few seconds after the last of a run of changes. */
  function schedule() {
    if (!meta('cloudCode')) return;
    set('cloudPending', true);
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; flush(); }, DEBOUNCE_MS);
  }

  /** Back up now, if anything's waiting. One upload at a time. */
  function flush(opts = {}) {
    clearTimeout(timer);
    timer = null;
    if (!meta('cloudCode') || !meta('cloudPending')) return Promise.resolve(status());
    if (running) return running.then(() => flush(opts));
    running = push(opts).finally(() => { running = null; });
    return running;
  }

  /** The backup a code points to, decrypted - or an Error saying why not. */
  async function fetchBackup(rawCode) {
    const code = normaliseCode(rawCode);
    if (!code) throw new Error("That isn't a recovery code. It's 16 letters and numbers, like K7QM-2XRP-9TVD-4HNA.");
    const { id, key } = await deriveFromCode(code);
    let res;
    try { res = await fetchImpl(`${base}/sync/${id}`, { headers: { accept: 'application/json' } }); }
    catch { throw new Error("Couldn't reach the backup. Check your connection and try again."); }
    if (res.status === 404) throw new Error('No backup found for that code. Check it and try again.');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const rev = (res.headers.get('etag') || '').replace(/"/g, '');
    let data;
    try { data = await decryptBackup(key, await res.json()); }
    catch { throw new Error("That backup couldn't be opened with this code."); }
    return { code, rev, data, updated: Number(res.headers.get('x-updated')) || null };
  }

  /** Start backing up under a code: a new one, or one just restored from. */
  function adopt(code, { rev = null, last = null } = {}) {
    set('cloudCode', code);
    set('cloudRev', rev);
    set('cloudLast', last);
    set('cloudConflict', null);
    set('cloudError', null);
    set('cloudPending', !rev);       // a new code has nothing up yet
    onChange(status());
  }

  /** Stop backing up, and remove the copy in the cloud. */
  async function turnOff() {
    const code = meta('cloudCode');
    if (code) {
      const { id } = await deriveFromCode(code);
      try { await fetchImpl(`${base}/sync/${id}`, { method: 'DELETE' }); } catch { /* offline: it expires on its own */ }
    }
    clearTimeout(timer);
    for (const k of ['cloudCode', 'cloudRev', 'cloudLast', 'cloudPending', 'cloudError', 'cloudConflict']) set(k, null);
    onChange(status());
  }

  return { status, schedule, flush, push, fetchBackup, adopt, turnOff };
}
