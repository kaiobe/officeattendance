/** Start-up and the page-wide wiring: rendering, day selection, tabs, keys, theme, version. */
import { S, subscribe, loadState, serverToday } from './state.js';
import { $, builtAt as builtAtOf } from './format.js';
import { initTheme, cycleTheme, getTheme, onThemeChange, THEMES, THEME_LABEL, ICON } from './theme.js';
import { anyDialogOpen, attempt } from './dialogs.js';
import { renderTiles, renderSoFar, wireTiles } from './tiles.js';
import { renderLog, wireLog, punch } from './log.js';
import { renderGrid, renderLegend, renderKeyTotals, renderGridNote, renderYearList, allHourCols, setAllHourCols } from './grid.js';
import { renderMonth, wireMonth, showMonth, endSelecting } from './month.js';
import { wireSettings } from './settings.js';
import { addDays, datesBetween, fyOfDate } from '../lib/dates.js';

let APP_VERSION = '';

const builtAt = () => builtAtOf(S.build);
const isStale = () => !!(S.version && S.version !== APP_VERSION);

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
  el.textContent = stale ? `v${APP_VERSION} → v${S.version}` : `v${APP_VERSION}`;
  el.title = stale
    ? `This page is running v${APP_VERSION}, but the server is serving v${S.version}.\nClick to reload.`
    : `Release v${APP_VERSION}\nDeployed ${builtAt()}`;
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
  renderSoFar();
  renderMonth();
  renderGrid(selectDate);
  renderYearList(openMonth);
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
  if (!S.today) return;
  const today = await serverToday().catch(() => null);
  if (!today || today === S.today) return;
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
    ? `This page is v${APP_VERSION}; the server has v${S.version}. Tap the badge to reload.`
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
  punch();
}

export async function boot(appVersion) {
  APP_VERSION = appVersion;
  subscribe(renderAll);
  initTheme();
  renderThemeButton();
  onThemeChange(renderThemeButton);
  $('themeBtn').onclick = cycleTheme;
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
  $('version').onkeydown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && isStale()) { e.preventDefault(); hardReload(); }
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
    return;
  }
  handleShortcut();
}
