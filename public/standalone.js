/**
 * Entry point for the standalone version (see public/local/install.js): set
 * the app up to run entirely in the browser, then start it exactly as the
 * server version starts. scripts/build-standalone.mjs points the page here.
 */
import { installLocal } from './local/install.js';

installLocal();
await import('./app.js');
