# Changelog

Versions are `MAJOR.MINOR.PATCH`:

- **MAJOR** — the database or the API changes shape. A restore from an older
  backup may need thought.
- **MINOR** — a new feature, or a visible change to how something behaves.
- **PATCH** — a fix, a layout tweak, wording.

`npm run bump [major|minor|patch]` moves the number in every place it appears
and opens an entry here. Nothing else should edit a version by hand.

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
