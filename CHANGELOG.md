# Changelog

Versions are `MAJOR.MINOR.PATCH`:

- **MAJOR** — the database or the API changes shape. A restore from an older
  backup may need thought.
- **MINOR** — a new feature, or a visible change to how something behaves.
- **PATCH** — a fix, a layout tweak, wording.

`npm run bump [major|minor|patch]` moves the number in every place it appears
and opens an entry here. Nothing else should edit a version by hand.

## 1.17.2 - 2026-10-01

- **Phone Month tab key:** *weekend* is gone (weekends already show W), and *still to
  come* now reads *planned (faded)*, matching the rest of the app.

## 1.17.1 - 2026-10-01

- **Phone version:** a phone set up on 1.8.0 and still on that release's standard day
  (7.6 h, 09:00 to 17:00) moves to the current one, 8.75 h, 09:00 to 17:45, once, and
  says so. Anyone who changed any of those keeps their own. New phones already start on
  8.75 h.

## 1.17.0 - 2026-10-01

- **Updates on the phone version.** A home-screen app is rarely fully closed, so the
  offline copy could keep running an old release. Now:
  - The app checks for a newer release when it opens and when you come back to it. When
    there is one, the version badge turns yellow (*v1.16.0 → v1.17.0*); tap it to update.
  - **Settings › Check for updates** does the same on demand, or says you're up to date.
  - Updating drops the offline copy and loads the new release from the site. Your
    attendance isn't touched, and with no connection nothing is dropped.

## 1.16.0 - 2026-10-01

- **Phone Year tab:** the columns are now **Days %**, **Days +/-**, **Hours %** and
  **Hours +/-**: each measure's share, then where it stands against the target.
- **Red below target:** an office percentage under the target (50%) is red, in the
  grid's % and H% columns, the phone's Year tab and the Office days card.
- **The AFL Grand Final note can be closed** with its ✕. It stays closed in that browser
  for those years, and comes back for a new year whose date isn't announced.
- **Clear day stands apart** from the codes: below a dashed line, in red, with a ✕.

## 1.15.0 - 2026-10-01

- **Grid:** the *vs 50%* day column is gone. The office **%** beside it already says it.
- **Phone Year tab:** four columns. **Office D.** (office days as a % of work days),
  **Office H.** (office hours as a % of available hours), **Days** and **Hours** (ahead
  or short of the target). Planned days are included, as before. The headers give the
  meaning on hover, and the list fits phones down to 320px wide.
- **Wording:** *incl. plans* is now *incl. planned*, and the *Day length* card is
  *Average day length*.

## 1.14.0 - 2026-10-01

- **Restore with a passkey.** Cloud backup can now be unlocked with Face ID or a
  fingerprint instead of typing the recovery code.
  - Save one from the recovery code screen at setup, or Settings › Backup › **Add
    passkey**. On a new phone, **Restore a backup… › Use a passkey**.
  - The passkey gives the phone a secret only it can produce (WebAuthn PRF). That secret
    locks the recovery code, and the locked code is kept beside the backup. The site
    never sees the secret or the code.
  - Passkeys sync within iCloud Keychain, Google Password Manager or 1Password. The
    recovery code is still the way back between iPhone and Android, or if a passkey is
    lost.
  - Saving a passkey proves the whole round trip first. Where a phone's passkeys can't
    do this, it says so and nothing is saved.
  - Settings lists the passkeys, each with **Remove**. Turning cloud backup off removes
    them too.

## 1.13.0 - 2026-10-01

- **Cloud backup for the standalone version.** Each phone backs itself up, encrypted,
  a few seconds after every change. No account: setup shows a recovery code
  (`XXXX-XXXX-XXXX-XXXX`) once, and that code restores everything on a new phone.
  - The code stays on the phone. It makes both the backup's id and its AES-256 key, so
    only encrypted data is ever sent, and no one else can read it.
  - With no signal it waits, says so in Settings, and sends when the connection's back.
    It also sends as the app goes to the background.
  - Two phones on one code never overwrite each other silently: the second is asked
    whether to use the cloud copy or keep its own.
  - Settings › Backup shows whether it's on and when it last backed up, with
    **Show code**, **Restore…** and **Turn off** (which deletes the cloud copy).
  - It's ticked on the setup screen; untick it to keep everything on the phone.
- **The file backup stays**, now labelled **Save file** and **Open file…** in the
  standalone version, so **Restore…** clearly means the code. The backup reminder only
  appears when cloud backup is off or failing.
- **Cloudflare:** a small Worker (`worker/index.js`) now runs beside the static site and
  keeps the backups in a KV namespace, created on the first deploy. Nothing to set up.

## 1.12.0 - 2026-10-01

- **Confirmed monthly rules.** Both days and hours use Office + Home days. The hours
  card shows its formula, days targets show whole days, and planned days are labelled.
- **Accurate actuals.** Equal In/Out times count as zero recorded hours, future plans
  stay out of average completed-day length, and a future FY has no month-to-date actuals.
- **Reliable saves.** Queue mutations, retain pending day edits during refresh, ignore
  stale navigation responses, and distinguish a successful save from a failed refresh.
- **Safer data handling.** Reject malformed day records and backups without deleting
  attendance. Restore and settings/calendar updates are atomic in SQLite and browser
  storage. Calendar changes and year cleanup preserve custom notes.
- **Browser storage.** Reload current data before writes, coordinate tabs with Web Locks,
  roll back failed writes, and preserve unreadable data with a recovery download.
- **Punching.** Use the app's time zone, guard double taps and date changes, and make
  the home-screen In shortcut explicitly punch in.
- **Standalone build.** Protect build destinations, use relative manifest URLs, and
  cache complete releases without deleting other apps' caches. Updates wait for old
  app tabs to close.
- Limit NSW/ACT ANZAC holiday exceptions to declared years; document future-calendar
  limitations. Fix Windows paths in version checks and expand regression coverage.

## 1.11.0 - 2026-10-01

- **Cleaner cards.** Every card (desktop tiles, the Year tab, the phone's Today card and
  Month tab) now uses one layout: a small label, one big number, one short line of
  figures, and the bar. The sentences, the pills that repeated the number and the bar
  captions are gone. The explanation is on hover. A note line only appears when there's
  something to flag: planned hours, where a month stands so far, days estimated, or
  missing times.
- **+ and − instead of words.** Ahead and short are a sign and a colour everywhere: +3.25
  in green, −11.63 in red. That covers the cards, the grid's days and hours gaps, and the
  phone's year list.
- **Grid totals include what you've entered ahead.** The hour columns (and the year total)
  now count planned hours, the same way the day columns count planned days. A planned
  office day with no times counts as a standard day; totals that include one are in
  italics, with the reason on hover. Missing times on past days show as an amber dot,
  not amber numbers.
- The Today card is days and hours side by side, to date; the average moved off it. Day
  length on the tiles has no bar now, since it's background.

## 1.10.0 - 2026-10-01

- **The month view counts the hours you plan ahead.** Codes and times entered on days still
  to come are the plan. The Month tab now shows the whole month with plans included: hours
  ahead or short if the plan holds, made up as "47.50 done + 28.50 planned of 96.75 h
  needed". Change a planned time and the month moves with it.
- A month under way also shows where it stands today ("So far: 11.63 h short"). A month
  already over is just what happened.
- A planned office day with no times counts as a standard day, and the view says how many
  it assumed. So does today while you're still at work.
- The desktop tiles do the same for **Month** and **Full year**. **Month to date** and **Year
  to date**, the phone's Today card and the grid still count days to date.

## 1.9.0 - 2026-10-01

Hours are about the 50% target now, not the average day.

- **One measure everywhere: office hours ahead or short of the 50% target, so far.** It
  counts the days to date. Today only counts once its In and Out are both in, so being
  at work doesn't read as hours behind. A month still to come shows nothing yet, rather
  than looking hours short.
- **Phone, Today:** the month card adds an hours line: "11.63 h short", with hours done
  against hours needed. The average office day becomes a footnote.
- **Phone, Month:** Office days and Office hours vs 50% side by side; the average is a
  footnote.
- **Year tab and the desktop tiles:** Office days, then Office hours vs 50%, then Day
  length. The hours tile leads with hours ahead or short.
- **Year list (phone):** Month, Office, Days, Hours. Hours is the gap to the target; Avg
  day is gone.
- **Desktop grid:** the compact Hours columns are Office, H% and Gap, so they now sit
  where Avg was. Avg and Timed moved behind "All hour columns". Missing times still show
  as amber H% and Gap, with the reason on hover. The hour columns count days to date; the
  day columns still count planned days.
- `APP_TODAY` pins the server's date, for testing only.

## 1.8.1 - 2026-10-01

- **Times are always 24-hour.** The browser's own time boxes follow the computer's
  language settings, and showed 12-hour times on some machines. They're now plain text
  boxes that read `HH:MM`. Type a time any natural way (`930`, `9:30`, `1745`, `5:45pm`)
  and it's tidied when you leave the box. Something that isn't a time puts the box back
  and says so. This covers the In and Out times, the standard hours in Settings, and the
  standalone version's setup screen.
- **Standalone version: a new phone starts on 8.75-hour days, 09:00 to 17:45** (was 7.6
  hours, 09:00 to 17:00). Phones already set up keep their own settings.

## 1.8.0 - 2026-09-30

**A standalone version for colleagues.** The same app as a static site that runs
entirely in the browser, with each person's data on their own phone. No server, no
Docker, no account. `npm run build:standalone` builds it into `dist/`, and Cloudflare
hosts it from the private repo, set up by `wrangler.jsonc` (see README, "The standalone version").
- A first-run setup asks for the public holiday state (guessed from the phone's time
  zone), day off, standard day, office target and usual hours. **Restore a backup…**
  there moves someone to a new phone.
- Backups and CSV exports go to the phone's share sheet, or a normal download on a
  computer.
- Works offline once opened. Updates arrive the next time it's opened with signal.
- Asks the browser to keep its data permanently, and Settings says whether it agreed.
  A reminder appears a week in with no backup, and a month after the last one.

**Public holidays for every state and territory.** Settings › Public holidays picks
ACT, NSW, NT, Queensland, SA, Tasmania, Victoria or WA. Each is checked against the Fair
Work Ombudsman's 2026 and 2027 lists. Where holidays differ by region, the capital's are
used: Brisbane's Ekka, Hobart's Regatta and Show. Your copy stays on Victoria.

**Changing the non-working day or the state now moves the calendar by itself** from
today on, and says how many days moved. Before, you had to press Refill afterwards. Days
before today, and anything you've logged, are left alone.

Under the hood, the server's logic moved to `public/core/` so both versions share it.
`server/app.js` is now a thin HTTP layer over `public/core/service.js`. The server's API
responses are unchanged apart from the new `holidayState` setting and a `moved` count.

## 1.7.0 - 2026-09-30

- **The stale-version badge now fixes itself when clicked.** A cache in front of the app
  (Nginx Proxy Manager's "Cache assets" does this) could keep serving the previous
  release's JavaScript after a redeploy, ignoring the app's no-store header. A reload
  couldn't get past it, so the badge stayed amber. The page now loads its code from an
  address unique to each deploy (`/b/<version>-<build>/…`), which no cache has seen before.
  The page itself is never cached, so it always points at the current build.
- **The year list only shows years that matter:** any year with something logged in it,
  this year, and the years ahead. A past year holding nothing but weekends and holidays
  is no longer listed. You can still step back into one a month at a time to backfill.
- **Add FY asks first,** so a misclick can't add a year. The question says which months it
  lays out and that the year is added automatically on 1 October of the year before it.

## 1.6.0 - 2026-09-30

- **Weekends can't be changed.** A Saturday or Sunday opens read-only: the code chips,
  times, comment and punch button are disabled, with a note saying why. Ranges and
  Ctrl-picks skip weekends whatever code is applied, including Public holiday and
  Non-working day, which used to recode them. The server refuses a weekend change too,
  and a restore puts a plain W on any weekend the backup has something else on.

## 1.5.0 - 2026-09-30

- **Shift+↓** now selects to the end of the work week, the Friday before the next
  weekend, and **Shift+↑** back to its Monday. Pressing again goes a further week.
  Before, it jumped exactly 7 days, which selected 8 (Monday to Monday). Plain ↑ ↓ still
  move a week, and Shift+← → still move a day.
- **Ctrl-click** (⌘-click on a Mac) picks any mix of days on the grid. Ctrl-click a
  picked day to take it out, and Ctrl+Shift-click to add a range. A code then goes on
  the picked work days. Weekends, holidays and non-working days are left alone, as with
  a range.
- Weekends show **W** in the grid and the phone's month view, in a quieter weight than
  the other codes.

## 1.4.1 - 2026-09-30

- Settings › Appearance: "Match device" no longer spills out of its button on a phone.
  On narrow screens each theme button shows its icon above the label.

## 1.4.0 - 2026-09-30

U9 to U18 from the review, on the dev branch.

**Desktop**
- The year grid fits the page at 1280px and wider, with no sideways scroll, and its card
  lines up with the cards above. The grid shows Office, Avg and Timed under Hours. The
  workbook's other hour columns (Avail, H%, Req, Gap) sit behind "All hour columns", and
  the choice is kept for this browser. (U9)
- A new Timed column shows how many office days so far have times, for example "8 / 9". When
  some are missing, it turns amber, along with H% and the hours gap, and hovering explains
  why. Office days still to come aren't counted, so a planned month no longer looks
  incomplete. The tiles and the month view count the same way. (U15)
- The log card shows the date with its times and punch button on the left and the codes
  and comment on the right, so it's half as tall as before. (U16)
- A line under the date lists the keyboard shortcuts: ← → move a day, ↑ ↓ a week, Shift
  selects a range. It's hidden on touch screens. (U18)

**Phone**
- Select on the Month tab picks a range by touch: tap the first day, then the last. A sheet
  then applies a code to the work days in the range. Weekends, holidays and non-working
  days in the range are hatched and stay as they are. It's the touch version of
  Shift-click. (U10)
- The date heading is the date picker: tap it to choose a day. The date is shown once, and
  Today only appears when you're looking at another day. (U17)

**Both**
- Code colours have a dark palette, so dark mode no longer shows bright light-mode
  blocks. (U11)
- Every code's text is at least 4.5:1 against its colour, in both themes, and so are the
  faint grey labels. (U12)
- Settings are in sections: Working pattern, Appearance, Years and calendar, and Backup.
  Working pattern saves as you change it; there's no Save button. A refused value is
  explained and the field goes back to what was saved. Changing the non-working day points
  you at Refill. Clear future days is disabled, and says why, for a year with no days
  after today. (U13)
- The theme has three states, Match device, Light and Dark, each with an icon. You can set
  it from the header button, the phone menu or Settings. (U14)
- The API summary gains `pastOfficeDays`, `pastTimedOfficeDays` and
  `untimedPastOfficeDays` for each month and the year. Nothing existing changed.

## 1.3.0 - 2026-09-30

U1 to U8 from the review, on the dev branch.

**Phone**
- Installable: a web manifest and home-screen icons, so it opens full screen from its own
  icon. Long-press the icon for an "In now" shortcut. The manifest is fetched with the
  proxy login, which the password in front of the app needs. (U1)
- One punch button that does the next thing: In now with the time, then Out now. A line
  under it confirms what was saved, with Undo. While you're in, the hours count up. (U2)
- The header is one line: title, year and a menu holding Settings, the theme and the
  version. The version badge only appears in the header when the page is stale. (U3)
- Today / Month / Year tabs along the bottom. Month is a Monday-first calendar with that
  month's figures under it: swipe or use the arrows to change month, tap a day to open it.
  Year shows the tiles and one row per month in place of the 31-column grid. (U8)
- 44px day arrows, bigger buttons and chips; "Clear" is now "Clear times". (U6)

**Both**
- The tiles are now office days, day length (average office day against the standard
  day) and office hours against the target, which says it assumes 10.75 h office days
  and is no longer painted red for being short. (U4)
- Gaps in the grid read in words, "20.75 short" / "3.00 ahead", instead of a red plus
  sign. (U5)
- The Shift-click hint only shows where there's a keyboard. (U7)

## 1.2.0 - 2026-09-29

A full review and restructure, on the dev branch. The page looks the same to the pixel; the
fixes are in what it does.

**Behaviour you'll notice**
- The year list moves with the date. From 1 October FY28 is offered and FY27 opens by
  itself. Before, the stored horizon never moved, and on 1 Oct 2027 the app would have kept
  opening FY27 - with "In now" writing to the same day a year earlier.
- Clearing a day puts its calendar code back: Melbourne Cup reads PH again, your
  non-working Monday NW. Only an ordinary weekday clears to empty.
- Applying a code to a range recodes only the work days in it. Blocking out leave no longer
  turns the weekends and public holidays inside the range into leave days, which inflated
  Total Work Days.
- After changing the non-working weekday, "Fill weekends…" moves the NW days from today on.
- A time typed on a blank day, weekend or holiday saves it as Office, like the punch buttons.
- A comment on a day with no code says to pick one, instead of disappearing.
- An Out earlier than the In is flagged beside the hours.
- A page left open overnight moves on to today when you come back to it.
- Shift + arrow keys select a range.

**Fixes**
- A request for `//` crashed the server.
- Impossible dates (2027-02-31), junk settings and out-of-range years are refused with a
  message instead of being stored. A restore with bad settings changes nothing.
- A URL like `?fy=1` no longer lays down calendars back to 2001 that nothing could remove.
- Another website could post a form at the API using your saved proxy login; changes now
  have to be sent as JSON.
- Typing a comment while a save was finishing wiped it; a slow save could repaint the grid
  with the year you'd just left; arrow keys moved the day behind an open question.
- The CSV export without a year was named "fyundefined" and empty. Cells that look like
  formulas are neutralised.
- Security headers on every response; exports no longer cacheable.
- The startup version-mismatch warning had lost its message.
- The container stops cleanly, runs with no capabilities, and can't rewrite its own code.

**Structure**
- The server is split by job (routes, HTTP, validation, calendar, CSV) and the page into
  modules under `public/js/`. Date helpers live once in `public/lib/dates.js`, shared by
  both sides with no build step.
- `npm test`: 53 checks with Node's own runner, including every FY27 month against the
  spreadsheet and what happens on 1 October.

## 1.1.2 - 2026-09-29

- The comment box no longer carries example text. It sits empty under its
  "Comment" label.

## 1.1.1 - 2026-09-29

- The grid's hours columns show two decimal places instead of one. Times are
  entered to the quarter hour, so one place turned a genuine 1.75 into 1.8 —
  a number that was never worked. Percentages and the day columns are
  unchanged.

## 1.1.0 - 2026-09-29

- A release number in the top right of the page, and a scheme behind it.
  `package.json` is the one source of truth; `npm run bump` moves it, the
  `APP_VERSION` constant in `public/app.js` and this file together.
- The page compares the version it was built from against the version the
  server reports. A page served from cache now says `v1.0.0 -> v1.1.0` in
  amber and reloads past the cache when clicked, instead of looking current.
- `/api/health` returns `version`, `build` and `buildUtc`. `build` is the
  deploy (newest mtime in `public/`); `version` is the release.
- The server logs the running version at startup and warns if the page and
  `package.json` have drifted apart.

## 1.0.0 - 2026-09-01

First working replacement for the FY27 spreadsheet: same codes, same colours,
same two day-counts. One-tap logging, the full-year grid with shift-click
ranges, self-filling weekends and Victorian public holidays, the FY horizon,
month / month-to-date / year-to-date / full-year totals, confirmation before
overwriting a time that is already set, CSV and JSON export, and the clear-future
tidy-up. Deployed as a Portainer stack behind Nginx Proxy Manager.
