/**
 * The screens for cloud backup (cloud.js does the work): the recovery code
 * shown once at setup, restoring from a code, and the status and controls in
 * Settings › Backup.
 */
import { createCloud, newCode, normaliseCode } from './cloud.js';
import { createPasskeys, passkeysAvailable } from './passkey.js';
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

const day = (ts) => new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export function setupCloud({ store, transport }) {
  let restoring = false;
  const cloud = createCloud({
    store,
    snapshot: async () => JSON.parse((await transport('GET', '/api/export.json')).body),
    onChange: render,
  });
  const passkeys = createPasskeys({ store, cloud, onChange: () => render() });
  let canPasskey = false;
  passkeysAvailable().then((v) => { canPasskey = v; render(); });

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
    // The first time, offer a passkey as well.
    $('codePasskeyBox').hidden = !(first && canPasskey);
    $('codePasskey').hidden = false;
    $('codePasskeyMsg').textContent = '';
    $('codePasskeyMsg').className = 'dlg-err';
    $('codePasskey').onclick = async () => {
      $('codePasskey').disabled = true;
      try {
        await passkeys.add();
        $('codePasskey').hidden = true;
        $('codePasskeyMsg').className = 'dlg-err ok';
        $('codePasskeyMsg').textContent = 'Passkey saved. Restore with it on your next phone.';
      } catch (e) {
        $('codePasskeyMsg').textContent = e.message;
      } finally {
        $('codePasskey').disabled = false;
      }
    };
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
    $('restorePasskeyBox').hidden = !canPasskey;
    return new Promise((resolve) => {
      const onCancel = () => { dlg.removeEventListener('cancel', onCancel); resolve(false); };
      dlg.addEventListener('cancel', onCancel);
      const finish = (v) => { dlg.removeEventListener('cancel', onCancel); dlg.close(); resolve(v); };
      $('restoreCancel').onclick = () => finish(false);
      $('restoreFile').onclick = () => { finish(false); file(); };
      /** Bring in the backup a code points to; `entry` is the passkey that gave the code, if one did. */
      const restore = async (getCode) => {
        $('restoreErr').textContent = '';
        $('restoreGo').disabled = $('restorePasskey').disabled = true;
        try {
          const { code, entry } = await getCode();
          const got = await cloud.fetchBackup(code);
          const n = Object.keys(got.data.days || {}).length;
          if (confirmReplace && !(await askConfirm({
            title: 'Replace this phone\'s data?',
            body: `The backup holds ${n} days${got.updated ? `, saved ${ago(got.updated)}` : ''}. Everything on this phone is replaced by it, and this phone backs up to that code from now on.`,
            ok: 'Replace',
          }))) return;
          restoring = true;
          await transport('POST', '/api/import', { days: got.data.days, settings: got.data.settings, replace: true });
          restoring = false;
          // Passkeys made for a different code don't unlock this one.
          if (cloud.status().code && cloud.status().code !== got.code) passkeys.forgetAll();
          cloud.adopt(got.code, { rev: got.rev, last: got.updated });
          if (entry) passkeys.remember(entry);
          store.setMeta('lastBackup', Date.now());
          flash(`Restored ${n} days`);
          finish(true);
        } catch (e) {
          restoring = false;
          $('restoreErr').textContent = e.message;
        } finally {
          $('restoreGo').disabled = $('restorePasskey').disabled = false;
        }
      };
      $('restoreGo').onclick = () => restore(async () => ({ code: $('restoreCode').value }));
      $('restorePasskey').onclick = () => restore(() => passkeys.recover());
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
      if (canPasskey) acts.push(['cloudPasskeyAdd', 'ghost', 'Add passkey']);
      acts.push(['cloudRestore', 'ghost', 'Restore…']);
      acts.push(['cloudOff', 'ghost danger', 'Turn off']);
    }
    $('cloudActions').innerHTML = acts.map(([id, cls, label]) => `<button class="${cls}" id="${id}">${label}</button>`).join('');
    const keys = st.on && !st.conflict ? passkeys.list() : [];
    $('cloudPasskeys').hidden = !keys.length;
    $('cloudPasskeys').innerHTML = keys.map((p) => `<li><span><b>Passkey</b> added ${esc(day(p.added))}</span><button class="ghost" data-passkey="${esc(p.id)}">Remove</button></li>`).join('');
    for (const b of $('cloudPasskeys').querySelectorAll('button[data-passkey]')) {
      b.onclick = async () => {
        if (!(await askConfirm({
          title: 'Remove this passkey?',
          body: 'It won\'t restore your backup any more. Your recovery code still will. You can also delete the passkey from your password manager.',
          ok: 'Remove',
        }))) return;
        await passkeys.remove(b.dataset.passkey);
        flash('Passkey removed');
      };
    }
    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('cloudOn', async () => {
      const code = newCode();
      cloud.adopt(code);
      await showCode(code, { first: true });
      cloud.flush();
    });
    on('cloudShowCode', () => showCode(st.code));
    on('cloudPasskeyAdd', async () => {
      try { await passkeys.add(); flash('Passkey saved'); }
      catch (e) { flash(e.message, true); }
    });
    on('cloudRestore', async () => { if (await restoreDialog({ confirmReplace: true })) await loadState(S.fy); });
    on('cloudOff', async () => {
      if (!(await askConfirm({
        title: 'Turn off cloud backup?',
        body: 'The copy in the cloud is deleted, along with any passkeys for it, and your data stays only on this phone. You can turn it on again later with a new code.',
        ok: 'Turn off',
      }))) return;
      await passkeys.removeAll();
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
    passkeys.renew();
    window.addEventListener('online', () => cloud.flush());
    const away = () => { if (document.visibilityState === 'hidden') cloud.flush({ keepalive: true }); };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('pagehide', () => cloud.flush({ keepalive: true }));
    setInterval(() => render(), 60000);     // keep "backed up 4 min ago" honest
  }

  return {
    cloud,
    passkeys,
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
