#!/usr/bin/env node
/**
 * npm test. Runs test/*.test.js with Node's built-in runner - no dependencies.
 * Node 22 still keeps node:sqlite behind a flag, so it's added there.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const major = Number(process.versions.node.split('.')[0]);
const flags = major < 23 ? ['--experimental-sqlite', '--no-warnings=ExperimentalWarning'] : [];
const files = readdirSync(new URL('../test/', import.meta.url)).filter((f) => f.endsWith('.test.js')).map((f) => `test/${f}`);
const { status } = spawnSync(process.execPath, [...flags, '--test', ...process.argv.slice(2), ...files], {
  stdio: 'inherit',
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, ...flags].filter(Boolean).join(' ') },
});
process.exit(status ?? 1);
