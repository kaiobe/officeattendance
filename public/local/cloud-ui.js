/**
 * The screens for cloud backup (cloud.js does the work): the recovery code
 * shown once at setup, restoring from a code, and the status and controls in
 * Settings › Backup.
 */
import { createCloud, newCode, normaliseCode } from './cloud.js';
import { $, esc } from '../js/format.js';
import { flash, askConfirm } from '../js/dialogs.js';
import { S, loadState } from '../js/state.js';

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

export function setupCloud({ store, transport }) {
  let restoring = false;
  const cloud = createCloud({
    store,
    snapshot: async () => JSON.parse((await transport('GET', '/api/export.json')).body),
    onChange: render,
  });

  /* ---------- the recovery code, shown once ---------- */

  function showCode(code, { first = false } = {}) {
    const dlg = $('codeDlg');
    $('codeText').textContent = code;
    $('codeLead').hidden = !first;
    $('codeShare').hidden = !navigator.share;
    $('codeCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(code); flash('Recovery code copied'); }
      catch { flash('Select the code and copy it', true); }
    };
    $('codeShare').onclick = () => navigator.share({ title: 'Office Attendance recovery code', text: `Office Attendance recovery code: ${code}` }).catch(() => {});
    return new Promise((resolve) => {
      // The first time, it has to be acknowledged; later, Escape just closes it.
      const onCancel = (e) => {
        if (first) { e.preventDefault(); return; }
        dlg.removeEventListener('cancel', onCancel);
        resolve();
      };
      dlg.addEventListener('cancel', onCancel);
      $('codeDone').onclick = () => { dlg.removeEventListener('cancel', onCancel); dlg.close(); resolve(); };
      dlg.showModal();
    });
  }

  /* ---------- restoring from a code ---------- */

  /**
   * Ask for a code and bring that backup in, replacing what's on this phone.
   * Resolves true when something was restored. `file` is what "Use a backup
   * file instead" does.
   */
  function restoreDialog({ confirmReplace = false, file = null } = {}) {
    const dlg = $('restoreDlg');
    $('restoreErr').textContent = '';
    $('restoreCode').value = '';
    $('restoreFile').hidden = !file;
    return new Promise((resolve) => {
      const onCancel = () => { dlg.removeEventListener('cancel', onCancel); resolve(false); };
      dlg.addEventListener('cancel', onCancel);
      const finish = (v) => { dlg.removeEventListener('cancel', onCancel); dlg.close(); resolve(v); };
      $('restoreCancel').onclick = () => finish(false);
      $('restoreFile').onclick = () => { finish(false); file(); };
      $('restoreGo').onclick = async () => {
        $('restoreErr').textContent = '';
        $('restoreGo').disabled = true;
        try {
          const got = await cloud.fetchBackup($('restoreCode').value);
          const n = Object.keys(got.data.days || {}).length;
          if (confirmReplace && !(await askConfirm({
            title: 'Replace this phone\'s data?',
            body: `The backup holds ${n} days${got.updated ? `, saved ${ago(got.updated)}` : ''}. Everything on this phone is replaced by it, and this phone backs up to that code from now on.`,
            ok: 'Replace',
          }))) { $('restoreGo').disabled = false; return; }
          restoring = true;
          await transport('POST', '/api/import', { days: got.data.days, settings: got.data.settings, replace: true });
          restoring = false;
          cloud.adopt(got.code, { rev: got.rev, last: got.updated });
          store.setMeta('lastBackup', Date.now());
          flash(`Restored ${n} days`);
          finish(true);
        } catch (e) {
          restoring = false;
          $('restoreErr').textContent = e.message;
        } finally {
          $('restoreGo').disabled = false;
        }
      };
      $('restoreCode').onkeydown = (e) => { if (e.key === 'Enter') $('restoreGo').click(); };
      dlg.showModal();
      $('restoreCode').focus();
    });
  }

  /* ---------- Settings › Backup ---------- */

  function render(st = cloud.status()) {
    const box = $('cloudBox');
    if (!box) return;
    box.hidden = false;
    const line = $('cloudStatus');
    const acts = [];
    if (!st.on) {
      line.className = 'cloud-status off';
      line.innerHTML = '<b>Cloud backup is off.</b> Your data is only on this phone.';
      acts.push(['cloudOn', 'primary', 'Turn on cloud backup']);
      acts.push(['cloudRestore', 'ghost', 'Restore…']);
    } else if (st.conflict) {
      line.className = 'cloud-status bad';
      line.innerHTML = `<b>Another device backed up to your code</b>${st.conflict.updated ? ` ${ago(st.conflict.updated)}` : ''}. Choose which copy to keep.`;
      acts.push(['cloudUseCloud', 'primary', 'Use the cloud copy']);
      acts.push(['cloudKeepMine', 'ghost', "Keep this phone's"]);
    } else {
      const when = st.pending
        ? (st.error === 'offline' ? 'Waiting for a connection to back up' : st.error ? `Couldn't back up: ${esc(st.error)}. It will try again.` : 'Backing up…')
        : st.last ? `Backed up ${ago(st.last)}` : 'Backed up';
      line.className = `cloud-status ${st.pending && st.error ? 'warn' : 'ok'}`;
      line.innerHTML = `<b>Cloud backup is on.</b> ${when}`;
      acts.push(['cloudShowCode', 'ghost', 'Show code']);
      acts.push(['cloudRestore', 'ghost', 'Restore…']);
      acts.push(['cloudOff', 'ghost danger', 'Turn off']);
    }
    $('cloudActions').innerHTML = acts.map(([id, cls, label]) => `<button class="${cls}" id="${id}">${label}</button>`).join('');
    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('cloudOn', async () => {
      const code = newCode();
      cloud.adopt(code);
      await showCode(code, { first: true });
      cloud.flush();
    });
    on('cloudShowCode', () => showCode(st.code));
    on('cloudRestore', async () => { if (await restoreDialog({ confirmReplace: true })) await loadState(S.fy); });
    on('cloudOff', async () => {
      if (!(await askConfirm({
        title: 'Turn off cloud backup?',
        body: 'The copy in the cloud is deleted, and your data stays only on this phone. You can turn it on again later with a new code.',
        ok: 'Turn off',
      }))) return;
      await cloud.turnOff();
      flash('Cloud backup is off');
    });
    on('cloudUseCloud', async () => {
      try {
        const got = await cloud.fetchBackup(st.code);
        restoring = true;
        await transport('POST', '/api/import', { days: got.data.days, settings: got.data.settings, replace: true });
        restoring = false;
        cloud.adopt(got.code, { rev: got.rev, last: got.updated });
        await loadState(S.fy);
        flash('This phone now matches the cloud copy');
      } catch (e) { restoring = false; flash(e.message, true); }
    });
    on('cloudKeepMine', async () => {
      await cloud.push({ force: true });
      flash("This phone's data is now the cloud copy");
    });
  }

  /** Keep the backup going: after changes, when the signal comes back, and as the app goes to the background. */
  function start() {
    render();
    cloud.flush();
    window.addEventListener('online', () => cloud.flush());
    const away = () => { if (document.visibilityState === 'hidden') cloud.flush({ keepalive: true }); };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('pagehide', () => cloud.flush({ keepalive: true }));
    setInterval(() => render(), 60000);     // keep "backed up 4 min ago" honest
  }

  return {
    cloud,
    afterChange: () => { if (!restoring) cloud.schedule(); },
    showCode,
    restoreDialog,
    start,
    /** From the setup screen: start backing up under a new code, and show it. */
    async begin() {
      const code = newCode();
      cloud.adopt(code);
      await showCode(code, { first: true });
    },
    normaliseCode,
  };
}
