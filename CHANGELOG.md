# Changelog

Versions are `MAJOR.MINOR.PATCH`:

- **MAJOR** — the database or the API changes shape. A restore from an older
  backup may need thought.
- **MINOR** — a new feature, or a visible change to how something behaves.
- **PATCH** — a fix, a layout tweak, wording.

`npm run bump [major|minor|patch]` moves the number in every place it appears
and opens an entry here. Nothing else should edit a version by hand.

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
