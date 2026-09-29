# Office Attendance

Self-hosted tracker for office days and hours across an **October–September financial year**.
A direct replacement for the FY27 spreadsheet: same codes, same colours, same formulas —
plus one-tap logging, a full-year grid, and a database instead of a workbook.

---

## Deploy

### Portainer (stack)

1. **Stacks → Add stack → Repository** (or Web editor, pasting `docker-compose.yml`).
2. Set the published port if `8095` is already in use on the host.
3. Deploy. First start creates the database and imports the FY27 data from the spreadsheet.
4. Open `http://<host>:8095` — or reach it over Tailscale on the tailnet IP/MagicDNS name.

### Command line

```bash
docker compose up -d --build
docker compose logs -f attendance      # "Seeded 365 days from the FY27 spreadsheet."
```

### A second copy for testing

`docker-compose.test.yml` is a ready-made test stack with its own container name
(`attendance_test`), port (**8096**) and volume. Deploy it as a separate stack from the
same repo and set **Compose path** to `docker-compose.test.yml`. Nothing else to
configure — leave the environment variables empty.

It gets a database entirely its own, seeded fresh from the FY27 spreadsheet, so it
cannot touch your real attendance data. To proxy it, add a separate proxy host
forwarding to `attendance_test` on port 8080.

The main `docker-compose.yml` also takes `APP_NAME` and `HOST_PORT` if you'd rather
spin up a copy that way — but they must both be set, or the copy falls back to the
production name and collides with it.

### Without Docker

Node 24+ (on Node 22 use `./run-dev.sh`, which adds the flag Node 24 has as standard):

```bash
npm start                              # http://localhost:8080
```

No npm dependencies — the server uses only Node built-ins, including `node:sqlite`.

### Tests

```bash
npm test
```

Node's built-in test runner, still no dependencies. It checks every FY27 month against the
original spreadsheet (counted cell by cell, in `test/fixtures/fy27-workbook.json`), the
Victorian holidays against Business Victoria's published lists for 2025–2028, the whole API
over a throwaway database with a clock the tests control — including what happens on
1 October — and the version scheme.

---

## Environment

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8080` | Port inside the container |
| `DB_FILE` | `/data/attendance.db` | SQLite file; keep it on a volume |
| `TZ_NAME` | `Australia/Melbourne` | Decides what "today" means in the app |

---

## Using it

**Log a day** — pick a date (arrow keys ← → also move a day, ↑ ↓ a week), tap a code.
It saves immediately. On an office day, *Standard day* fills your usual 07:30–17:00,
or use *In now* / *Out now* to punch in and out live. Entering a time on a blank day, a
weekend or a holiday saves it as an office day. An Out earlier than the In is counted as
a shift across midnight, and flagged beside the hours in case it was a slip.

A page left open overnight catches up by itself: when it comes back into view it checks
the date with the server, so *In now* the next morning lands on the right day.

**Grid** — the whole financial year, one row per month. Click any cell to load it into the
log panel. **Shift-click** a second cell (or Shift + arrow keys) to select a range, then
tap a code to apply it — that's how you block out a fortnight of long service leave in
two clicks. A range recodes only the work days in it: weekends, public holidays and your
non-working day are left as they are, so the leave doesn't inflate the day counts.
A dot in the corner of a cell means hours are recorded; a small triangle means there's a comment.

## The calendar fills itself

Open a financial year and it arrives already laid out: `W` on every Saturday and Sunday,
`PH` on every Victorian public holiday, and `NW` on your non-working weekday. Only the
weekdays you actually work are left blank. It fills blank days only, so a year already
holding entries still gets its calendar without any of them being touched.

The check is the calendar itself — a year missing any of its weekends hasn't been filled —
rather than a stored "done" marker, which can claim a year is finished when it never
actually got filled. So a year that missed out corrects itself on the next load.

### Which years the app offers

The year picker runs from your earliest year with anything logged (or last year, while
it's still laid out) to **one year past the current financial year**. That's worked out
from today's date every time, so on 1 October the new year opens by itself and the one
after it appears — nothing to do.

Only logging moves it. Opening a future year lays its calendar down, but weekends and
holidays alone don't count as data, so browsing never makes the list grow.

Going further forward is deliberate: **Settings → Add FY29** (the button names the actual
next year) takes it one year further and lays that year out.

Going back, you can step one year before your earliest data — arrow back past 1 October —
to backfill it. A year number from nowhere, like `?fy=1` in the address bar, opens the
current year instead of laying down a calendar for 2001.

On startup the app removes calendars nobody used outside that range. That's strictly
limited to years holding nothing but weekends, non-working days and public holidays with
no times against them — anything you logged is never touched, and a year with real entries
is always in the picker.

Precedence is **weekend → public holiday → non-working day**, matching the original
spreadsheet: a public holiday that lands on your non-working Monday reads `PH`, and one
that lands on a weekend stays `W`.

Clearing never loses the shape of the calendar. A cleared day goes back to its calendar
code: a Saturday reads `W` again, Melbourne Cup reads `PH`, your non-working Monday reads
`NW`. Only an ordinary weekday clears to empty.

**Fill weekends, public holidays & non-working days** (Settings) runs the same pass by
hand. It never overwrites a day you've already coded. After you change your non-working
weekday it also moves the `NW` days: from today on, untouched `NW` days on the old weekday
go back to blank and the new weekday is filled. Earlier ones are history and stay.

**Clear future days** (Settings, below it) wipes everything logged from tomorrow to the
end of the financial year being viewed — a planned year you'd rather redo, say. Today and
anything earlier is never touched, and neither is the calendar: weekends, public holidays
and non-working days stay, so the year keeps its shape and only your entries go. It shows
the exact range and day count before it commits.

### Public holidays

Victorian public holidays are computed from the rules that define them (second Monday in
March, first Tuesday in November, Easter, and the weekend substitution rules), so they're
correct for any year without a lookup table to maintain. Verified against Business
Victoria's published listings for 2025 through 2028, and against the nine public holidays
in the original FY27 spreadsheet — which they reproduce exactly.

The exception is **AFL Grand Final Friday**. Victoria sets it each year once the AFL
releases its schedule, so it can't be derived. Confirmed dates live in
`AFL_GRAND_FINAL_FRIDAY` in `server/holidays.js` (2025 and 2026 so far). Any year without
one shows a note under the grid instead of a guessed date — add the year and date to that
object when it's announced, or just code the day `PH` by hand.

---

## Versioning

The number in the top right of the page is the release. It comes from
`package.json`, which is the only place a version is written by hand — and not
even by hand, because `npm run bump` writes it.

```
npm run bump          # 1.1.0 -> 1.1.1
npm run bump minor    # 1.1.0 -> 1.2.0
npm run bump major    # 1.1.0 -> 2.0.0
npm run bump -- 2.0.0 # an exact version
```

| | When |
|---|---|
| **MAJOR** | The database or the API changes shape — an old backup may need thought |
| **MINOR** | A new feature, or a visible change to how something behaves |
| **PATCH** | A fix, a layout tweak, wording |

One command moves all three places at once: `package.json`, the `APP_VERSION`
constant in `public/app.js`, and a dated stub at the top of `CHANGELOG.md` for
you to fill in. They can't drift apart if nothing else ever edits them.

### Telling a stale page from a stale deploy

The release number is baked into `public/app.js`, so the page carries its own
copy. On load it compares that against the version the server reports, and the
two can only disagree when the browser is running older JavaScript than the
server is serving — a cached page.

When that happens the badge turns amber and reads `v1.1.0 → v1.2.0`. Click it
and the page reloads past the cache. So a page that looks current *is* current,
which the old build timestamp couldn't promise: it changed on every deploy,
including the ones that changed nothing, and it said nothing at all about the
page you happened to be looking at.

`/api/health` answers the same question from outside the browser:

```bash
curl -s http://localhost:8095/api/health
{"ok":true,"today":"2026-09-29","tz":"Australia/Melbourne",
 "version":"1.1.0","build":1790664177824,"buildUtc":"2026-09-29T06:42:57.824Z"}
```

`version` is the release; `build` is the deploy, taken from the newest file in
`public/`, so two deploys of the same release are still distinguishable. The
container logs the version it started on, and warns if the page and
`package.json` have fallen out of step:

```
Office attendance v1.1.0 on http://0.0.0.0:8080
Version mismatch: public/app.js says 1.1.0, package.json says 1.2.0 - run: npm run bump
```

---

## Layout

```
server/
  index.js      entry: environment, database, startup tidy, listen, clean shutdown
  app.js        the routes, built by createApp({ db, today }) so tests can drive it
  http.js       errors with status codes, JSON in and out, headers, static files
  validate.js   every value from outside is checked here before it's stored
  calendar.js   which years exist, the weekend / holiday / NW calendar, clearing
  calc.js       the monthly rollups - mirrors the workbook
  holidays.js   Victorian public holidays from their rules
  codes.js      the attendance codes and what each one counts towards
  csv.js        the CSV export
  db.js         SQLite: schema, settings, days
  version.js    release number and build stamp
public/
  app.js        entry point; holds APP_VERSION
  js/           the page, one module per part: state, log card, tiles, grid, settings
  lib/dates.js  calendar helpers shared by the server and the page - one copy, no build
test/           npm test
scripts/        bump.mjs (versions), test.mjs (test runner)
```

## Codes

| | | Work days (requirement) | Days worked (key) | Total work days (key) |
|---|---|:--:|:--:|:--:|
| `O` | Office | ✓ | ✓ | ✓ |
| `H` | Home | ✓ | ✓ | ✓ |
| `WS` | Working sick | — | ✓ | ✓ |
| `L` | Annual leave | — | — | ✓ |
| `LOY` | Loyalty leave | — | — | ✓ |
| `PL` | Parental leave | — | — | ✓ |
| `LSL` | Long service leave | — | — | ✓ |
| `S` | Sick leave | — | — | ✓ |
| `PH` | Public holiday | — | — | — |
| `NW` | Non-working day | — | — | — |
| `W` | Weekend | — | — | — |

## The maths

Mirrors the workbook exactly, including its two different day counts.

**The monthly row** — this is what the office requirement is measured against:

```
WORK DAYS      = days coded O or H        (working sick excluded, as in the row formula)
OFFICE DAYS    = days coded O
% DAYS         = OFFICE DAYS / WORK DAYS
REQ DAYS       = WORK DAYS × office requirement (50%)
GAP            = REQ DAYS − OFFICE DAYS      (positive = short)

OFFICE HRS     = Σ (OUT − IN) on office days
AVAILABLE HRS  = WORK DAYS × standard day (10.75 h)
% HRS          = OFFICE HRS / AVAILABLE HRS
```

**The key totals** — shown under the grid, counted the way the workbook's key panel counts them:

```
TOTAL DAYS WORKED = O + H + WS
TOTAL WORK DAYS   = everything except public holidays, non-working days and weekends
```

So a working-sick day is a day you worked and shows in the key totals, but it doesn't
inflate the denominator of the office percentage. That's the workbook's behaviour and
the app reproduces it.

Standard day, office requirement %, non-working weekday and default in/out times are all
editable in **Settings**.

---

## Data & backup

Everything lives in one SQLite file (`/data/attendance.db`, on the `attendance-data` volume).

- **Backup JSON** in Settings downloads the full history plus settings.
- **Restore backup…** reads that file back in.
- **Export CSV** gives one row per logged day for the selected FY — handy if you need to
  hand something to a manager or drop it back into Excel.

A cron-friendly backup:

```bash
docker compose exec -T attendance wget -qO- http://127.0.0.1:8080/api/export.json \
  > ~/backups/attendance-$(date +%F).json
```

---

## API

| Method | Path | |
|---|---|---|
| `GET` | `/api/state?fy=27` | Days, settings, codes and the full rollup |
| `PUT` | `/api/days` | `{"days":{"2026-10-01":{"code":"O","in":"07:30","out":"17:00"}}}` — `null` deletes |
| `PUT` | `/api/settings` | Any of the settings fields |
| `POST` | `/api/calendar-skeleton` | `{"fy":27}` — fill weekends, public holidays and non-working days |
| `POST` | `/api/add-fy` | Move the horizon on one year and lay that year out |
| `POST` | `/api/clear-future` | `{"fy":26}` — clear entries from tomorrow to that year's end |
| `GET` | `/api/export.csv?fy=27` · `/api/export.json` | Exports |
| `POST` | `/api/import` | Restore a backup — checked in full first, written in one transaction; returns `imported` and `skipped` |
| `GET` | `/api/health` | Healthcheck, plus `version`, `build` and `buildUtc` |

Every change must be sent as `content-type: application/json` (415 otherwise), a bad value
is a 400 that says what was wrong, the wrong method a 405, and an unexpected fault a 500
with the detail in the server log.

---

## Security

There is no login in the app itself — it relies on the reverse proxy in front of it.

- **The published ports skip the proxy.** `8095:8080` and `8096:8080` let anyone who can
  reach the host on those ports read and change everything without the proxy's password.
  That's fine on a home LAN, and it's what makes `http://linuxserver:8095` work. If the host
  is ever reachable from outside, bind them to one interface
  (`"192.168.1.x:8095:8080"`) or remove them — the proxy reaches the container over the
  Docker network regardless.
- **Changes must be JSON.** A browser can't send `application/json` to another site without
  a preflight this server never approves, so another page can't quietly post a form at the
  API using the login your browser has saved. Requests the browser marks cross-site are
  refused too.
- **Headers.** Every response carries a Content-Security-Policy (scripts and styles from
  this origin only, no framing), `nosniff`, `no-referrer`, and `no-store`.
- **Exports.** CSV cells that start with `=`, `+`, `-` or `@` get a leading apostrophe, so a
  comment can't run as a formula when the file is opened in Excel.
- **Container.** Runs as a non-root user that can write only to `/data`, with no Linux
  capabilities and no privilege escalation.
