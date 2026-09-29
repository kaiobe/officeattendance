/**
 * Versioning.
 *
 * package.json holds the one number that matters. Everything else here is
 * derived from it, so there is never a second place to remember to edit.
 *
 * Two different questions get two different answers:
 *
 *   VERSION  - which release this is. Bumped deliberately, by `npm run bump`.
 *   BUILD    - which deploy this is. The newest mtime in public/, so two
 *              deploys of the same release are still distinguishable.
 *
 * The page carries its own copy of the release number, baked into app.js as
 * APP_VERSION. The browser compares that against what the server reports, so
 * a page served from a stale cache says so out loud instead of quietly
 * pretending to be current. That only works while the two stay in step, so
 * the mismatch is checked here at startup too - see versionDrift().
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PUBLIC = join(ROOT, 'public');

export const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch { return '0.0.0'; }
})();

export const BUILD = (() => {
  try {
    return readdirSync(PUBLIC)
      .map((f) => statSync(join(PUBLIC, f)).mtime.getTime())
      .reduce((a, b) => Math.max(a, b), 0) || null;
  } catch { return null; }
})();

/** The release number baked into the served JavaScript. */
export const PAGE_VERSION = (() => {
  try {
    const src = readFileSync(join(PUBLIC, 'app.js'), 'utf8');
    const m = src.match(/const\s+APP_VERSION\s*=\s*'([^']+)'/);
    return m ? m[1] : null;
  } catch { return null; }
})();

/**
 * Null when the page and package.json agree. A string explaining the problem
 * when they don't - which means someone edited one by hand and every browser
 * is about to be told, wrongly, that it is running a stale page.
 */
export function versionDrift() {
  if (PAGE_VERSION === null) return 'public/app.js has no APP_VERSION constant';
  if (PAGE_VERSION !== VERSION) return `public/app.js says ${PAGE_VERSION}, package.json says ${VERSION} - run: npm run bump`;
  return null;
}

export function versionInfo() {
  return {
    version: VERSION,
    build: BUILD,
    buildUtc: BUILD ? new Date(BUILD).toISOString() : null,
  };
}
