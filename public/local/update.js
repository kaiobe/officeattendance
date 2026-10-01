/**
 * Getting the newest release onto a phone.
 *
 * The offline cache (sw.js) serves one complete release, and a new one only
 * takes over once every copy of the app is closed - which a home-screen app
 * rarely is. So the app checks for itself: each build writes build.json, which
 * is never cached, and the page compares it with the build it's running.
 *
 *   - A newer release turns the version badge yellow (main.js), as the server
 *     version does when a page is out of date. Tapping it updates.
 *   - Settings › Check for updates does the same on demand.
 *
 * Updating starts clean: the offline cache and service worker are dropped and
 * the page is reloaded from the network. Attendance is in localStorage, which
 * this doesn't touch. It only ever happens with a connection - the check
 * fetches build.json first - so the app is never left with nothing to run
 * offline.
 */
const CACHE_PREFIX = 'attendance:';
const RECHECK_MS = 10 * 60 * 1000;

/** `version` is a function: the release this page is running. */
export function createUpdater({ build, version, onNews = () => {}, win = globalThis }) {
  let latest = null;
  let lastCheck = 0;

  /** The newest release on the site: { version, build }, or null with no connection. */
  async function fetchLatest() {
    try {
      const res = await win.fetch(`build.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const j = await res.json();
      return j && typeof j.build === 'number' ? j : null;
    } catch { return null; }
  }

  /** 'current', 'available' (with .latest) or 'offline'. Tells the page when a newer release appears. */
  async function check() {
    lastCheck = Date.now();
    if (win.navigator?.onLine === false) return { state: 'offline' };
    const got = await fetchLatest();
    if (!got) return { state: 'offline' };
    latest = got;
    const available = !!build && got.build > build;
    onNews(available ? got : null);
    return { state: available ? 'available' : 'current', latest: got };
  }

  /** Drop the offline copy and load the newest release. Only call with a connection (check() first). */
  async function apply() {
    try { win.sessionStorage.setItem('office-attendance:updated-from', version()); } catch { /* just no "Updated" note */ }
    try {
      for (const reg of (await win.navigator.serviceWorker?.getRegistrations?.()) || []) await reg.unregister();
    } catch { /* none */ }
    try {
      for (const k of await win.caches.keys()) if (k.startsWith(CACHE_PREFIX)) await win.caches.delete(k);
    } catch { /* no caches */ }
    const u = new URL(win.location.href);
    u.searchParams.set('v', Date.now());
    win.location.replace(u.toString());
  }

  /** Check, and update if there's something newer. Resolves to what check() found. */
  async function checkAndApply({ force = false } = {}) {
    const r = await check();
    if (r.state === 'available' || (force && r.state === 'current' && r.latest.build !== build)) await apply();
    return r;
  }

  /** Check now and then: on start, and coming back to the app after a while. */
  function watch() {
    check();
    win.document?.addEventListener('visibilitychange', () => {
      if (win.document.visibilityState === 'visible' && Date.now() - lastCheck > RECHECK_MS) check();
    });
    win.addEventListener?.('online', () => check());
  }

  /** After an update, the version it came from - once. */
  function updatedFrom() {
    try {
      const v = win.sessionStorage.getItem('office-attendance:updated-from');
      win.sessionStorage.removeItem('office-attendance:updated-from');
      return v;
    } catch { return null; }
  }

  return { check, apply, checkAndApply, watch, updatedFrom, latest: () => latest };
}
