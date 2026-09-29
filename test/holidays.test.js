import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vicPublicHolidays, easterSunday, unconfirmedHolidayYears } from '../server/holidays.js';

// Written out by hand from Business Victoria's published lists, so the rules
// are checked against the source rather than against themselves. A holiday on
// a weekend is listed on its own date as well as on its substitute weekday.
const PUBLISHED = {
  2025: ['2025-01-01', '2025-01-26', '2025-01-27', '2025-03-10', '2025-04-18', '2025-04-19', '2025-04-20', '2025-04-21', '2025-04-25', '2025-06-09', '2025-09-26', '2025-11-04', '2025-12-25', '2025-12-26'],
  2026: ['2026-01-01', '2026-01-26', '2026-03-09', '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06', '2026-04-25', '2026-06-08', '2026-09-25', '2026-11-03', '2026-12-25', '2026-12-26', '2026-12-28'],
  2027: ['2027-01-01', '2027-01-26', '2027-03-08', '2027-03-26', '2027-03-27', '2027-03-28', '2027-03-29', '2027-04-25', '2027-06-14', '2027-11-02', '2027-12-25', '2027-12-26', '2027-12-27', '2027-12-28'],
  2028: ['2028-01-01', '2028-01-03', '2028-01-26', '2028-03-13', '2028-04-14', '2028-04-15', '2028-04-16', '2028-04-17', '2028-04-25', '2028-06-12', '2028-11-07', '2028-12-25', '2028-12-26'],
};

for (const [year, dates] of Object.entries(PUBLISHED)) {
  test(`Victorian public holidays ${year} match the published list`, () => {
    assert.deepEqual(vicPublicHolidays(Number(year)).map((h) => h.date), dates);
  });
}

test('Easter Sunday', () => {
  assert.deepEqual(easterSunday(2025), [4, 20]);
  assert.deepEqual(easterSunday(2027), [3, 28]);
  assert.deepEqual(easterSunday(2038), [4, 25]);
});

test('ANZAC Day gets no substitute when it falls on a weekend', () => {
  const names = vicPublicHolidays(2027).map((h) => h.name);
  assert.equal(names.filter((n) => n.startsWith('ANZAC')).length, 1);
});

test('Christmas on a Saturday: substitutes are Monday and Tuesday', () => {
  const subs = vicPublicHolidays(2027).filter((h) => h.substitute).map((h) => [h.date, h.name]);
  assert.deepEqual(subs, [['2027-12-27', 'Christmas Day (substitute)'], ['2027-12-28', 'Boxing Day (substitute)']]);
});

test('an unannounced AFL Grand Final Friday is reported, never guessed', () => {
  assert.equal(vicPublicHolidays(2027).some((h) => h.name.includes('AFL')), false);
  assert.deepEqual(unconfirmedHolidayYears('2026-10-01', '2027-09-30'), [2027]);
  assert.deepEqual(unconfirmedHolidayYears('2025-10-01', '2026-09-30'), []);
});
