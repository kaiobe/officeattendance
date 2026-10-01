/**
 * Where a new phone starts in the standalone version: a five-day week of
 * 8.75-hour days, 09:00 to 17:45, with a 50% office target. Each person can
 * change any of it on the setup screen or later in Settings. (The server
 * version keeps its own defaults, in public/core/settings.js.)
 */
export const NEW_PHONE_SETTINGS = Object.freeze({
  stdDayHours: 8.75,
  officeReqPct: 0.5,
  nonWorkingWeekday: -1,
  defaultIn: '09:00',
  defaultOut: '17:45',
});
