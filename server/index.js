/**
 * Entry point: read the environment, open the database, tidy up, listen.
 * Everything that answers requests lives in app.js.
 */
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getSettings, seedIfEmpty } from './db.js';
import { yearSpan, tidyYears } from './calendar.js';
import { VERSION, versionDrift } from './version.js';
import { createApp } from './app.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DB_FILE = process.env.DB_FILE || join(HERE, '..', 'data', 'attendance.db');
const TZ = process.env.TZ_NAME || 'Australia/Melbourne';

/** Today in the app's timezone, not the server's - that's what decides which day "In now" lands on. */
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dateFmt.format(new Date());

const db = openDb(DB_FILE);

const seeded = seedIfEmpty(db);
if (seeded) console.log(`Seeded ${seeded} days from the FY27 spreadsheet.`);

const drift = versionDrift();
if (drift) console.warn(`Version mismatch: ${drift}`);

const removed = tidyYears(db, yearSpan(db, getSettings(db), today()));
if (removed) console.log(`Removed ${removed} unused calendar days from financial years outside the app's range.`);

const server = createServer(createApp({ db, today, tz: TZ }));
server.listen(PORT, () => console.log(`Office attendance v${VERSION} on http://0.0.0.0:${PORT}  (db: ${DB_FILE}, tz: ${TZ})`));

// Stop cleanly on `docker stop`, so the database is closed rather than the
// process being killed ten seconds later.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => { db.close(); process.exit(0); });
    server.closeAllConnections?.();
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
