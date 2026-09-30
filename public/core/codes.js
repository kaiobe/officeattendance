// Attendance code definitions. Fills mirror the FY27 spreadsheet's conditional formatting.
//
// Three separate flags, matching the three things the workbook counts:
//   workDay  -> the monthly row's WORK DAYS (O + H). Drives %, REQ, GAP and AVAILABLE HRS.
//               Working sick is deliberately excluded here, as in the row formula.
//   worked   -> the key's "Total Days Worked" (O + H + WS).
//   keyWork  -> the key's "Total Work Days" (everything except public holidays,
//               non-working days and weekends).
//
// Colours. bg keeps the spreadsheet's fill so the grid still reads like the
// workbook; fg is darkened where the sheet's own text fell below 4.5:1 against
// its fill. dbg/dfg are the dark-theme pair: a deep fill of the same hue with
// light text, so the calendar recedes at night instead of glaring. Every pair
// is at least 4.5:1, text on fill.
export const CODES = [
  { code: 'O',   label: 'Office',          short: 'Office',   office: true,  workDay: true,  worked: true,  keyWork: true,  bg: '#9bc2e6', fg: '#12496f', dbg: '#1f4466', dfg: '#bcd8f4', group: 'work'  },
  { code: 'H',   label: 'Home',            short: 'Home',     office: false, workDay: true,  worked: true,  keyWork: true,  bg: '#c6e0b4', fg: '#2f5a1c', dbg: '#2d4722', dfg: '#cde6bb', group: 'work'  },
  { code: 'WS',  label: 'Working sick',    short: 'Wkg sick', office: false, workDay: false, worked: true,  keyWork: true,  bg: '#cc99ff', fg: '#4a0060', dbg: '#452d63', dfg: '#e0c8ff', group: 'work'  },
  { code: 'L',   label: 'Annual leave',    short: 'Annual',   office: false, workDay: false, worked: false, keyWork: true,  bg: '#ffc000', fg: '#5c2c00', dbg: '#5c4300', dfg: '#ffd35c', group: 'leave' },
  { code: 'LOY', label: 'Loyalty leave',   short: 'Loyalty',  office: false, workDay: false, worked: false, keyWork: true,  bg: '#ffd966', fg: '#5c2c00', dbg: '#4f4518', dfg: '#ffe59a', group: 'leave' },
  { code: 'PL',  label: 'Parental leave',  short: 'Parental', office: false, workDay: false, worked: false, keyWork: true,  bg: '#ed7d31', fg: '#3a1400', dbg: '#62300f', dfg: '#ffbb8e', group: 'leave' },
  { code: 'LSL', label: 'Long service',    short: 'LSL',      office: false, workDay: false, worked: false, keyWork: true,  bg: '#00b050', fg: '#00301a', dbg: '#0e4d2b', dfg: '#8be6b2', group: 'leave' },
  { code: 'S',   label: 'Sick leave',      short: 'Sick',     office: false, workDay: false, worked: false, keyWork: true,  bg: '#ffc7ce', fg: '#9c0006', dbg: '#5c2a31', dfg: '#ffcdd3', group: 'leave' },
  { code: 'PH',  label: 'Public holiday',  short: 'Pub hol',  office: false, workDay: false, worked: false, keyWork: false, bg: '#757171', fg: '#ffffff', dbg: '#4a4646', dfg: '#f0ecec', group: 'off'   },
  { code: 'NW',  label: 'Non-working day', short: 'Non-work', office: false, workDay: false, worked: false, keyWork: false, bg: '#d9d9d9', fg: '#4a4a4a', dbg: '#2c2c2a', dfg: '#a8a8a2', group: 'off'   },
  { code: 'W',   label: 'Weekend',         short: 'Weekend',  office: false, workDay: false, worked: false, keyWork: false, bg: '#e4e4e4', fg: '#5e5e5e', dbg: '#242422', dfg: '#9a9991', group: 'off'   },
];
export const CODE_MAP = Object.fromEntries(CODES.map((c) => [c.code, c]));
export const VALID = new Set(CODES.map((c) => c.code));
