#!/usr/bin/env node
/**
 * Build the standalone version into dist/: a static site that runs entirely
 * in the browser, each person's data on their own device. Cloudflare Pages
 * runs this (see README, "The standalone version"); `npm run build:standalone`
 * does the same locally.
 *
 * It's the same public/ folder with four changes:
 *   - the page starts at standalone.js, which answers the API in the browser
 *   - paths in the page are relative, and the manifest needs no login
 *   - the build time is stamped into local/install.js, for the version line
 *   - a service worker (sw.js) and Cloudflare headers (_headers) are added
 *
 * No dependencies, and nothing newer than Node 18.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync, lstatSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const OUT = resolve(ROOT, process.argv[2] || 'dist');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const BUILD = Date.now();
const MARKER = '.attendance-build.json';

// Never allow a build destination to erase the project, a source directory,
// or an unrelated nonempty folder. Resolve and check before recursive removal.
const protectedDirs = ['.', 'public', 'server', 'scripts', 'test', 'docs', 'data', '.git', '.agents', '.codex']
  .map((p) => resolve(ROOT, p));
const protectedTarget = protectedDirs.some((p) => OUT === p || (p !== resolve(ROOT) && OUT.startsWith(p + sep)))
  || resolve(ROOT).startsWith(OUT + sep);
if (protectedTarget || (existsSync(OUT) && lstatSync(OUT).isSymbolicLink())) {
  throw new Error('Refusing to replace a project/source directory or symbolic link. Use dist or an empty output directory.');
}
if (existsSync(OUT) && readdirSync(OUT).length && !existsSync(join(OUT, MARKER))) {
  throw new Error('Output directory is not empty and was not created by this builder. Choose an empty output directory.');
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const rel = (p) => relative(OUT, p).split(sep).join('/');

rmSync(OUT, { recursive: true, force: true });
for (const src of walk(PUBLIC)) {
  const dest = join(OUT, relative(PUBLIC, src));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

/** Replace text that must be there - a silent miss would ship a broken page. */
function edit(file, pairs) {
  const p = join(OUT, file);
  let s = readFileSync(p, 'utf8');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw new Error(`${file}: expected to find ${JSON.stringify(from)}`);
    s = s.split(from).join(to);
  }
  writeFileSync(p, s);
}

edit('index.html', [
  ['<script src="/app.js" type="module"></script>', '<script src="standalone.js" type="module"></script>'],
  ['href="/styles.css"', 'href="styles.css"'],
  ['href="/manifest.webmanifest" crossorigin="use-credentials"', 'href="manifest.webmanifest"'],
  ['href="/icons/apple-touch-icon.png"', 'href="icons/apple-touch-icon.png"'],
]);
edit('local/install.js', [['const BUILD = 0;', `const BUILD = ${BUILD};`]]);

const manifestPath = join(OUT, 'manifest.webmanifest');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.id = manifest.scope = manifest.start_url = './';
for (const icon of manifest.icons) icon.src = icon.src.replace(/^\//, '');
for (const shortcut of manifest.shortcuts) {
  shortcut.url = `.${shortcut.url}`;
  for (const icon of shortcut.icons || []) icon.src = icon.src.replace(/^\//, '');
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Each worker serves one complete build. Updates wait until older tabs close,
// so a page cannot mix JavaScript from different releases.
const files = ['./', ...walk(OUT).map(rel).filter((f) => f !== 'index.html')];
const worker = readFileSync(join(ROOT, 'scripts/service-worker.template.js'), 'utf8')
  .replace('__BUILD_ID__', JSON.stringify(`${VERSION}-${BUILD}`))
  .replace('__FILES__', JSON.stringify(files));
writeFileSync(join(OUT, 'sw.js'), worker);
writeFileSync(join(OUT, MARKER), JSON.stringify({ version: VERSION, build: BUILD }));

// Cloudflare Pages reads this for response headers: the same tight policy the
// server sends, and no caching of the page or the service worker so an update
// is picked up straight away.
writeFileSync(join(OUT, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
`);

console.log(`Standalone v${VERSION} built into ${relative(ROOT, OUT) || '.'}/ - ${files.length} files`);
