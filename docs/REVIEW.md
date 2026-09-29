# Review: v1.2.0

29 September 2026, on the `dev` branch. There are two parts: what the refactor changed and fixed, then a critical UI/UX review of the phone and desktop layouts with prioritised suggestions. The refactor left the page pixel-identical, so every screenshot the review refers to still applies.

## At a glance

- **17 bugs fixed.** Two of them were high severity: the year span never moved forward, and a request for `//` crashed the server.
- **9 behaviour changes** you'll notice. They're listed below and worth reading before you merge to `main`.
- **53 automated tests** now live in the repo (`npm test`). Another 170 browser checks and 5 API suites ran against the refactor.
- The page is **unchanged to the pixel** in 21 of 24 screenshots (desktop, laptop and phone, light and dark). The other three show the Settings dialog, where one line of text changed.

## Part 1: the refactor

### Structure

| Before | After |
|---|---|
| `server/index.js`, 420 lines: routes, static files, validation, calendar and CSV together | `index.js` (startup), `app.js` (route table), `http.js`, `validate.js`, `calendar.js`, `csv.js` |
| `public/app.js`, 683 lines | `app.js` (entry point and `APP_VERSION`) plus `js/state`, `log`, `tiles`, `grid`, `settings`, `dialogs`, `format`, `main` |
| Date helpers written twice, once for the server and once for the page | `public/lib/dates.js`, imported by both. There's still no build step |
| Tests only in a scratch folder | `test/` and `npm test`, using Node's own runner with no dependencies |
| Settings accepted almost anything | Every value from outside goes through `validate.js` |

### Bugs fixed

| Severity | Bug | Effect |
|---|---|---|
| High | The stored year horizon never moved forward | On 1 Oct 2027 the app would still open FY27, and "In now" would write to 1 Oct 2026. From this Thursday FY28 would also have dropped out of the picker. |
| High | A request for `//` threw outside the error handler | The server process crashed. Anyone who can reach port 8095 could trigger it. |
| Medium | Applying a code to a range recoded the weekends, holidays and NW days inside it | Blocking out leave inflated Total Work Days. November went from 15 to 22. |
| Medium | Any other website could post a form at the API | This used your browser's saved proxy login, and a restore with `replace` wipes every day. |
| Medium | `?fy=1`, `?fy=-2` or `?fy=26.5` laid down phantom calendars | The picker grew to FY-2…FY29, rows with impossible dates were stored, and nothing in the app could remove them. |
| Medium | A restore wrote its settings unchecked | A requirement of `"abc"` turned every percentage into NaN. |
| Medium | Refreshing after a save overwrote the fields | A comment you were typing disappeared. |
| Medium | A slow refresh landed after you'd switched year | The header said FY27 while the grid showed FY26. |
| Medium | A tab left open overnight still thought it was yesterday | "In now" the next morning saved to the wrong day. |
| Low | Arrow keys worked behind the confirm dialog | The selected day changed underneath the question being asked. |
| Low | Impossible dates like 2027-02-31 were accepted | They were stored. |
| Low | Settings accepted weekday 9, and turned a standard day of `"x"` into 0 | The maths was corrupted without any warning. |
| Low | The CSV export without a year was named `fyundefined` and empty; formulas weren't neutralised | A comment like `=HYPERLINK(...)` would run in Excel. |
| Low | `constructor` and `__proto__` passed the settings allow-list | Junk keys were stored and polluted the settings object. |
| Low | Typing a time on a W, NW or PH day kept the code | The hours never counted. The punch buttons already recoded the day to O. |
| Low | A comment on a day with no code was silently discarded | It now says to pick a code. |
| Low | The startup version-mismatch warning had lost its message | It printed `Version mismatch: ` followed by nothing. |

Hardening also went in:

- security headers (CSP, `nosniff`, `no-referrer`) on every response
- exports no longer cacheable
- errors map to 400, 404, 405, 413, 415 or 500 instead of 400 for everything
- clean shutdown on `docker stop`
- the container runs with no capabilities and can't rewrite its own code
- database statements are prepared once and reused

### Behaviour changes to know before merging

1. **The year list follows the date.** It runs from your earliest logged year (or last year, while it's still laid out) to one year ahead. On 1 October FY27 opens by itself and FY28 appears. *Add FY* still goes further ahead.
2. **Clearing restores the calendar code.** Clear Melbourne Cup and it reads PH, clear your Monday and it reads NW. This extends the rule you set for weekends. Only an ordinary weekday clears to empty.
3. **A range spares calendar days.** Applying leave to Mon–Sun changes the work days only. The flag reports how many days it left alone. Applying W, NW or PH, or clearing, still covers the whole range.
4. **"Fill weekends…" moves NW days** after you change the weekday, from today on. Earlier NW days are history and stay.
5. **A time on a blank day, weekend or holiday saves it as Office.**
6. **Bad input is refused** with a message, both in the API and inside the Settings dialog. Before, it was stored.
7. **Changes must be sent as JSON.** The page already does this. Anything else scripting the API needs `content-type: application/json`.
8. **Shift + arrow keys** select a range.
9. **An Out earlier than the In** is flagged beside the hours. It still counts as a shift across midnight.

### Not changed

- **The published ports `8095:8080` / `8096:8080` bypass the proxy's password.** That's what makes `http://linuxserver:8095` work, and it's fine on a home LAN. The README explains how to bind them to one interface if the host is ever exposed.
- **The calendar is still stored as rows.** The cleaner long-term design would work out W/PH/NW when reading and store only what you log, with the non-working weekday dated so past years don't change when the setting does. That removes the whole class of phantom-year and clearing bugs, but it changes the data model (a 2.0.0), so it's a recommendation, not part of this.

## Part 2: UI/UX review

### Working well

Keep these:

- On the phone, *In now* / *Out now* are the first and largest controls.
- The confirmation guard only asks when there's a time to lose.
- The spreadsheet colours carry straight over, so the grid reads like the workbook.
- *Month to date* is the default view.
- The version badge.

### Do next: high impact, small effort

**U1. Make the phone version installable as an app.** There's no web manifest or home-screen icon, so it always opens as a browser tab with an address bar. Add `manifest.webmanifest`, an icon and `display: standalone`, and it launches full-screen from the home screen like an app. *Effort: S.*

**U2. One primary button on the phone.** *In now* and *Out now* sit side by side at the same weight, even though only one makes sense at a time. Show *In now* on a blank day and *Out now* once you're in. Confirm on the button itself ("In 08:02 ✓"). The 12px "Saved" flag in the card header fades after 1.6 s and is easy to miss after tapping. *Effort: S–M.*

**U3. Collapse the phone header to one line.** It wraps to three rows: the title and year range, then the FY picker, Settings and theme, then the version alone on the right. About 100px of sticky header sits on an 844px screen. Use one row with the FY picker and a menu for Settings and theme, and move the version into Settings. *Effort: S.*

**U4. The hours tile contradicts the days tile.** In October 2026 the days tile reads green "On target" while the hours tile reads red "▼ 20.75 hrs to go". The hours requirement is half of *all* work days × 10.75 h, so it's only met if office days average 10.75 h. The average is 9.5 h. The maths is the workbook's, but the page paints it as a failure without saying why. At minimum, label it ("assumes 10.75 h office days"). Better, show day length as its own measure. *Effort: S to label, M to rethink.*

**U5. Gap signs read backwards.** "+30.25" in red means *short*, but a plus reads as a surplus. The tiles say "to go" and "ahead". Use the same words in the grid, or a minus for short. *Effort: S.*

**U6. Touch targets and labels.**

- The previous/next day buttons are 30×21px. The usual minimum is 44.
- There are two buttons called "Clear" a short distance apart on the phone, one for the times and one for the day. Rename the first "Clear times".

*Effort: S.*

**U7. The grid hint says "Shift-click to select a range" on a phone,** which has no Shift key. Hide it on touch screens until there's a touch way to select (U10). *Effort: S.*

### Worth doing: bigger pieces

**U8. A month view for the phone.** The 31-column grid is 1,551px wide in a 348px viewport. About nine days show at once, and a month's stats are a long sideways scroll away. On a phone, show one month as a 7-column calendar with its stats underneath, and swipe between months. Keep the full grid for desktop. *Effort: M–L.*

**U9. Fit the desktop grid.** At 1,551px it needs a sideways scroll even at 1440. The Hours block is cut off, and at 1280 you lose 313px of it. The card also breaks out of the page width, so its left edge doesn't line up with the cards above. Tighten the stat columns, fold Avail and Req behind a toggle, or give the stats their own row. *Effort: M.*

**U10. Range selection by touch.** Add a *Select range* toggle (tap the first day, then the last) or a long-press. *Effort: M.*

**U11. A dark palette for the codes.** The spreadsheet pastels stay at full brightness in dark mode. Weekend cells, the least important thing on the page, are the brightest, at 13:1 against the background. Make dimmed dark variants of each code with the same hues. *Effort: M.*

**U12. Contrast.**

- Code text on its own fill fails the 4.5:1 guideline for small text: W 1.8:1, PL 2.8, NW 2.9, LSL 2.9.
- The small grey uppercase labels are 3.6:1.

Darken the text colours and keep the fills that match the spreadsheet. *Effort: S–M.*

**U13. Split Settings.** The dialog mixes a form that needs *Save* with buttons that act immediately (Add FY, Fill, Clear future, Restore), and *Close* silently drops unsaved edits. Group it into Working pattern (saved as you change it), Years & calendar, and Backup. *Effort: S–M.*

### Consider

- **U14.** The theme button (◖) is cryptic and only has two states, so once you've toggled it you can't get back to "follow the system". Use a sun/moon icon with three states. *S.*
- **U15.** The grid's FY total H% reads 5.1% because only October has times. The tiles warn when hours are patchy, but the grid doesn't. Flag it there too, or work it out over timed days only. *S.*
- **U16.** On desktop the time controls are the smallest thing on the card (65×27px buttons at the far right) while the code chips dominate. Move the times next to the date. *S.*
- **U17.** The date shows twice, in the input and in the heading. On the phone, make the heading the picker. *S.*
- **U18.** Nothing on the page mentions the arrow-key shortcuts. Add a one-line hint on desktop. *S.*

## Verification

- `npm test`: 53 passing.
- Browser suites run against the refactor: functional 21, month 11, tiles 10, mobile 11, confirm 27, clear-future 14, version 6, versioning 31, hours 11, comment 10, and 18 new checks for the fixes. Those 18 fail on 1.1.2, which shows they test the fixes.
- API suites: workbook reconciliation (no mismatches), horizon 15, month-to-date 12, weekends 7, working sick 10.
- The same 69-step API script was run against 1.1.2 and 1.2.0, and the two runs were compared step by step. Every difference is one of the intended fixes or changes above.
- A database created by 1.1.2 opened in 1.2.0 with all 528 days and the settings intact. The picker was unchanged and nothing was tidied away.
- Not tested here: the Docker build, because this environment has no Docker daemon. The test stack on `dev` is the place to check the compose hardening (`init`, `cap_drop`, `no-new-privileges`).
