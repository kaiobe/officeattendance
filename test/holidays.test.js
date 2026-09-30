import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vicPublicHolidays, publicHolidays, holidaysBetween, easterSunday, unconfirmedHolidayYears, STATES } from '../public/core/holidays.js';

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

// Every state and territory, written out by hand from the Fair Work Ombudsman's
// 2026 and 2027 lists. Weekdays only: a holiday on a weekend changes nothing,
// since weekends are W anyway. Evening-only holidays (Christmas Eve and New
// Year's Eve from 6 or 7 pm), Tasmania's public-service Easter Tuesday and the
// regional days outside each capital are left out - see holidays.js.
const WEEKDAYS = {
  ACT: {
    2026: ['01-01', '01-26', '03-09', '04-03', '04-06', '04-27', '06-01', '06-08', '10-05', '12-25', '12-28'],
    2027: ['01-01', '01-26', '03-08', '03-26', '03-29', '04-26', '05-31', '06-14', '10-04', '12-27', '12-28'],
    // ACT Government 2028 list: New Year's Day on a Saturday gives Monday 3 January
    2028: ['01-03', '01-26', '03-13', '04-14', '04-17', '04-25', '05-29', '06-12', '10-02', '12-25', '12-26'],
  },
  NSW: {
    2026: ['01-01', '01-26', '04-03', '04-06', '04-27', '06-08', '10-05', '12-25', '12-28'],
    2027: ['01-01', '01-26', '03-26', '03-29', '04-26', '06-14', '10-04', '12-27', '12-28'],
  },
  NT: {
    2026: ['01-01', '01-26', '04-03', '04-06', '05-04', '06-08', '08-03', '12-25', '12-28'],
    2027: ['01-01', '01-26', '03-26', '03-29', '04-26', '05-03', '06-14', '08-02', '12-27', '12-28'],
  },
  QLD: {
    2026: ['01-01', '01-26', '04-03', '04-06', '05-04', '08-12', '10-05', '12-25', '12-28'],
    2027: ['01-01', '01-26', '03-26', '03-29', '04-26', '05-03', '08-11', '10-04', '12-27', '12-28'],
  },
  SA: {
    2026: ['01-01', '01-26', '03-09', '04-03', '04-06', '06-08', '10-05', '12-25', '12-28'],
    2027: ['01-01', '01-26', '03-08', '03-26', '03-29', '06-14', '10-04', '12-27', '12-28'],
  },
  TAS: {
    2026: ['01-01', '01-26', '02-09', '03-09', '04-03', '04-06', '06-08', '10-22', '12-25', '12-28'],
    2027: ['01-01', '01-26', '02-08', '03-08', '03-26', '03-29', '06-14', '10-21', '12-27', '12-28'],
  },
  VIC: {
    2026: ['01-01', '01-26', '03-09', '04-03', '04-06', '06-08', '09-25', '11-03', '12-25', '12-28'],
    2027: ['01-01', '01-26', '03-08', '03-26', '03-29', '06-14', '11-02', '12-27', '12-28'],
  },
  WA: {
    2026: ['01-01', '01-26', '03-02', '04-03', '04-06', '04-27', '06-01', '09-28', '12-25', '12-28'],
    2027: ['01-01', '01-26', '03-01', '03-26', '03-29', '04-26', '06-07', '09-27', '12-27', '12-28'],
  },
};

const isWeekday = (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());

test('every state and territory is covered', () => {
  assert.deepEqual(Object.keys(WEEKDAYS).sort(), Object.keys(STATES).sort());
});

for (const [state, years] of Object.entries(WEEKDAYS)) {
  for (const [year, dates] of Object.entries(years)) {
    test(`${state} ${year}: weekday public holidays match the published list`, () => {
      const got = publicHolidays(Number(year), state).map((h) => h.date).filter(isWeekday);
      assert.deepEqual(got, dates.map((d) => `${year}-${d}`));
    });
  }
}

test('ANZAC Day on a weekend: a Monday in NSW, the ACT and WA; on a Sunday also Queensland and the NT; never Victoria, SA or Tasmania', () => {
  const monday = (year, state) => publicHolidays(year, state).some((h) => h.name === 'ANZAC Day (substitute)');
  // 2026: Saturday. 2027: Sunday.
  assert.deepEqual(Object.keys(STATES).filter((s) => monday(2026, s)), ['ACT', 'NSW', 'WA']);
  assert.deepEqual(Object.keys(STATES).filter((s) => monday(2027, s)), ['ACT', 'NSW', 'NT', 'QLD', 'WA']);
});

test('holidaysBetween and the AFL note follow the chosen state', () => {
  const fy27 = ['2026-10-01', '2027-09-30'];
  assert.equal(holidaysBetween(...fy27, 'VIC')['2026-11-03'].name, 'Melbourne Cup Day');
  assert.equal(holidaysBetween(...fy27, 'NSW')['2026-11-03'], undefined);
  assert.equal(holidaysBetween(...fy27, 'NSW')['2026-10-05'].name, 'Labour Day');
  assert.deepEqual(unconfirmedHolidayYears(...fy27, 'NSW'), []);
  assert.deepEqual(unconfirmedHolidayYears(...fy27, 'VIC'), [2027]);
  assert.throws(() => publicHolidays(2027, 'XX'), /unknown state/);
});

test('the Ekka moves to the second Friday week when August starts late in the week', () => {
  // 2028: the first Friday is the 4th, before the 5th, so the show opens on the 11th
  assert.ok(publicHolidays(2028, 'QLD').some((h) => h.date === '2028-08-16' && h.name.startsWith('Royal Queensland Show')));
});
