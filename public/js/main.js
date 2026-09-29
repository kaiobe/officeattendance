/** Start-up and the page-wide wiring: rendering, day selection, keys, theme, version. */
import { S, subscribe, loadState, serverToday } from './state.js';
import { $ } from './format.js';
import { anyDialogOpen, attempt } from './dialogs.js';
import { renderTiles, wireTiles } from './tiles.js';
import { renderLog, wireLog } from './log.js';
import { renderGrid, renderLegend, renderKeyTotals, renderGridNote } from './grid.js';
import { wireSettings } from './settings.js';
import { MONTH_SHORT, pad, addDays, datesBetween, fyOfDate } from '../lib/dates.js';

let APP_VERSION = '';

/**
 * The release badge. The page carries the version it was built from; if the
 * server reports a different one, this page is a cached copy of an older
 * build - so the badge says so and reloads past the cache when clicked.
 */
function renderVersion() {
  const el = $('version');
  const stale = S.version && S.version !== APP_VERSION;
  const built = S.build ? new Date(S.build) : null;
  const when = built ? `${built.getDate()} ${MONTH_SHORT[built.getMonth()]} ${pad(built.getHours())}:${pad(built.getMinutes())}` : 'unknown';
  el.classList.toggle('stale', !!stale);
  el.textContent = stale ? `v${APP_VERSION} → v${S.version}` : `v${APP_VERSION}`;
  el.title = stale
    ? `This page is running v${APP_VERSION}, but the server is serving v${S.version}.\nClick to reload.`
    : `Release v${APP_VERSION}\nDeployed ${when}`;
  el.setAttribute('role', stale ? 'button' : 'presentation');
  el.tabIndex = stale ? 0 : -1;
}

function hardReload() {
  const u = new URL(location.href);
  u.searchParams.set('v', Date.now());
  location.replace(u.toString());
}

function renderAll() {
  $('fyLabel').textContent = S.fy;
  $('fyrange').textContent = `FY${S.fy} · Oct ${2000 + S.fy - 1} – Sep ${2000 + S.fy}`;
  $('fysel').innerHTML = S.fys.map((f) => `<option value="${f}" ${f === S.fy ? 'selected' : ''}>FY${f}</option>`).join('');
  $('csvLink').href = `/api/export.csv?fy=${S.fy}`;
  renderVersion();
  renderTiles();
  renderLog();
  renderGrid(selectDate);
  renderKeyTotals();
  renderGridNote();
  renderLegend();
}

/** Select a day; with extend, select the range from the last plain pick to here. */
function selectDate(date, extend = false) {
  if (extend && S.anchor) {
    const [a, b] = [S.anchor, date].sort();
    S.range = datesBetween(a, b);
  } else {
    S.anchor = date;
    S.range = [];
  }
  S.sel = date;
  if (fyOfDate(date) !== S.fy) return attempt(() => loadState(fyOfDate(date)));
  renderAll();
}

/**
 * A page left open overnight - or a phone tab restored in the morning - still
 * thinks it's yesterday, and "In now" would land on the wrong day. Whenever the
 * page comes back into view, check the date with the server and move on to
 * today if it has changed.
 */
async function catchUpWithToday() {
  if (!S.today) return;
  const today = await serverToday().catch(() => null);
  if (!today || today === S.today) return;
  const wasOnToday = S.sel === S.today;
  if (wasOnToday) { S.sel = today; S.anchor = today; S.range = []; }
  await attempt(() => loadState(wasOnToday ? fyOfDate(today) : S.fy));
}

function wireTheme() {
  const apply = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  try { apply(localStorage.getItem('theme')); } catch {}
  $('themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme;
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem('theme', next); } catch {}
  };
}

export async function boot(appVersion) {
  APP_VERSION = appVersion;
  subscribe(renderAll);
  wireTheme();
  wireTiles();
  wireLog({ rerender: renderAll });
  wireSettings();

  $('prevDay').onclick = () => selectDate(addDays(S.sel, -1));
  $('nextDay').onclick = () => selectDate(addDays(S.sel, 1));
  $('todayBtn').onclick = () => selectDate(S.today);
  $('dateInput').onchange = (e) => { if (e.target.value) selectDate(e.target.value); };
  $('fysel').onchange = (e) => { S.sel = null; attempt(() => loadState(Number(e.target.value))); };

  $('version').onclick = () => { if ($('version').classList.contains('stale')) hardReload(); };
  $('version').onkeydown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && $('version').classList.contains('stale')) { e.preventDefault(); hardReload(); }
  };

  // Arrow keys move the selected day - never while typing, and never behind an
  // open dialog, where it would change the day a question is about.
  const STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  document.addEventListener('keydown', (e) => {
    if (!(e.key in STEP) || anyDialogOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    e.preventDefault();
    selectDate(addDays(S.sel, STEP[e.key]), e.shiftKey);
  });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') catchUpWithToday(); });
  window.addEventListener('focus', catchUpWithToday);

  try {
    await loadState();
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'err';
    p.style.marginTop = '40px';
    p.textContent = `Could not load: ${e.message}`;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.append(p);
    document.body.replaceChildren(wrap);
  }
}
