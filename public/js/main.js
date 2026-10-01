/** Start-up and the page-wide wiring: rendering, day selection, tabs, keys, theme, version. */
import { S, subscribe, loadState, serverToday, runtime } from './state.js';
import { $, builtAt as builtAtOf } from './format.js';
import { initTheme, cycleTheme, getTheme, onThemeChange, THEMES, THEME_LABEL, ICON } from './theme.js';
import { anyDialogOpen, attempt } from './dialogs.js';
import { renderTiles, renderSoFar, wireTiles } from './tiles.js';
import { renderLog, wireLog, punch } from './log.js';
import { renderGrid, renderLegend, renderKeyTotals, renderGridNote, renderYearList, allHourCols, setAllHourCols } from './grid.js';
import { renderMonth, wireMonth, showMonth, endSelecting } from './month.js';
import { wireSettings } from './settings.js';
import { installTimeFields } from './timefield.js';
import { addDays, datesBetween, fyOfDate, weekdayOf } from '../lib/dates.js';

let APP_VERSION = '';

const builtAt = () => builtAtOf(S.build);
// The newest release: the server's (S.version), or for the standalone version
// what build.json says (runtime.latest, from public/local/update.js).
const newest = () => runtime.latest?.version || S.version;
const isStale = () => !!(newest() && newest() !== APP_VERSION);

/**
 * The release badge. The page carries the version it was built from; if the
 * server reports a different one, this page is a cached copy of an older
 * build - so the badge says so and reloads past the cache when clicked. On a
 * phone the badge only shows when stale; the version lives in the menu.
 */
function renderVersion() {
  const el = $('version');
  const stale = isStale();
  el.classList.toggle('stale', stale);
  el.textContent = stale ? `v${APP_VERSION} → v${newest()}` : `v${APP_VERSION}`;
  el.title = stale
    ? (runtime.local
      ? `This page is running v${APP_VERSION}, but v${newest()} is out.\nClick to update.`
      : `This page is running v${APP_VERSION}, but the server is serving v${newest()}.\nClick to reload.`)
    : `Release v${APP_VERSION}\nDeployed ${builtAt()}`;
  el.setAttribute('role', stale ? 'button' : 'presentation');
  el.tabIndex = stale ? 0 : -1;
}

function hardReload() {
  // The standalone version has its own way past the offline cache.
  if (runtime.update) { runtime.update(); return; }
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
  renderSoFar();
  renderMonth();
  renderGrid(selectDate);
  renderYearList(openMonth);
  renderKeyTotals();
  renderGridNote();
  renderLegend();
}

/**
 * Select a day. With extend (Shift), select the range from the last plain pick
 * to here. With toggle (Ctrl, or Cmd on a Mac), add the day to the selection
 * or take it out again, so any mix of days can be picked; Ctrl+Shift adds a
 * range to what's already picked.
 */
function selectDate(date, extend = false, toggle = false) {
  if (!S.summary) return;
  if (toggle && fyOfDate(date) === S.fy) {
    const picked = new Set(S.range.length > 1 ? S.range : [S.sel]);
    if (extend && S.anchor) {
      const [a, b] = [S.anchor, date].sort();
      datesBetween(a, b).forEach((d) => picked.add(d));
    } else if (picked.has(date) && picked.size > 1) {
      picked.delete(date);
    } else {
      picked.add(date);
    }
    S.range = [...picked].sort();
    S.sel = picked.has(date) ? date : S.range[S.range.length - 1];
    if (!extend) S.anchor = S.sel;
    if (S.range.length === 1) S.range = [];
    return renderAll();
  }
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
 * Shift+Down runs the selection on to the end of the work week - the Friday
 * before the next weekend - and Shift+Up back to its Monday. From a Friday
 * (or Monday going up) it goes a further week. Never more than 7 days a step.
 */
function weekEdge(date, dir) {
  const wd = weekdayOf(date);                     // 0 Sunday ... 6 Saturday
  if (dir > 0) return addDays(date, wd === 5 ? 7 : wd === 6 ? 6 : 5 - wd);
  return addDays(date, wd === 1 ? -7 : wd === 0 ? -6 : 1 - wd);
}

/* ---------- phone tabs ---------- */

/** Today (punch in and out), Month (the calendar) or Year (tiles and totals). Only a phone shows the tabs. */
function setTab(tab) {
  if (tab !== 'month') endSelecting();
  document.body.dataset.tab = tab;
  document.querySelectorAll('#tabbar button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

/** From the month view: open a day on Today. */
function openDay(date) {
  selectDate(date);
  setTab('today');
}

/** From the Year tab's list: open a month in the month view. */
function openMonth(idx) {
  showMonth(idx);
  setTab('month');
}

/**
 * A page left open overnight - or a phone tab restored in the morning - still
 * thinks it's yesterday, and "In now" would land on the wrong day. Whenever the
 * page comes back into view, check the date with the server and move on to
 * today if it has changed.
 */
async function catchUpWithToday() {
  if (!S.today || anyDialogOpen()) return;
  const today = await serverToday().catch(() => null);
  if (!today || today === S.today || anyDialogOpen()) return;
  const wasOnToday = S.sel === S.today;
  if (wasOnToday) { S.sel = today; S.anchor = today; S.range = []; }
  await attempt(() => loadState(wasOnToday ? fyOfDate(today) : S.fy));
}

/* ---------- theme ---------- */

/** The header button shows the current choice and moves to the next one. */
function renderThemeButton() {
  const t = getTheme();
  const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
  const b = $('themeBtn');
  b.innerHTML = ICON[t];
  b.setAttribute('aria-label', `Theme: ${THEME_LABEL[t]}. Switch to ${THEME_LABEL[next]}`);
  b.title = `Theme: ${THEME_LABEL[t]} (click for ${THEME_LABEL[next]})`;
}

/* ---------- phone menu ---------- */

function renderMenu() {
  $('menuTheme').textContent = `Theme: ${THEME_LABEL[getTheme()]}`;
  $('menuVersion').textContent = isStale()
    ? (runtime.local
      ? `This page is v${APP_VERSION}; v${newest()} is out. Tap the badge to update.`
      : `This page is v${APP_VERSION}; the server has v${newest()}. Tap the badge to reload.`)
    : `Version ${APP_VERSION} · deployed ${builtAt()}`;
}

function wireMenu() {
  const menu = $('menuDlg');
  $('menuBtn').onclick = () => { renderMenu(); menu.showModal(); };
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });   // a tap outside it
  $('menuSettings').onclick = () => { menu.close(); $('settingsBtn').click(); };
  $('menuTheme').onclick = () => { cycleTheme(); renderMenu(); };
}

/**
 * The home-screen shortcut opens /?punch=in: punch in on today, with the same
 * question as the button if an In time is already there. The address is
 * tidied first, so a reload doesn't punch again.
 */
function handleShortcut() {
  const params = new URLSearchParams(location.search);
  if (params.get('punch') !== 'in') return;
  history.replaceState(null, '', location.pathname);
  setTab('today');
  if (S.sel !== S.today) selectDate(S.today);
  punch('in');
}

export async function boot(appVersion) {
  APP_VERSION = appVersion;
  runtime.appVersion = appVersion;
  installTimeFields();
  subscribe(renderAll);
  initTheme();
  renderThemeButton();
  onThemeChange(renderThemeButton);
  $('themeBtn').onclick = cycleTheme;
  // On a Mac the multi-pick key is Cmd.
  if (/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelectorAll('.mod').forEach((e) => { e.textContent = '⌘'; });
  wireMenu();
  wireTiles();
  wireLog({ rerender: renderAll });
  wireMonth({ openDay });
  wireSettings();

  document.querySelectorAll('#tabbar button').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
  $('hourColsBtn').onclick = () => { setAllHourCols(!allHourCols()); renderGrid(selectDate); };

  $('prevDay').onclick = () => selectDate(addDays(S.sel, -1));
  $('nextDay').onclick = () => selectDate(addDays(S.sel, 1));
  $('todayBtn').onclick = () => selectDate(S.today);
  $('dateInput').onchange = (e) => { if (e.target.value) selectDate(e.target.value); };
  $('fysel').onchange = (e) => { S.sel = null; attempt(() => loadState(Number(e.target.value))); };

  $('version').onclick = () => { if (isStale()) hardReload(); };
  runtime.refreshVersion = renderVersion;
  $('version').onkeydown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && isStale()) { e.preventDefault(); hardReload(); }
  };

  // Arrow keys move the selected day - never while typing, and never behind an
  // open dialog, where it would change the day a question is about.
  const STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  document.addEventListener('keydown', (e) => {
    if (!S.summary || !(e.key in STEP) || anyDialogOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    e.preventDefault();
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    const to = e.shiftKey && vertical ? weekEdge(S.sel, STEP[e.key]) : addDays(S.sel, STEP[e.key]);
    selectDate(to, e.shiftKey);
  });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') catchUpWithToday(); });
  window.addEventListener('focus', catchUpWithToday);

  // The standalone version saves exports on the device instead of following the links.
  if (runtime.saveFile) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href^="/api/export"]');
      if (!a) return;
      e.preventDefault();
      attempt(() => runtime.saveFile(a.getAttribute('href')));
    });
  }

  try {
    if (runtime.beforeLoad) await runtime.beforeLoad();
    await loadState();
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'err';
    p.style.marginTop = '40px';
    p.textContent = `Could not load: ${e.message}`;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.append(p);
    if (runtime.saveRecovery) {
      const recovery = document.createElement('button');
      recovery.textContent = 'Download saved data';
      recovery.onclick = async () => {
        try { await runtime.saveRecovery(); }
        catch (error) { p.textContent = error.message; }
      };
      wrap.append(recovery);
    }
    document.body.replaceChildren(wrap);
    return;
  }
  handleShortcut();
  if (runtime.afterLoad) runtime.afterLoad();
}
