// Attendance code definitions. Colours mirror the FY27 spreadsheet's conditional formatting.
//
// Three separate flags, matching the three things the workbook counts:
//   workDay  -> the monthly row's WORK DAYS (O + H). Drives %, REQ, GAP and AVAILABLE HRS.
//               Working sick is deliberately excluded here, as in the row formula.
//   worked   -> the key's "Total Days Worked" (O + H + WS).
//   keyWork  -> the key's "Total Work Days" (everything except public holidays,
//               non-working days and weekends).
export const CODES = [
  { code: 'O',   label: 'Office',          short: 'Office',   office: true,  workDay: true,  worked: true,  keyWork: true,  bg: '#9bc2e6', fg: '#12496f', group: 'work'  },
  { code: 'H',   label: 'Home',            short: 'Home',     office: false, workDay: true,  worked: true,  keyWork: true,  bg: '#c6e0b4', fg: '#3f6b28', group: 'work'  },
  { code: 'WS',  label: 'Working sick',    short: 'Wkg sick', office: false, workDay: false, worked: true,  keyWork: true,  bg: '#cc99ff', fg: '#4a0060', group: 'work'  },
  { code: 'L',   label: 'Annual leave',    short: 'Annual',   office: false, workDay: false, worked: false, keyWork: true,  bg: '#ffc000', fg: '#7a3b00', group: 'leave' },
  { code: 'LOY', label: 'Loyalty leave',   short: 'Loyalty',  office: false, workDay: false, worked: false, keyWork: true,  bg: '#ffd966', fg: '#7a3b00', group: 'leave' },
  { code: 'PL',  label: 'Parental leave',  short: 'Parental', office: false, workDay: false, worked: false, keyWork: true,  bg: '#ed7d31', fg: '#ffffff', group: 'leave' },
  { code: 'LSL', label: 'Long service',    short: 'LSL',      office: false, workDay: false, worked: false, keyWork: true,  bg: '#00b050', fg: '#ffffff', group: 'leave' },
  { code: 'S',   label: 'Sick leave',      short: 'Sick',     office: false, workDay: false, worked: false, keyWork: true,  bg: '#ffc7ce', fg: '#9c0006', group: 'leave' },
  { code: 'PH',  label: 'Public holiday',  short: 'Pub hol',  office: false, workDay: false, worked: false, keyWork: false, bg: '#757171', fg: '#ffffff', group: 'off'   },
  { code: 'NW',  label: 'Non-working day', short: 'Non-work', office: false, workDay: false, worked: false, keyWork: false, bg: '#d9d9d9', fg: '#7d7d7d', group: 'off'   },
  { code: 'W',   label: 'Weekend',         short: 'Weekend',  office: false, workDay: false, worked: false, keyWork: false, bg: '#e4e4e4', fg: '#a9a9a9', group: 'off'   },
];
export const CODE_MAP = Object.fromEntries(CODES.map((c) => [c.code, c]));
export const VALID = new Set(CODES.map((c) => c.code));
