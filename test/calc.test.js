import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSummary, summarise } from '../public/core/calc.js';
import { DEFAULT_SETTINGS } from '../server/db.js';

const seed = JSON.parse(readFileSync(new URL('../server/seed-fy27.json', import.meta.url)));
const workbook = JSON.parse(readFileSync(new URL('./fixtures/fy27-workbook.json', import.meta.url)));
const settings = { ...DEFAULT_SETTINGS, stdDayHours: workbook.stdDayHours, officeReqPct: workbook.officeReqPct };

test('every FY27 month matches the spreadsheet, counted cell by cell', () => {
  const { months } = buildSummary(27, seed, settings, '2026-09-29');
  for (const [i, want] of workbook.months.entries()) {
    const got = months[i];
    assert.equal(got.name, want.name);
    assert.equal(got.workDays, want.workDays, `${want.name} work days`);
    assert.equal(got.officeDays, want.officeDays, `${want.name} office days`);
    assert.equal(got.officeHrs, want.officeHrs, `${want.name} office hours`);
    assert.equal(got.availableHrs, Math.round(want.workDays * settings.stdDayHours * 100) / 100, `${want.name} available hours`);
  }
});

test('FY27 totals: 139 work days, 71 office, 51.1%, 76 office hours, 1,494.25 available hours', () => {
  const { total } = buildSummary(27, seed, settings, '2026-09-29');
  assert.equal(total.workDays, 139);
  assert.equal(total.officeDays, 71);
  assert.equal(total.pctDays.toFixed(3), '0.511');
  assert.equal(total.gapDays, -1.5);
  assert.equal(total.officeHrs, 76);
  assert.equal(total.availableHrs, 1494.25);
});

test('working sick counts as worked but not towards the requirement', () => {
  const days = { '2026-10-06': { code: 'O' }, '2026-10-07': { code: 'H' }, '2026-10-08': { code: 'WS' }, '2026-10-09': { code: 'L' } };
  const s = summarise(Object.keys(days), days, settings);
  assert.equal(s.workDays, 2);        // O + H
  assert.equal(s.daysWorked, 3);      // O + H + WS
  assert.equal(s.totalWorkDays, 4);   // everything but PH, NW, W
  assert.equal(s.pctDays, 0.5);
});

test('office hours count only on office days, and only when both times are there', () => {
  const days = {
    '2026-10-06': { code: 'O', in: '07:30', out: '17:00' },
    '2026-10-07': { code: 'O', in: '08:00' },
    '2026-10-08': { code: 'H', in: '08:00', out: '16:00' },
  };
  const s = summarise(Object.keys(days), days, settings);
  assert.equal(s.officeHrs, 9.5);
  assert.equal(s.timedOfficeDays, 1);
  assert.equal(s.untimedOfficeDays, 1);
  assert.equal(s.avgHrsPerOfficeDay, 9.5);
});

test('month to date: current month to today, else the last or first month of the year', () => {
  assert.equal(buildSummary(27, seed, settings, '2026-11-10').mtd.through, '2026-11-10');
  assert.equal(buildSummary(27, seed, settings, '2028-01-01').mtd.name, 'September');
  assert.equal(buildSummary(27, seed, settings, '2026-09-29').mtd.name, 'October');
});

test('untimed office days count only up to today: a planned office day cannot have times yet', () => {
  const days = {
    '2026-10-05': { code: 'O', in: '08:00', out: '16:00' },
    '2026-10-06': { code: 'O' },                 // past, no times: flagged
    '2026-10-20': { code: 'O' },                 // planned: not flagged
  };
  const s = summarise(Object.keys(days), days, settings, '2026-10-10');
  assert.equal(s.untimedOfficeDays, 2);
  assert.equal(s.pastOfficeDays, 2);
  assert.equal(s.pastTimedOfficeDays, 1);
  assert.equal(s.untimedPastOfficeDays, 1);
  const { months } = buildSummary(27, days, settings, '2026-09-29');
  assert.equal(months[0].pastOfficeDays, 0, 'a month still to come has nothing due');
  assert.equal(months[0].untimedPastOfficeDays, 0);
});

test('office hours against the target, so far: past days, and today once it is settled', () => {
  const std = { ...settings, stdDayHours: 8, officeReqPct: 0.5 };
  const days = {
    '2026-10-12': { code: 'O', in: '08:00', out: '17:00' },  // 9 h
    '2026-10-13': { code: 'H' },                              // a work day, no office hours
    '2026-10-14': { code: 'O', in: '08:00' },                 // today, still at work: not counted yet
    '2026-10-20': { code: 'O' },                              // planned: not counted
  };
  const dates = Object.keys(days);
  const s = summarise(dates, days, std, '2026-10-14');
  assert.equal(s.pastWorkDays, 2);
  assert.equal(s.pastOfficeHrs, 9);
  assert.equal(s.pastReqHrs, 8);                              // 2 work days x 8 h x 50%
  assert.equal(s.pastGapHrs, -1);
  assert.equal(s.untimedPastOfficeDays, 0, 'today in progress is not flagged as missing times');
  // once today's Out is in, it counts
  days['2026-10-14'].out = '12:00';
  const t = summarise(dates, days, std, '2026-10-14');
  assert.equal(t.pastWorkDays, 3);
  assert.equal(t.pastOfficeHrs, 13);
  assert.equal(t.pastGapHrs, -1);                             // 12 needed, 13 done
  // a home day today counts straight away
  const h = summarise(['2026-10-15'], { '2026-10-15': { code: 'H' } }, std, '2026-10-15');
  assert.equal(h.pastWorkDays, 1);
  assert.equal(h.pastGapHrs, 4, 'home days contribute to the hours target');
  assert.equal(h.pastPctHrs, 0);
});

test('with plans: hours done plus hours planned ahead, against the target for every work day', () => {
  const std = { ...settings, stdDayHours: 8, officeReqPct: 0.5 };
  const days = {
    '2026-10-12': { code: 'O', in: '08:00', out: '17:00' },   // done: 9 h
    '2026-10-13': { code: 'H' },                               // done: a work day
    '2026-10-14': { code: 'O', in: '08:00' },                  // today, still at work: a standard day (8 h)
    '2026-10-19': { code: 'O', in: '09:00', out: '15:00' },    // planned: 6 h
    '2026-10-20': { code: 'O' },                               // planned, no times: a standard day (8 h)
    '2026-10-21': { code: 'H' },                               // planned work day
  };
  const s = summarise(Object.keys(days), days, std, '2026-10-14');
  assert.equal(s.pastOfficeHrs, 9);
  assert.equal(s.plannedWorkDays, 4);
  assert.equal(s.plannedUntimedOfficeDays, 2);
  assert.equal(s.plannedOfficeHrs, 22);                        // 6 + 8 + 8
  assert.equal(s.projOfficeHrs, 31);
  assert.equal(s.projReqHrs, 24);                              // 6 work days x 8 h x 50%
  assert.equal(s.projGapHrs, -7);
  // a month entirely in the past: with plans is just the actual
  const past = summarise(Object.keys(days), days, std, '2026-11-30');
  assert.equal(past.plannedWorkDays, 0);
  assert.equal(past.projGapHrs, past.pastGapHrs);
});

test('days and hours must each meet 50% of Office + Home days, using the standard day for hours', () => {
  const days = { '2026-10-06': { code: 'O', in: '09:00', out: '14:00' } };
  const std = { ...settings, stdDayHours: 10 };
  const before = summarise(Object.keys(days), days, std, '2026-10-31');
  days['2026-10-07'] = { code: 'H' };
  days['2026-10-08'] = { code: 'H' };
  const after = summarise(Object.keys(days), days, std, '2026-10-31');
  assert.equal(before.pctDays, 1);
  assert.equal(after.pctDays, 1 / 3);
  assert.equal(after.requiredOfficeDays, 2, 'fractional day targets require a whole office day');
  assert.equal(before.pctHrs, 0.5);
  assert.equal(before.reqHrs, 5);
  assert.equal(before.gapHrs, 0);
  assert.equal(after.pctHrs, 5 / 30);
  assert.equal(after.reqHrs, 15);
  assert.equal(after.pastReqHrs, 15);
  assert.equal(after.projReqHrs, 15);
  days['2026-10-06'].out = '13:00';
  delete days['2026-10-08'];
  const short = summarise(Object.keys(days), days, std, '2026-10-31');
  assert.equal(short.pctDays, 0.5);
  assert.equal(short.pctHrs, 0.2, 'meeting the days target does not imply meeting hours');
  assert.equal(short.gapHrs, 6);
});

test('a recorded zero-hour office day is complete, never estimated as a full day', () => {
  const days = { '2026-10-14': { code: 'O', in: '09:00', out: '09:00' } };
  for (const today of ['2026-10-13', '2026-10-14', '2026-10-15']) {
    const s = summarise(Object.keys(days), days, settings, today);
    assert.equal(s.projOfficeHrs, 0);
    assert.equal(s.timedOfficeDays, 1);
    assert.equal(s.plannedUntimedOfficeDays, 0);
    assert.equal(s.untimedPastOfficeDays, 0);
    if (today >= '2026-10-14') assert.equal(s.pastOfficeDays, 1);
  }
});

test('future years have no month-to-date attendance; planned times do not enter the actual average', () => {
  const summary = buildSummary(27, seed, settings, '2026-09-29');
  assert.equal(summary.mtd.workDays, 0);
  assert.equal(summary.mtd.officeHrs, 0);
  assert.equal(summary.mtd.through, null);
  assert.equal(summary.total.pastAvgHrsPerOfficeDay, null);
  assert.equal(summary.ytd.workDays, 0);
  assert.ok(summary.months[0].plannedOfficeHrs > 0);
});
