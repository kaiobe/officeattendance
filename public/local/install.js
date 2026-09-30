/**
 * The standalone version: the whole app in the browser, with each person's
 * data kept on their own device. No server, no account.
 *
 * It answers the page's API calls with the same shared service the server
 * uses (public/core/service.js), over localStorage (store.js), and adds what a
 * phone-only app needs: a first-run setup, saving and sharing exports, asking
 * the browser to keep the data, a backup reminder, and working offline.
 */
import { localStore } from './store.js';
import { createService, Download } from '../core/service.js';
import { STATES } from '../core/holidays.js';
import { runtime } from '../js/state.js';
import { $, plural } from '../js/format.js';
import { flash } from '../js/dialogs.js';
import { pad } from '../lib/dates.js';

/** Stamped by scripts/build-standalone.mjs with the time of the build. */
const BUILD = 0;

const DAY = 86400000;

/** Today where the phone is. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();

/** A first guess at the state from the phone's time zone. Canberra shares Sydney's, so the ACT has to be picked. */
function guessState(tz) {
  const zone = tz.replace(/^Australia\//, '');
  return {
    Sydney: 'NSW', NSW: 'NSW', ACT: 'ACT', Canberra: 'ACT', Melbourne: 'VIC', Victoria: 'VIC',
    Brisbane: 'QLD', Lindeman: 'QLD', Queensland: 'QLD', Adelaide: 'SA', South: 'SA',
    Perth: 'WA', West: 'WA', Hobart: 'TAS', Tasmania: 'TAS', Currie: 'TAS',
    Darwin: 'NT', North: 'NT', Broken_Hill: 'NSW', Yancowinna: 'NSW',
  }[zone] || 'VIC';
}

/** A new phone's starting point: a standard five-day, 38-hour week. */
const NEW_PHONE = Object.freeze({
  stdDayHours: 7.6, officeReqPct: 0.5, nonWorkingWeekday: -1,
  defaultIn: '09:00', defaultOut: '17:00', holidayState: guessState(TZ),
});

export function installLocal() {
  const store = localStore({ defaults: NEW_PHONE });
  const service = createService({
    store,
    today: localToday,
    tz: TZ,
    versionInfo: () => ({ version: runtime.appVersion, build: BUILD || null, buildUtc: BUILD ? new Date(BUILD).toISOString() : null }),
  });

  runtime.local = true;
  document.documentElement.dataset.mode = 'standalone';

  // The API, answered here. Results go through JSON so the page gets exactly
  // what it would from the server, and can't reach into the store's objects.
  runtime.transport = async (method, path, body) => {
    const url = new URL(path, 'http://local');
    const route = service.route(method, url.pathname);
    if (!route) throw new Error(`no such endpoint: ${method} ${url.pathname}`);
    const out = route({ query: url.searchParams, body: body ?? {} });
    if (out instanceof Download) return out;
    if (method !== 'GET') store.setMeta('lastChange', Date.now());
    return JSON.parse(JSON.stringify(out));
  };

  runtime.saveFile = async (path) => {
    const file = await runtime.transport('GET', path, {});
    const saved = await saveOrShare(file);
    if (saved && path.startsWith('/api/export.json')) {
      store.setMeta('lastBackup', Date.now());
      $('backupNudge').hidden = true;
      flash('Backup saved');
    }
  };

  runtime.beforeLoad = async () => {
    if (!store.getMeta('setupDone')) await welcome(store);
  };

  runtime.afterLoad = () => {
    keepData(store);
    nudge(store);
    registerServiceWorker();
  };

  $('dataWhere').textContent = 'Your data is kept only in this browser on this device.';
}

/* ---------- saving exports ---------- */

/**
 * On a phone, the share sheet is the natural way to put a file somewhere -
 * Files, Drive, an email to yourself. Elsewhere, a plain download. Resolves
 * true when the file was handed over.
 */
async function saveOrShare({ type, filename, body }) {
  const file = new File([body], filename, { type });
  const phone = matchMedia('(pointer: coarse)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;       // they closed the sheet
      // anything else: fall through to a download
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

/* ---------- first run ---------- */

function welcome(store) {
  const dlg = $('welcomeDlg');
  const s = store.getSettings();
  $('wState').innerHTML = Object.entries(STATES).map(([k, name]) => `<option value="${k}">${name}</option>`).join('');
  $('wState').value = s.holidayState;
  $('wNw').value = String(s.nonWorkingWeekday);
  $('wStd').value = s.stdDayHours;
  $('wReq').value = Math.round(s.officeReqPct * 100);
  $('wIn').value = s.defaultIn;
  $('wOut').value = s.defaultOut;
  $('installTip').hidden = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  return new Promise((resolve) => {
    const done = () => {
      store.setMeta('setupDone', new Date().toISOString());
      store.setMeta('firstUse', Date.now());
      dlg.close();
      resolve();
    };
    // Setup has to be finished (or a backup restored) - there's nothing to go back to.
    dlg.addEventListener('cancel', (e) => e.preventDefault());

    $('welcomeStart').onclick = async () => {
      $('welcomeErr').textContent = '';
      try {
        await runtime.transport('PUT', '/api/settings', {
          holidayState: $('wState').value,
          nonWorkingWeekday: Number($('wNw').value),
          stdDayHours: Number($('wStd').value),
          officeReqPct: Number($('wReq').value) / 100,
          defaultIn: $('wIn').value || NEW_PHONE.defaultIn,
          defaultOut: $('wOut').value || NEW_PHONE.defaultOut,
        });
        done();
      } catch (e) {
        $('welcomeErr').textContent = e.message;
      }
    };

    // Moving to a new phone: bring the old one's backup across instead.
    $('welcomeRestore').onclick = () => $('importFile').click();
    const pick = async (e) => {
      if (!dlg.open) return;
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      e.stopImmediatePropagation();          // the Settings restore handler is for later
      $('welcomeErr').textContent = '';
      try {
        const backup = JSON.parse(await f.text());
        if (!backup || typeof backup.days !== 'object') throw new Error("that file isn't a backup from this app");
        const r = await runtime.transport('POST', '/api/import', { days: backup.days, settings: backup.settings });
        store.setMeta('lastBackup', Date.now());
        done();
        flash(`Restored ${r.imported} ${plural(r.imported, 'day')}`);
      } catch (err) {
        $('welcomeErr').textContent = `Couldn't restore: ${err.message}`;
      }
    };
    $('importFile').addEventListener('change', pick, { capture: true });

    dlg.showModal();
  });
}

/* ---------- keeping the data ---------- */

/**
 * Browsers may clear a site's storage when space runs low, and Safari clears
 * sites you haven't opened for a few weeks unless they're on the home screen.
 * Asking for persistent storage opts out where the browser allows it. The
 * outcome is shown in Settings, so it's never a surprise.
 */
async function keepData(store) {
  let kept = false;
  try {
    kept = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch { /* not supported */ }
  const onHome = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const el = $('storageNote');
  el.hidden = false;
  el.textContent = kept
    ? 'This device keeps your data permanently. A backup is still your copy if the phone is lost or reset.'
    : onHome
      ? 'Your data is kept on this device. Back up now and then: it\'s your only copy if the phone is lost or reset.'
      : 'The browser may clear your data if you don\'t use the app for a while. Add it to your home screen, and back up now and then.';
  store.setMeta('persisted', kept);
}

/**
 * A gentle reminder at the top of the page: a week after starting with
 * nothing backed up, and a month after the last backup. "Later" puts it off
 * for a week.
 */
function nudge(store) {
  const now = Date.now();
  const last = store.getMeta('lastBackup');
  const since = last || store.getMeta('firstUse') || now;
  const due = store.hasEntries() && now - since > (last ? 30 : 7) * DAY;
  const snoozed = now < (store.getMeta('nudgeSnoozeUntil') || 0);
  const el = $('backupNudge');
  el.hidden = !due || snoozed;
  if (el.hidden) return;
  $('nudgeText').textContent = last
    ? `Your last backup was ${Math.floor((now - last) / DAY)} days ago. Your attendance is only on this phone, so save a fresh copy.`
    : "Your attendance is only on this phone. Save a backup so a lost or reset phone doesn't lose it.";
  $('nudgeBackup').onclick = () => runtime.saveFile('/api/export.json');
  $('nudgeLater').onclick = () => { store.setMeta('nudgeSnoozeUntil', now + 7 * DAY); el.hidden = true; };
}

/* ---------- offline ---------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus, not a requirement */ });
}

