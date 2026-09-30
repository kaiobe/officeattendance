/**
 * The settings every copy of the app has, with the server's defaults. The
 * standalone app starts a new phone from its own first-run choices instead.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  lastFy: null,           // furthest FY added by hand with "Add FY"; null = none
  stdDayHours: 10.75,     // 43 hr week over 4 days
  officeReqPct: 0.5,      // 50% office requirement
  nonWorkingWeekday: 1,   // 0=Sun ... 1=Mon. -1 = none (5 day week)
  defaultIn: '07:30',
  defaultOut: '17:00',
  holidayState: 'VIC',    // whose public holidays the calendar lays down
});

export const isSettingKey = (k) => Object.hasOwn(DEFAULT_SETTINGS, k);
