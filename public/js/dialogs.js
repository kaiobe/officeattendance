/** The confirm dialog and the saved / error flag in the log card. */
import { $ } from './format.js';

export const anyDialogOpen = () => !!document.querySelector('dialog[open]');

let pending = null;

/**
 * Ask a yes/no question in the app's own dialog. Resolves false on Escape or
 * "Keep it", so the safe answer wins. A second question while one is showing
 * is answered no rather than stacking dialogs.
 */
export function askConfirm({ title, body, ok }) {
  if (pending) return Promise.resolve(false);
  const dlg = $('confirmDlg');
  $('confirmTitle').textContent = title;
  $('confirmBody').textContent = body;
  $('confirmYes').textContent = ok;
  pending = new Promise((resolve) => {
    const finish = (value) => {
      $('confirmYes').removeEventListener('click', yes);
      $('confirmNo').removeEventListener('click', no);
      dlg.removeEventListener('cancel', no);
      if (dlg.open) dlg.close();
      pending = null;
      resolve(value);
    };
    const yes = () => finish(true);
    const no = () => finish(false);
    $('confirmYes').addEventListener('click', yes);
    $('confirmNo').addEventListener('click', no);
    dlg.addEventListener('cancel', no);
    dlg.showModal();
  });
  return pending;
}

let flashTimer;
/** "Saved", or an error, next to the log card's title. Errors stay until the next success. */
export function flash(msg, isError = false) {
  const ok = $('savedFlag'), err = $('errFlag');
  if (isError) { err.textContent = msg; ok.classList.remove('show'); return; }
  err.textContent = '';
  ok.textContent = msg || 'Saved';
  ok.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => ok.classList.remove('show'), 1600);
}

/** Run an action, reporting a failure in the flag instead of letting it vanish. */
export async function attempt(fn) {
  try { return await fn(); } catch (e) { flash(e.message || String(e), true); return undefined; }
}
