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

test('FY27 totals: 139 work days, 71 office, 51.1%, 76 office hours, 1,494.25 available', () => {
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
  assert.equal(s.pastReqHrs, 8);                              // 2 days x 8 h x 50%
  assert.equal(s.pastGapHrs, -1);                             // 1 h ahead
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
  assert.equal(h.pastGapHrs, 4);
});
