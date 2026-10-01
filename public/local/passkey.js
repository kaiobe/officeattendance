/**
 * Passkeys for cloud backup: restore on a new phone with Face ID or a
 * fingerprint instead of typing the recovery code.
 *
 * A passkey can give this site a secret of its own (the WebAuthn PRF
 * extension): the same 32 bytes on every device the passkey syncs to, and
 * never stored by the site. From that secret, HKDF-SHA-256 derives
 *   - a lookup id, and
 *   - an AES-GCM key that locks the recovery code.
 * The locked code is kept by the Worker under the lookup id (/sync/key/<id>).
 * Restoring asks for any passkey this site made, derives the same two things,
 * fetches the locked code and unlocks it - then it's an ordinary code restore.
 *
 * So the recovery code is still what the backup hangs on, and still the way
 * back when a passkey can't help (a move between iPhone and Android, say).
 * Nothing about it is checked server-side: without the passkey, the id can't
 * be worked out and the locked code can't be opened.
 *
 * The passkey belongs to the address the page is served from, so it only works
 * there.
 */
import { normaliseCode } from './cloud.js';

const enc = new TextEncoder();
const RENEW_MS = 30 * 86400000;           // re-save the locked codes monthly, so they don't expire

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const random = (n) => crypto.getRandomValues(new Uint8Array(n));

/** What the passkey is asked to turn into its secret. Fixed, so every device gets the same answer. */
const prfSalt = () => crypto.subtle.digest('SHA-256', enc.encode('office-attendance passkey prf v1'));

/** The lookup id and the key that locks the code, from a passkey's secret. */
export async function deriveFromSecret(secret) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = enc.encode('office-attendance');
  const lookup = hex(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('passkey-lookup') }, base, 256));
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('passkey-key') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { lookup, key };
}

export async function lockCode(key, code) {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ code })));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}

export async function unlockCode(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return normaliseCode(JSON.parse(new TextDecoder().decode(pt)).code);
}

/** The passkey's user id: the same for a code, so making another on the same phone replaces the old one. */
async function userIdFor(code) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code.replace(/-/g, '')), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('office-attendance'), info: enc.encode('passkey-user') }, base, 128));
}

/**
 * Whether this browser can do passkeys at all, and doesn't say outright that it
 * can't do the secret. A "yes" isn't a promise: adding a passkey proves it.
 */
export async function passkeysAvailable(win = globalThis) {
  if (!win.PublicKeyCredential || !win.isSecureContext || !win.navigator?.credentials?.create) return false;
  try {
    const caps = await win.PublicKeyCredential.getClientCapabilities?.();
    if (caps && caps['extension:prf'] === false) return false;
  } catch { /* no capabilities API: find out by trying */ }
  return true;
}

/** A failed passkey prompt, in words. */
function explain(e, what) {
  if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') {
    return what === 'add' ? 'No passkey was saved.' : 'No passkey was used: cancelled, or none on this device for Office Attendance. Use your recovery code instead.';
  }
  if (e?.name === 'InvalidStateError') return 'This device already has a passkey for your backup.';
  if (e?.name === 'SecurityError') return 'Passkeys only work on the app\'s own address, over https.';
  return e?.message || String(e);
}

/**
 * Passkeys for one phone. `store` keeps the list in its meta (each entry has
 * the credential id, lookup id and locked code - nothing that opens anything);
 * `cloud` is cloud.js's engine, for the current code.
 */
export function createPasskeys({
  store, cloud, onChange = () => {},
  fetchImpl = (...a) => fetch(...a), base = '',
  credentials = () => globalThis.navigator.credentials,
  signal = (o) => globalThis.PublicKeyCredential?.signalUnknownCredential?.(o),
  rpId = () => globalThis.location?.hostname,
} = {}) {
  const list = () => store.getMeta('passkeys') || [];
  const save = (l) => { store.setMeta('passkeys', l); onChange(); };

  /** Ask a passkey for its secret. `ids` limits which passkeys; none means any this site made. */
  async function secretFrom(ids) {
    const cred = await credentials().get({
      publicKey: {
        challenge: random(32),
        userVerification: 'required',
        timeout: 120000,
        ...(ids ? { allowCredentials: ids.map((id) => ({ type: 'public-key', id: unb64url(id) })) } : {}),
        extensions: { prf: { eval: { first: await prfSalt() } } },
      },
    });
    const first = cred?.getClientExtensionResults?.().prf?.results?.first;
    return { id: cred && b64url(cred.rawId), secret: first ? new Uint8Array(first) : null };
  }

  const keyUrl = (lookup) => `${base}/sync/key/${lookup}`;
  const putBox = (lookup, box) => fetchImpl(keyUrl(lookup), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(box) });

  /** Make a passkey that unlocks the current recovery code. Resolves to its entry; throws an Error in words. */
  async function add() {
    const code = cloud.status().code;
    if (!code) throw new Error('Turn on cloud backup first.');
    let cred;
    try {
      cred = await credentials().create({
        publicKey: {
          rp: { name: 'Office Attendance' },
          user: { id: await userIdFor(code), name: 'Attendance backup', displayName: 'Office Attendance backup' },
          challenge: random(32),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
          excludeCredentials: list().map((p) => ({ type: 'public-key', id: unb64url(p.id) })),
          attestation: 'none',
          timeout: 120000,
          extensions: { prf: { eval: { first: await prfSalt() } } },
        },
      });
    } catch (e) { throw new Error(explain(e, 'add')); }
    const id = b64url(cred.rawId);
    const prf = cred.getClientExtensionResults?.().prf || {};
    let secret = prf.results?.first ? new Uint8Array(prf.results.first) : null;
    // Some phones only give the secret when the passkey is used, not when it's made.
    if (!secret && prf.enabled !== false) {
      try { secret = (await secretFrom([id])).secret; } catch (e) { await forgetCredential(id); throw new Error(explain(e, 'add')); }
    }
    if (!secret) {
      await forgetCredential(id);
      throw new Error("This device's passkeys can't unlock a backup. Keep your recovery code safe instead.");
    }
    const { lookup, key } = await deriveFromSecret(secret);
    const box = await lockCode(key, code);
    // Prove the round trip before saying it worked.
    try {
      const put = await putBox(lookup, box);
      if (!put.ok) throw new Error((await put.json().catch(() => ({}))).error || `HTTP ${put.status}`);
      const got = await fetchImpl(keyUrl(lookup));
      if (!got.ok || (await unlockCode(key, await got.json())) !== code) throw new Error('the saved passkey backup didn\'t open');
    } catch (e) {
      await forgetCredential(id);
      throw new Error(e instanceof TypeError ? "Couldn't reach the backup. Check your connection and try again." : `Couldn't save the passkey: ${e.message}`);
    }
    const entry = { id, lookup, box, added: Date.now() };
    save([...list().filter((p) => p.id !== id), entry]);
    store.setMeta('passkeysRenewed', Date.now());
    return entry;
  }

  /**
   * Use a passkey to get the recovery code back. Resolves to { code, entry };
   * the caller restores with the code, then remember(entry).
   */
  async function recover() {
    let got;
    try { got = await secretFrom(null); } catch (e) { throw new Error(explain(e, 'use')); }
    if (!got.secret) throw new Error("That passkey can't unlock a backup on this device. Use your recovery code instead.");
    const { lookup, key } = await deriveFromSecret(got.secret);
    let res;
    try { res = await fetchImpl(keyUrl(lookup), { headers: { accept: 'application/json' } }); }
    catch { throw new Error("Couldn't reach the backup. Check your connection and try again."); }
    if (res.status === 404) throw new Error('That passkey has no backup any more (it was removed, or cloud backup was turned off). Use your recovery code instead.');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const box = await res.json();
    let code;
    try { code = await unlockCode(key, box); } catch { code = null; }
    if (!code) throw new Error("That passkey's backup couldn't be opened. Use your recovery code instead.");
    return { code, entry: { id: got.id, lookup, box, added: Date.now() } };
  }

  /** Keep a passkey that was just used to restore, so Settings lists it. */
  function remember(entry) {
    save([...list().filter((p) => p.id !== entry.id), entry]);
  }

  /** Tell the passkey manager a passkey is no use any more, where the browser supports it. */
  async function forgetCredential(id) {
    try { await signal({ rpId: rpId(), credentialId: id }); } catch { /* not supported: it stays in the manager, harmlessly */ }
  }

  /** Remove one passkey: its locked code goes, and the passkey manager is told. */
  async function remove(id) {
    const p = list().find((x) => x.id === id);
    if (p) { try { await fetchImpl(keyUrl(p.lookup), { method: 'DELETE' }); } catch { /* offline: it expires on its own */ } }
    await forgetCredential(id);
    save(list().filter((x) => x.id !== id));
  }

  /** Remove them all - when the code they unlock is turned off or replaced. */
  async function removeAll() {
    for (const p of list()) await remove(p.id);
  }

  /** Stop listing them here, leaving their locked codes - when this phone moves to another code. */
  function forgetAll() { save([]); }

  /** Re-save each locked code now and then, so a passkey that's kept doesn't expire with it. */
  async function renew() {
    const last = store.getMeta('passkeysRenewed') || 0;
    if (!list().length || Date.now() - last < RENEW_MS) return;
    try {
      for (const p of list()) await putBox(p.lookup, p.box);
      store.setMeta('passkeysRenewed', Date.now());
    } catch { /* offline: next time */ }
  }

  return { list, add, recover, remember, remove, removeAll, forgetAll, renew };
}
