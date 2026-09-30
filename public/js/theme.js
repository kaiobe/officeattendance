/**
 * Light, dark, or whatever the device is set to. The choice is kept per
 * browser; "Match device" is the absence of one. The browser's own bar colour
 * follows along.
 */
const KEY = 'theme';
const BAR = { light: '#f4f3f0', dark: '#141413' };
export const THEMES = ['system', 'light', 'dark'];
export const THEME_LABEL = { system: 'Match device', light: 'Light', dark: 'Dark' };

const listeners = new Set();
export const onThemeChange = (fn) => listeners.add(fn);

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch { return 'system'; }
}

/** Is the page drawn dark right now, whichever way that was decided? */
export function isDark() {
  const t = getTheme();
  return t === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : t === 'dark';
}

function paint(t) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const forDark = (m.getAttribute('media') || '').includes('dark');
    m.setAttribute('content', t === 'system' ? BAR[forDark ? 'dark' : 'light'] : BAR[t]);
  });
}

export function setTheme(t) {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {}
  paint(t);
  listeners.forEach((fn) => fn(t));
}

/** Match device → Light → Dark → Match device. */
export function cycleTheme() {
  const t = getTheme();
  setTheme(THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);
}

export const ICON = {
  system: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  light: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};

export function initTheme() {
  paint(getTheme());
  // When following the device, follow it live.
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getTheme() === 'system') { paint('system'); listeners.forEach((fn) => fn('system')); }
  });
}
