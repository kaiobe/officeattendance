# Changelog

Versions are `MAJOR.MINOR.PATCH`:

- **MAJOR** — the database or the API changes shape. A restore from an older
  backup may need thought.
- **MINOR** — a new feature, or a visible change to how something behaves.
- **PATCH** — a fix, a layout tweak, wording.

`npm run bump [major|minor|patch]` moves the number in every place it appears
and opens an entry here. Nothing else should edit a version by hand.

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
