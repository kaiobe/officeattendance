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

`container_name` and the published port are the only things two stacks can't share,
so both are parameters with the production values as defaults. Deploy a second stack
from the same repo and set two environment variables in Portainer:

```
APP_NAME=attendance_test
HOST_PORT=8096
```

Named volumes are prefixed with the stack name, so the test copy gets its own empty
database and can't touch your real attendance data. If you proxy it, add a separate
proxy host forwarding to `attendance_test` on port 8080.

### Without Docker

Node 24+ (on Node 22 use `./run-dev.sh`, which adds the flag Node 24 has as standard):

```bash
npm start                              # http://localhost:8080
```

No npm dependencies — the server uses only Node built-ins, including `node:sqlite`.

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
or use *In now* / *Out now* to punch in and out live.

**Grid** — the whole financial year, one row per month. Click any cell to load it into the
log panel. **Shift-click** a second cell to select a range, then tap a code to apply it to
all of them — that's how you block out a fortnight of long service leave in two clicks.
A dot in the corner of a cell means hours are recorded; a small triangle means there's a comment.

## The calendar fills itself

Open a financial year and it arrives already laid out: `W` on every Saturday and Sunday,
`PH` on every Victorian public holiday, and `NW` on your non-working weekday. Only the
weekdays you actually work are left blank. It fills blank days only, so a year already
holding entries still gets its calendar without any of them being touched.

The check is the calendar itself — a year missing any of its weekends hasn't been filled —
rather than a stored "done" marker, which can claim a year is finished when it never
actually got filled. So a year that missed out corrects itself on the next load.

### How far ahead the app goes

The year picker runs from your earliest year with data up to a **horizon**, and stops.
The horizon starts one year past the current financial year, and browsing never moves it —
otherwise opening a future year would lay its calendar down, which would make it "have
data", which would offer another year beyond it, and so on forever.

Going further forward is deliberate: **Settings → Add FY29** (the button names the actual
next year) moves the horizon on by one and lays that year out. Asking for a year past the
horizon by URL is clamped rather than created.

On startup the app removes calendars auto-generated beyond the horizon. That's strictly
limited to years holding nothing but weekends, non-working days and public holidays with
no times against them — anything you logged is never touched, and a year with real entries
stays reachable in the picker even if it sits past the horizon.

Precedence is **weekend → public holiday → non-working day**, matching the original
spreadsheet: a public holiday that lands on your non-working Monday reads `PH`, and one
that lands on a weekend stays `W`.

Weekends are sticky. Clearing a Saturday puts `W` back rather than blanking it, so you
can wipe a range of days without losing the shape of the calendar. Only weekdays clear
to empty.

**Fill weekends, public holidays & non-working days** (Settings) runs the same pass by
hand — useful after changing your non-working weekday. It never overwrites a day you've
already coded.

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
| `GET` | `/api/export.csv?fy=27` · `/api/export.json` | Exports |
| `POST` | `/api/import` | Restore a backup |
| `GET` | `/api/health` | For the healthcheck |

There is no authentication — it's built to sit on the tailnet, not the open internet.
If you ever expose it, put it behind your reverse proxy's auth.
