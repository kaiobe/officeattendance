import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function scratchCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'attendance-bump-'));
  for (const f of ['package.json', 'CHANGELOG.md']) cpSync(join(ROOT, f), join(dir, f));
  cpSync(join(ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'public'));
  cpSync(join(ROOT, 'public', 'app.js'), join(dir, 'public', 'app.js'));
  return dir;
}
const version = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
const pageVersion = (dir) => readFileSync(join(dir, 'public', 'app.js'), 'utf8').match(/const APP_VERSION = '([^']+)'/)[1];
const bump = (dir, arg) => execFileSync(process.execPath, ['scripts/bump.mjs', arg], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });

test('the page and package.json agree', () => {
  assert.equal(pageVersion(ROOT), version(ROOT));
});

test('bump moves package.json, the page and the changelog together', () => {
  const dir = scratchCopy();
  const [a, b, c] = version(dir).split('.').map(Number);
  bump(dir, 'patch');
  assert.equal(version(dir), `${a}.${b}.${c + 1}`);
  assert.equal(pageVersion(dir), version(dir));
  bump(dir, 'minor');
  assert.equal(version(dir), `${a}.${b + 1}.0`);
  bump(dir, 'major');
  assert.equal(version(dir), `${a + 1}.0.0`);
  assert.match(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), new RegExp(`## ${a + 1}\\.0\\.0 - \\d{4}-\\d{2}-\\d{2}`));
});

test('bump refuses to go backwards or sideways, and changes nothing when it does', () => {
  const dir = scratchCopy();
  const before = version(dir);
  assert.throws(() => bump(dir, '0.0.1'));
  assert.throws(() => bump(dir, 'sideways'));
  assert.equal(version(dir), before);
  assert.equal(pageVersion(dir), before);
});

test('drift between the page and package.json is detected', () => {
  const dir = scratchCopy();
  const app = join(dir, 'public', 'app.js');
  writeFileSync(app, readFileSync(app, 'utf8').replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '0.0.1'"));
  cpSync(join(ROOT, 'server'), join(dir, 'server'), { recursive: true });
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    "import('./server/version.js').then((m) => console.log(m.versionDrift()))"], { cwd: dir, encoding: 'utf8' });
  assert.match(out, /0\.0\.1.*run: npm run bump/);
});
