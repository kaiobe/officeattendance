/**
 * Entry point. The rest of the page lives in js/ - see js/main.js.
 *
 * APP_VERSION is the release this page was built from. `npm run bump` rewrites
 * this line and package.json together, and the server complains at startup if
 * the two ever drift apart.
 *
 * The page sends it nowhere - it compares it against the version the server
 * reports. They differ only when the browser is running JavaScript older than
 * the deploy, i.e. a cached page, which is exactly the thing worth knowing.
 */
import { boot } from './js/main.js';

const APP_VERSION = '1.5.0';

boot(APP_VERSION);
