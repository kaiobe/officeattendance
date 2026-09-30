# Office Attendance

Self-hosted tracker for office days and hours across an **October–September financial year**.
A direct replacement for the FY2x spreadsheet: same codes, same colours, same formulas —
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

## The standalone version (for colleagues)

The same app, built as a static site that runs entirely in the browser. Each
person's days and settings are stored on their own phone. There's no server,
no Docker and no account, and nothing is sent anywhere. It's built from the same
code as the server version, so fixes land in both.

### Putting it on Cloudflare

Cloudflare hosts it for free from the private repo. `wrangler.jsonc` in the repo
tells it to publish the built `dist/` folder as a static site, with no server code.

1. In the Cloudflare dashboard, go to **Workers & Pages › Create application** and pick
   the Git repository option. Sign in to GitHub, give Cloudflare access to
   `kaiobe/officeattendance` only, and select it.
2. On **Set up your application**:
   - **Project name:** `officeattendance`. It must match `name` in `wrangler.jsonc`.
   - **Build command:** `npm run build:standalone`
   - **Deploy command:** `npx wrangler deploy` (the default)
   - **Preview command:** `npx wrangler preview` (the default)
   - Leave **Enable Preview builds** on and **Protect with Cloudflare Access** off.
3. **Deploy.** It builds from `main`, so merge dev into main first. The address is
   `officeattendance.<your-subdomain>.workers.dev`. Share that with your colleagues,
   or add your own domain under the Worker's **Settings › Domains & Routes**.

Every push to `main` redeploys. Pushes to other branches, like `dev`, get their own
preview address, so you can try changes before they reach anyone.

Cloudflare Pages works too: **Create application › Pages › Connect to Git**, with build
command `npm run build:standalone` and output directory `dist`.

To build it yourself: `npm run build:standalone` writes the site to `dist/`, and any
static file server can host it.

### What your colleagues see

- **First visit:** a setup screen asks for their public holiday state (guessed from the
  phone's time zone), day off each week, standard day, office target and usual hours.
  A new phone starts on a 5-day, 7.6-hour week. **Restore a backup…** on that screen
  moves someone to a new phone.
- **After that:** it's the same app you use, with the tabs, punch button, month view and
  year grid. Backups and CSV exports go to the phone's share sheet (Files, Drive, email),
  or a normal download on a computer.
- **Offline:** once opened, it works with no signal. Updates arrive the next time it's
  opened with a connection.

### Keeping their data safe

Browser storage can be cleared. iPhones in particular may clear a website's data if
it goes unused for a few weeks, unless it's been added to the home screen. So the app:

- asks the browser to keep its storage permanently, and Settings › Backup says whether
  it agreed;
- shows home-screen instructions on the setup screen when it's open in a browser tab;
- shows a reminder at the top of the page a week after starting with no backup, and a
  month after the last backup. **Later** puts it off for a week.

The backup file is the only copy outside the phone. It's the same format as the server
version's, so a colleague's backup could be restored into a server copy too.

### How it's put together

The logic that doesn't need Node lives in `public/core/`: calculations, holidays,
calendar, validation, and `service.js`, which is the whole API as plain function
calls. The server wraps that service in HTTP over SQLite (`server/app.js`). The
standalone version (`public/local/`) calls it directly over `localStorage`. Both
supply the same store interface, so there's one copy of every rule.
`scripts/build-standalone.mjs` copies `public/` to `dist/`, points the page at
`standalone.js`, and adds a service worker and Cloudflare's `_headers`.

---

## Environment

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8080` | Port inside the container |
| `DB_FILE` | `/data/attendance.db` | SQLite file; keep it on a volume |
| `TZ_NAME` | `Australia/Melbourne` | Decides what "today" means in the app |

---

## Using it

**Log a day** — pick a date (arrow keys ← → also move a day, ↑ ↓ a week; the hint under
the date says so), tap a code. It saves immediately. On an office day, *Standard day* fills your usual 07:30–17:00.

**Punching in and out** is one button that does the next thing: it reads *In now* with
the current time until there's an In time, then *Out now*. Punching codes the day Office.
A line under the button confirms what was saved, with *Undo* to put the day back exactly
as it was. While you're in, the hours beside the times count up ("3 h 18 m so far").

Entering a time on a blank day, a holiday or your non-working day also saves it as an office
day. **Weekends can't be changed at all**: a Saturday or Sunday opens read-only, the server
refuses edits to one, and a restore puts W back on them.

An Out earlier than the In is counted as a shift across midnight, and flagged beside the
hours in case it was a slip.

A page left open overnight catches up by itself: when it comes back into view it checks
the date with the server, so *In now* the next morning lands on the right day.

**Grid** — the whole financial year, one row per month. Click any cell to load it into the
log panel. **Shift-click** a second cell to select a range, then tap a code to apply it.
That's how you block out a fortnight of long service leave in two clicks. From the
keyboard, **Shift+← →** extends a day at a time. **Shift+↓** runs to the end of the work
week (the Friday) and **Shift+↑** back to its Monday; press again for another week.
**Ctrl-click** (⌘-click on a Mac) picks any days you like: Ctrl-click again to drop one,
or Ctrl+Shift-click to add a range.

A range or a set of picked days recodes only the work days in it: weekends, public
holidays and your non-working day are left as they are, so the leave doesn't inflate the
day counts. Weekends show a quiet **W**. A dot in the corner of a cell means hours are recorded; a small triangle means there's a comment.
Gaps to the target read in words — "20.75 short", "3.00 ahead" — the same way as the tiles.

The grid fits the page at 1280px and wider. Under *Hours* it shows Office, Avg and
**Timed**: how many office days so far have times ("8 / 9"). When some are missing, Timed
turns amber, along with H% and the hours gap, and hovering says how many. Office days
still to come don't count. **All hour columns** brings back the workbook's Avail, H%, Req
and Gap; the grid then scrolls inside its card, and the choice is kept for this browser.

**The tiles** show office days against the requirement, *day length* (how long your
office days actually are, against the standard day), and office hours against the
workbook's target, which assumes every office day is a standard day. Hours are shown as
information rather than as a failure: a month can be on target for days with office days
shorter than 10.75 h, and the tiles now say why the two differ.

### On a phone

The page splits into three tabs along the bottom:

- **Today** — the log card, with the punch button first, and how this month is going.
- **Month** — one month as a calendar, Monday first. Swipe sideways or use the arrows to
  change month (it crosses into the next or previous financial year); tap a day to open it
  on Today. Days still to come are faded, and a dot means times are logged.
  **Select** picks a range by touch: tap the first day, then the last, then a code in the
  sheet that slides up. As with Shift-click, only work days change. Weekends, holidays and
  your non-working day are hatched and left alone.
- **Year** — the tiles and one row per month in place of the 31-column grid. Tap a month
  to open it in the Month tab.

The date heading is the date picker: tap it to choose a day. *Today* only appears when
you're on another day.

The header is one line: the year picker and a menu with Settings, the theme and the
version. The version badge only appears in the header when the page is stale.

### Settings and theme

Settings has four sections:

- **Working pattern** saves each field as you change it. A value the server refuses is
  explained and put back. It includes the public holiday state. Changing the state or the
  non-working day moves the calendar's own days from today on, and says how many moved.
- **Appearance** sets the theme.
- **Years and calendar** adds a year, refills weekends and holidays, and clears future days.
- **Backup** has CSV export, the JSON backup and restore.

The theme is **Match device**, **Light** or **Dark**. Set it from the header button
(desktop), the menu (phone) or Settings. The choice is kept per browser.

### Installing it on your phone

It installs like an app, opening full screen from its own icon with no address bar:

- **Android (Chrome):** menu › *Install app* (or *Add to Home screen*).
- **iPhone (Safari):** Share › *Add to Home Screen*.

Long-press the icon for an **In now** shortcut, which opens on today and punches in —
asking first if an In time is already there. The manifest is fetched with your proxy
login (`crossorigin="use-credentials"`), which the password in front of the app needs;
you may be asked for that password once inside the installed app.

## The calendar fills itself

Open a financial year and it arrives already laid out: `W` on every Saturday and Sunday,
`PH` on every Victorian public holiday, and `NW` on your non-working weekday. Only the
weekdays you actually work are left blank. It fills blank days only, so a year already
holding entries still gets its calendar without any of them being touched.

The check is the calendar itself — a year missing any of its weekends hasn't been filled —
rather than a stored "done" marker, which can claim a year is finished when it never
actually got filled. So a year that missed out corrects itself on the next load.

### Which years the app offers

The year picker runs from your earliest year with anything logged (or this year, if
there's nothing earlier) to **one year past the current financial year**. A past year
holding nothing but the calendar isn't listed. That's worked out
from today's date every time, so on 1 October the new year opens by itself and the one
after it appears — nothing to do.

Only logging moves it. Opening a future year lays its calendar down, but weekends and
holidays alone don't count as data, so browsing never makes the list grow.

Going further forward is deliberate: **Settings → Add FY29** (the button names the actual
next year) takes it one year further and lays that year out. It asks first, so a misclick
can't add a year.

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

Public holidays come from the rules that define them (second Monday in March, first
Tuesday in November, Easter, the weekend substitute rules), so they're correct for any
year with no table to maintain. **Settings › Public holidays** picks the state or
territory, and changing it moves the calendar's holidays from today on. Days before
today, and anything you've logged, stay as they were. Changing the non-working day
moves NW days the same way.

Every state and territory is checked against the Fair Work Ombudsman's 2026 and 2027
lists. Victoria is also checked against Business Victoria's lists for 2025 to 2028, and
against the nine holidays in the original FY27 spreadsheet.

Some holidays make no difference to work days, so they're left out: evening-only ones
(Christmas Eve and New Year's Eve from 6 or 7 pm in Queensland, SA and the NT) and
Tasmania's public-service Easter Tuesday. Where holidays differ by region, the capital's
are used: Brisbane's Ekka, Hobart's Regatta and Show. A day that's wrong where you are can
be coded `PH` by hand, or cleared.

The exception is **AFL Grand Final Friday**. Victoria sets it each year once the AFL
releases its schedule, so it can't be derived. Confirmed dates live in
`AFL_GRAND_FINAL_FRIDAY` in `public/core/holidays.js` (2025 and 2026 so far). Any Victorian year without
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
and the page reloads onto the current release.

That reload works even with a cache in front of the app. Nginx Proxy Manager's *Cache
assets*, or a CDN, can cache `.js` and `.css` by extension and ignore the app's no-store
header. So the page (never cached) loads its code from `/b/<version>-<build>/app.js`, an
address unique to each deploy. The modules' relative imports stay under the same prefix,
and the server treats `/b/<anything>/x` as `/x`. So a page that looks current *is* current,
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
  app.js        HTTP around the shared service, the page and its files
  http.js       JSON in and out, security headers, static files
  db.js         SQLite: schema, settings, days, and the store the service uses
  version.js    release number and build stamp
public/
  app.js        entry point; holds APP_VERSION
  standalone.js entry point for the standalone version
  js/           the page, one module per part: state, log card, tiles, grid, month, settings, theme
  core/         shared by the server and the standalone version:
    service.js    the API as plain calls - every route's logic
    calendar.js   which years exist, the weekend / holiday / NW calendar
    holidays.js   public holidays for every state and territory, from their rules
    calc.js       the monthly rollups - mirrors the workbook
    validate.js   every value from outside is checked here before it's stored
    codes.js, csv.js, settings.js, errors.js
  local/        the standalone version: localStorage store, first run, backups, offline
  manifest.webmanifest, icons/   what makes it installable on a phone
  lib/dates.js  calendar helpers shared by everything - one copy, no build
test/           npm test
scripts/        bump.mjs (versions), test.mjs (test runner), build-standalone.mjs
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

Each code has a light colour pair (the workbook's fills) and a dark one, in
`server/codes.js`. Every pair keeps its text at 4.5:1 or better against its fill.

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
