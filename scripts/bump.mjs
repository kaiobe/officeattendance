#!/usr/bin/env node
/**
 * The only supported way to change the version.
 *
 *   npm run bump            -> patch
 *   npm run bump minor
 *   npm run bump major
 *   npm run bump -- 2.0.0   -> an exact version
 *
 * It writes all three places at once - package.json, the APP_VERSION constant
 * in public/app.js, and a dated section at the top of CHANGELOG.md - because
 * the whole point of the scheme is that they cannot disagree. Editing any one
 * of them by hand is what the server's startup warning is there to catch.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'package.json');
const APP = join(ROOT, 'public', 'app.js');
const LOG = join(ROOT, 'CHANGELOG.md');

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const arg = (process.argv[2] || 'patch').replace(/^v/, '');

const pkgRaw = readFileSync(PKG, 'utf8');
const pkg = JSON.parse(pkgRaw);
const cur = pkg.version;
if (!SEMVER.test(cur)) fail(`package.json version "${cur}" is not MAJOR.MINOR.PATCH`);

const next = (() => {
  if (SEMVER.test(arg)) return arg;
  const [maj, min, pat] = cur.split('.').map(Number);
  if (arg === 'major') return `${maj + 1}.0.0`;
  if (arg === 'minor') return `${maj}.${min + 1}.0`;
  if (arg === 'patch') return `${maj}.${min}.${pat + 1}`;
  return fail(`don't know how to bump "${arg}" - use major, minor, patch, or an exact version`);
})();

if (cmp(next, cur) <= 0) fail(`${next} is not ahead of the current ${cur}`);

// package.json - a targeted replace, so formatting and key order survive.
const pkgOut = pkgRaw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`);
if (pkgOut === pkgRaw) fail('could not find the version field in package.json');

// public/app.js - the copy the browser carries.
const appRaw = readFileSync(APP, 'utf8');
const appOut = appRaw.replace(/(const\s+APP_VERSION\s*=\s*')[^']+(')/, `$1${next}$2`);
if (appOut === appRaw) fail('could not find the APP_VERSION constant in public/app.js');

// CHANGELOG.md - a stub to fill in, dated today.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
const head = `## ${next} - ${today}\n\n- \n\n`;
const logRaw = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '# Changelog\n\n';
const marker = logRaw.indexOf('\n## ');
const logOut = marker === -1 ? logRaw.trimEnd() + '\n\n' + head : logRaw.slice(0, marker + 1) + head + logRaw.slice(marker + 1);

writeFileSync(PKG, pkgOut);
writeFileSync(APP, appOut);
writeFileSync(LOG, logOut);

console.log(`${cur} -> ${next}`);
console.log('  package.json, public/app.js, CHANGELOG.md');
console.log(`\nWrite the changelog entry, then commit:\n  git commit -am "v${next}: <what changed>"`);

function cmp(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
function fail(msg) { console.error(`bump: ${msg}`); process.exit(1); }
