/**
 * The release this page was built from. `npm run bump` rewrites this line and
 * package.json together; the server compares the two and complains at startup
 * if they ever drift apart.
 *
 * The page sends it nowhere - it compares it against the version the server
 * reports. They differ only when the browser is running JavaScript older than
 * the deploy, i.e. a cached page, which is exactly the thing worth knowing.
 */
const APP_VERSION = '1.1.1';

const $ = (id) => document.getElementById(id);
const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DOW_S = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MON_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const S = {
  fy: null, today: '', settings: {}, codes: [], codeMap: {}, days: {},
  summary: null, sel: null, anchor: null, range: [], period: 'mtd', monthIdx: null, saving: false,
};

/* ---------- date helpers (string based, no timezone drift) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const parse = (s) => s.split('-').map(Number);
const dowOf = (s) => { const [y,m,d] = parse(s); return new Date(Date.UTC(y, m-1, d)).getUTCDay(); };
const shift = (s, n) => { const [y,m,d] = parse(s); const t = new Date(Date.UTC(y, m-1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth()+1)}-${pad(t.getUTCDate())}`; };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const fyOf = (s) => { const [y,m] = parse(s); return (m >= 10 ? y + 1 : y) - 2000; };
const fyStart = (fy) => `${2000 + fy - 1}-10-01`;
const fyEnd = (fy) => `${2000 + fy}-09-30`;
const longDate = (s) => { const [y,m,d] = parse(s); return `${d} ${['January','February','March','April','May','June','July','August','September','October','November','December'][m-1]} ${y}`; };
const shortDate = (s) => { const [y,m,d] = parse(s); return `${d} ${MON_S[m-1]} ${y}`; };
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const minsBetween = (a, b) => { if (!a || !b) return 0; const [ah,am] = a.split(':').map(Number), [bh,bm] = b.split(':').map(Number); let x = bh*60+bm-(ah*60+am); if (x < 0) x += 1440; return x; };
const fmtHrs = (h) => (Math.round(h * 100) / 100).toLocaleString('en-AU', { maximumFractionDigits: 2 });
// The grid's hours columns, always to two places. Times are entered to the
// quarter hour, so two places are exact - one place turns 1.75 into 1.8, which
// is a number that was never worked.
const fmtHrs2 = (h) => h.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => n.toLocaleString('en-AU', { maximumFractionDigits: 1 });
const pct = (v) => v == null ? '—' : `${(v * 100).toFixed(1)}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- api ---------- */
async function api(path, opts) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function flash(msg, isError) {
  const ok = $('savedFlag'), err = $('errFlag');
  if (isError) { err.textContent = msg; ok.classList.remove('show'); return; }
  err.textContent = '';
  ok.textContent = msg || 'Saved';
  ok.classList.add('show');
  clearTimeout(flash.t);
  flash.t = setTimeout(() => ok.classList.remove('show'), 1600);
}

/* ---------- load ---------- */
async function load(fy) {
  const data = await api(`/api/state${fy ? `?fy=${fy}` : ''}`);
  S.fy = data.fy;
  S.today = data.today;
  S.todayInFy = data.todayInFy;
  if (!S.todayInFy && S.period === 'ytd') S.period = 'mtd';
  S.settings = data.settings;
  S.codes = data.codes;
  S.codeMap = Object.fromEntries(data.codes.map((c) => [c.code, c]));
  S.days = data.days;
  S.summary = data.summary;
  S.unconfirmed = data.unconfirmedHolidayYears || [];
  S.lastFy = data.lastFy;
  S.build = data.build;
  S.version = data.version;
  S.fys = data.availableFys;
  if (!S.sel || fyOf(S.sel) !== S.fy) {
    S.sel = fyOf(S.today) === S.fy ? S.today : fyStart(S.fy);
    S.anchor = S.sel; S.range = [];
  }
  S.monthIdx = null;
  renderAll();
}

async function refresh() {
  const data = await api(`/api/state?fy=${S.fy}`);
  S.days = data.days; S.summary = data.summary; S.settings = data.settings;
  S.unconfirmed = data.unconfirmedHolidayYears || [];
  renderAll();
}

/* ---------- tiles ---------- */
function statusOf(p, req) {
  if (p == null) return 'warning';
  if (p >= req) return 'good';
  if (p >= req - 0.05) return 'warning';
  return 'critical';
}
const ICON = { good: '●', warning: '▲', critical: '▼' };

function meter(value, target, cls) {
  const w = Math.max(0, Math.min(1, value || 0)) * 100;
  return `<div class="meter"><div class="fill ${cls}" style="width:${w.toFixed(1)}%"></div>
    <div class="target" style="left:${(target * 100).toFixed(1)}%" title="Requirement"></div></div>
    <div class="metercap"><span>0%</span><span>Target ${(target * 100).toFixed(0)}%</span><span>100%</span></div>`;
}

/** The month the banner defaults to: the current one, else the last with any data. */
function defaultMonthIdx() {
  const ms = S.summary.months;
  if (S.todayInFy) {
    const i = ms.findIndex((m) => `${m.year}-${pad(m.month)}` === S.today.slice(0, 7));
    if (i >= 0) return i;
  }
  for (let i = ms.length - 1; i >= 0; i--) if (ms[i].workDays > 0) return i;
  return 0;
}

/** Figures behind the banner for the selected period. */
function periodStats() {
  if (S.period === 'month') {
    if (S.monthIdx == null) S.monthIdx = defaultMonthIdx();
    return S.summary.months[S.monthIdx];
  }
  if (S.period === 'mtd') return S.summary.mtd;
  return S.summary[S.period === 'ytd' ? 'ytd' : 'total'];
}

function renderTiles() {
  const s = periodStats();
  const req = S.settings.officeReqPct;
  const empty = s.workDays === 0;
  const dStat = empty ? 'idle' : statusOf(s.pctDays, req);
  const hStat = empty || !s.officeHrs || s.untimedOfficeDays > s.timedOfficeDays ? 'idle' : statusOf(s.pctHrs, req);
  const gapAhead = s.gapDays <= 0;
  const gapVal = Math.abs(s.gapDays);

  // Being ahead and meeting the requirement are the same fact - gap is
  // req - office, and the requirement is met exactly when that's at or below
  // zero - so one pill carries both, and the days figure folds in here rather
  // than taking a tile of its own.
  const plural = (n) => (n === 1 ? 'day' : 'days');
  const gapText = gapVal % 1 === 0 ? String(gapVal) : gapVal.toFixed(1);
  const dayNote = empty ? '<div class="status idle">No work days logged</div>'
    : gapAhead
      ? `<div class="status good">● ${gapVal === 0 ? 'On target' : `${gapText} ${plural(gapVal)} ahead`}</div>`
      : `<div class="status ${dStat === 'warning' ? 'warning' : 'critical'}">▼ ${gapText} ${plural(gapVal)} short</div>`;
  // Hours only mean something once most office days have times against them.
  const patchy = s.untimedOfficeDays > s.timedOfficeDays;
  const hourNote = empty ? '<div class="status idle">No hours logged</div>'
    : !s.officeHrs ? '<div class="status idle">No office times entered</div>'
    : patchy ? `<div class="status idle">${s.untimedOfficeDays} office days still need times</div>`
    : `<div class="status ${hStat}">${ICON[hStat]} ${s.gapHrs <= 0 ? 'Above target' : `${fmtHrs(s.gapHrs)} hrs to go`}</div>`;

  $('tiles').innerHTML = `
    <div class="tile hero">
      <div class="label">Office days</div>
      <div class="value">${empty ? '—' : pct(s.pctDays)}${empty ? '' : '<span class="unit">%</span>'}</div>
      <div class="sub">${fmtNum(s.officeDays)} office of ${fmtNum(s.workDays)} work days${empty ? '' : ` · ${fmtNum(s.reqDays)} needed`}${s.workingSickDays ? ` · ${s.workingSickDays} working sick excluded` : ''}</div>
      ${dayNote}
      ${meter(s.pctDays, req, dStat)}
    </div>
    <div class="tile">
      <div class="label">Office hours</div>
      <div class="value">${empty || !s.officeHrs ? '—' : pct(s.pctHrs) + '<span class="unit">%</span>'}</div>
      <div class="sub">${fmtHrs(s.officeHrs)} of ${fmtHrs(s.availableHrs)} available hrs</div>
      ${hourNote}
      ${meter(s.pctHrs, req, hStat)}
    </div>
    <div class="tile">
      <div class="label">Avg per office day</div>
      <div class="value">${s.avgHrsPerOfficeDay == null ? '—' : fmtHrs(s.avgHrsPerOfficeDay) + '<span class="unit">hrs</span>'}</div>
      <div class="sub">${s.timedOfficeDays} day${s.timedOfficeDays === 1 ? '' : 's'} with times${s.untimedOfficeDays ? ` · ${s.untimedOfficeDays} untimed` : ''}</div>
    </div>`;

  const m = S.period === 'month' ? S.summary.months[S.monthIdx] : null;
  const mtd = S.summary.mtd;
  $('tilesTitle').innerHTML = S.period === 'ytd' ? `Year to date · to ${longDate(S.today)}`
    : S.period === 'month' ? `${m.name} ${m.year}`
    : S.period === 'mtd' ? (mtd.partial ? `${mtd.name} ${mtd.year}<span class="through"> · to ${longDate(mtd.through)}</span>` : `${mtd.name} ${mtd.year}`)
    : `Full FY${S.fy}`;

  const ytdBtn = $('periodYtd');
  ytdBtn.disabled = !S.todayInFy;
  ytdBtn.title = S.todayInFy ? '' : `Today is outside FY${S.fy}`;
  ytdBtn.setAttribute('aria-pressed', String(S.period === 'ytd'));
  $('periodFull').setAttribute('aria-pressed', String(S.period === 'full'));
  $('periodMtd').setAttribute('aria-pressed', String(S.period === 'mtd'));
  $('periodMonth').setAttribute('aria-pressed', String(S.period === 'month'));
  $('periodMtd').title = mtd.partial ? '' : `FY${S.fy} doesn't contain today, so this shows ${mtd.name} ${mtd.year}`;

  const sel = $('monthSel');
  sel.hidden = S.period !== 'month';
  if (!sel.hidden) {
    sel.innerHTML = S.summary.months
      .map((mo, i) => `<option value="${i}" ${i === S.monthIdx ? 'selected' : ''}>${mo.name} ${mo.year}</option>`)
      .join('');
  }
}

/* ---------- log card ---------- */
function renderLog() {
  const date = S.sel;
  const rec = S.days[date] || {};
  $('dateInput').value = date;
  // Long form on a wide screen, abbreviated on a phone so it stays on one line.
  $('dayline').innerHTML =
    `<span class="dl-long"><span class="dow">${DOW[dowOf(date)]}</span> ${longDate(date)}</span>` +
    `<span class="dl-short"><span class="dow">${DOW[dowOf(date)].slice(0, 3)}</span> ${shortDate(date)}</span>`;

  const multi = S.range.length > 1;
  const note = $('rangenote');
  note.hidden = !multi;
  if (multi) {
    note.innerHTML = `<span>${S.range.length} days selected — choosing a code applies to all of them.</span><button id="clearRange">Clear</button>`;
    $('clearRange').onclick = () => { S.range = []; renderAll(); };
  }

  const groups = [['work', 'Work'], ['leave', 'Leave'], ['off', 'Not a work day']];
  $('chipzone').innerHTML = groups.map(([g, title]) => `
    <div class="chipgroup"><div class="glabel">${title}</div><div class="chips">
      ${S.codes.filter((c) => c.group === g).map((c) => `
        <button class="chip" data-code="${c.code}" aria-pressed="${rec.code === c.code && !multi}"
          style="background:${c.bg};color:${c.fg}">
          <span class="dot" style="background:${c.fg}"></span>${c.label}
        </button>`).join('')}
    </div></div>`).join('') +
    `<div class="chipgroup"><div class="chips"><button class="chip clear" data-code="">Clear day</button></div></div>`;

  $('chipzone').querySelectorAll('.chip').forEach((b) => { b.onclick = () => applyCode(b.dataset.code); });

  $('inTime').value = rec.in || '';
  $('outTime').value = rec.out || '';
  $('comment').value = rec.comment || '';
  // What's on record, so a direct edit of the field can be compared against it
  // and offered back if the change wasn't intended.
  S.prevTimes = { in: rec.in || '', out: rec.out || '' };
  updateHrs();
}

function updateHrs() {
  const m = minsBetween($('inTime').value, $('outTime').value);
  $('hrsOut').textContent = m ? `${fmtHrs(m / 60)} hrs` : '';
}

/* ---------- grid ---------- */

// A gap is "ahead" at or below zero, "short" above it. Blank when there's nothing to compare.
function gapCell(gap, basis, fmt = fmtNum) {
  if (!basis) return '<td class="stat">—</td>';
  const cls = gap <= 0 ? 'gap-ok' : 'gap-short';
  return `<td class="stat"><span class="${cls}">${gap > 0 ? '+' : ''}${fmt(gap)}</span></td>`;
}

// Short names: the Days / Hours group headers above them supply the context.
const DAY_COLS  = ['Work', 'Office', 'D%', 'Req'];
const HOUR_COLS = ['Office', 'Avail', 'H%', 'Req', 'Gap', 'Avg'];

function dayStatCells(m) {
  return `<td class="stat">${m.workDays || '—'}</td>
    <td class="stat">${m.officeDays || '—'}</td>
    <td class="stat">${m.pctDays == null ? '—' : pct(m.pctDays) + '%'}</td>
    <td class="stat endgroup">${m.workDays ? fmtNum(m.reqDays) : '—'}</td>`;
}

function hourStatCells(m) {
  const hasHrs = m.officeHrs > 0;
  return `<td class="stat sep">${hasHrs ? fmtHrs2(m.officeHrs) : '—'}</td>
    <td class="stat">${m.availableHrs ? fmtHrs2(m.availableHrs) : '—'}</td>
    <td class="stat">${hasHrs && m.pctHrs != null ? pct(m.pctHrs) + '%' : '—'}</td>
    <td class="stat">${m.availableHrs ? fmtHrs2(m.reqHrs) : '—'}</td>
    ${gapCell(m.gapHrs, hasHrs ? m.availableHrs : 0, fmtHrs2)}
    <td class="stat">${m.avgHrsPerOfficeDay == null ? '—' : fmtHrs2(m.avgHrsPerOfficeDay)}</td>`;
}

function renderGrid() {
  const months = S.summary.months;

  // Two header rows: group labels over the stat blocks, then the column names.
  let head = `<thead><tr class="grouphead"><th class="mth"></th><th colspan="31"></th>` +
    `<th class="grp endgroup" colspan="${DAY_COLS.length}">Days</th>` +
    `<th class="grp sep" colspan="${HOUR_COLS.length}">Hours</th></tr><tr><th class="mth">Month</th>`;
  for (let d = 1; d <= 31; d++) head += `<th class="num">${d}</th>`;
  head += DAY_COLS.map((c, i) => `<th class="stat${i === DAY_COLS.length - 1 ? ' endgroup' : ''}">${c}</th>`).join('');
  head += HOUR_COLS.map((c, i) => `<th class="stat${i === 0 ? ' sep' : ''}">${c}</th>`).join('');
  head += `</tr></thead>`;

  let body = '<tbody>';
  for (const m of months) {
    body += `<tr><td class="mth">${m.name.slice(0, 3)} ${String(m.year).slice(2)}</td>`;
    for (let d = 1; d <= 31; d++) {
      if (d > m.days) { body += `<td class="cell"><button class="void" disabled tabindex="-1"></button></td>`; continue; }
      const date = `${m.year}-${pad(m.month)}-${pad(d)}`;
      const rec = S.days[date];
      const def = rec ? S.codeMap[rec.code] : null;
      const selected = S.range.length > 1 ? S.range.includes(date) : date === S.sel;
      const style = def ? `background:${def.bg};color:${def.fg}` : '';
      const cls = ['', def ? '' : 'empty', selected ? 'sel' : '', date === S.today ? 'today' : ''].join(' ');
      const hasTime = rec && rec.in && rec.out;
      body += `<td class="cell"><button class="${cls}" style="${style}" data-date="${date}"
        title="${esc(`${DOW_S[dowOf(date)]} ${date}${def ? ' · ' + def.label : ''}${hasTime ? ` · ${rec.in}–${rec.out}` : ''}${rec?.comment ? ' · ' + rec.comment : ''}`)}"
        >${rec ? rec.code : ''}${hasTime ? '<span class="mark"></span>' : ''}${rec?.comment ? '<span class="cmt"></span>' : ''}</button></td>`;
    }
    body += dayStatCells(m) + hourStatCells(m) + `</tr>`;
  }
  const t = S.summary.total;
  body += `<tr class="totals"><td class="mth">FY${S.fy}</td><td class="cell" colspan="31"></td>` +
    dayStatCells(t) + hourStatCells(t) + `</tr></tbody>`;

  $('cal').innerHTML = head + body;
  $('cal').querySelectorAll('button[data-date]').forEach((b) => {
    b.onclick = (e) => selectDate(b.dataset.date, e.shiftKey);
  });
}

function renderLegend() {
  const counts = S.summary.total.byCode;
  $('legend').innerHTML = S.codes.map((c) => `
    <span class="item"><span class="sw" style="background:${c.bg};color:${c.fg}">${c.code}</span>
    ${c.label} <span class="n">${counts[c.code] || 0}</span></span>`).join('');
}

// The workbook's key panel: two totals counted differently from the monthly rows.
function renderKeyTotals() {
  const t = S.summary.total;
  $('keytotals').innerHTML = `
    <span class="kt"><span class="k">Total days worked</span><span class="v">${t.daysWorked}</span>
      <span class="f">O + H + WS</span></span>
    <span class="kt"><span class="k">Total work days</span><span class="v">${t.totalWorkDays}</span>
      <span class="f">incl. leave</span></span>
    <span class="kt"><span class="k">Work days for the requirement</span><span class="v">${t.workDays}</span>
      <span class="f">O + H${t.workingSickDays ? ` · excludes ${t.workingSickDays} working sick` : ''}</span></span>`;
}

// Victoria sets the Friday before the AFL Grand Final each year once the AFL
// releases its schedule, so future years genuinely have no date yet.
function renderGridNote() {
  const el = $('gridnote');
  const years = S.unconfirmed || [];
  if (!years.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span>⚠</span><span>AFL Grand Final Friday ${years.length > 1 ? 'dates' : 'date'} for
    ${years.join(' and ')} ${years.length > 1 ? 'have' : 'has'} not been announced by the Victorian Government yet,
    so ${years.length > 1 ? 'those days are' : 'that day is'} not marked as a public holiday. Add it by hand once it's confirmed.</span>`;
}

/**
 * The build being served, from the newest file in public/. Shown in the header
 * so a stale page is obvious at a glance rather than something to go digging
 * for after a deploy. Rendered in the viewer's own timezone.
 */
function renderVersion() {
  const el = $('version');
  const served = S.version || null;
  const stale = served && served !== APP_VERSION;
  const built = S.build ? new Date(S.build) : null;
  const builtLong = built ? `${built.getDate()} ${MON_S[built.getMonth()]} ${pad(built.getHours())}:${pad(built.getMinutes())}` : 'unknown';

  el.classList.toggle('stale', !!stale);
  el.textContent = stale ? `v${APP_VERSION} \u2192 v${served}` : `v${APP_VERSION}`;
  el.title = stale
    ? `This page is running v${APP_VERSION}, but the server is serving v${served}.\nClick to reload.`
    : `Release v${APP_VERSION}\nDeployed ${builtLong}`;
  el.setAttribute('role', stale ? 'button' : 'presentation');
  el.tabIndex = stale ? 0 : -1;
}

/** Reload past whatever cache handed us the old page. */
function hardReload() {
  const u = new URL(location.href);
  u.searchParams.set('v', Date.now());
  location.replace(u.toString());
}

function renderAll() {
  $('fyLabel').textContent = S.fy;
  $('fyrange').textContent = `FY${S.fy} · Oct ${2000 + S.fy - 1} – Sep ${2000 + S.fy}`;
  const sel = $('fysel');
  sel.innerHTML = S.fys.map((f) => `<option value="${f}" ${f === S.fy ? 'selected' : ''}>FY${f}</option>`).join('');
  $('csvLink').href = `/api/export.csv?fy=${S.fy}`;
  renderVersion();
  renderTiles(); renderLog(); renderGrid(); renderKeyTotals(); renderGridNote(); renderLegend();
}

/* ---------- interactions ---------- */
function selectDate(date, extend) {
  if (extend && S.anchor) {
    const [a, b] = [S.anchor, date].sort();
    const out = [];
    for (let d = a; d <= b; d = shift(d, 1)) out.push(d);
    S.range = out;
    S.sel = date;
  } else {
    S.sel = date; S.anchor = date; S.range = [];
  }
  if (fyOf(date) !== S.fy) { load(fyOf(date)); return; }
  renderAll();
}

async function applyCode(code) {
  const targets = S.range.length > 1 ? S.range : [S.sel];
  const payload = {};
  for (const date of targets) {
    if (code === '') { payload[date] = null; continue; }
    if (targets.length > 1) {
      const prev = S.days[date] || {};
      payload[date] = { code, in: prev.in, out: prev.out, comment: prev.comment };
    } else {
      payload[date] = { code, in: $('inTime').value || null, out: $('outTime').value || null, comment: $('comment').value || null };
    }
  }
  await save(payload, targets.length > 1 ? `${targets.length} days updated` : null);
}

async function saveCurrent() {
  const rec = S.days[S.sel];
  const inV = $('inTime').value || null, outV = $('outTime').value || null, cmt = $('comment').value || null;
  if (!rec) {
    // Entering times on a day with no code yet means it was an office day.
    if (!inV && !outV) return;
    await save({ [S.sel]: { code: 'O', in: inV, out: outV, comment: cmt } }, 'Saved as Office');
    return;
  }
  await save({ [S.sel]: { code: rec.code, in: inV, out: outV, comment: cmt } });
}

/** Save the selected day as an office day, keeping whatever times are entered. */
async function saveAsOffice() {
  const wasOffice = S.days[S.sel]?.code === 'O';
  await save({ [S.sel]: {
    code: 'O',
    in: $('inTime').value || null,
    out: $('outTime').value || null,
    comment: $('comment').value || null,
  } }, wasOffice ? null : 'Saved as Office');
}

async function save(days, msg) {
  try {
    S.saving = true;
    await api('/api/days', { method: 'PUT', body: JSON.stringify({ days }) });
    await refresh();
    flash(msg);
  } catch (e) { flash(e.message, true); }
  finally { S.saving = false; }
}

/* ---------- wiring ---------- */
$('prevDay').onclick = () => selectDate(shift(S.sel, -1));
$('nextDay').onclick = () => selectDate(shift(S.sel, 1));
$('todayBtn').onclick = () => selectDate(S.today);
$('dateInput').onchange = (e) => { if (e.target.value) selectDate(e.target.value); };
$('fysel').onchange = (e) => { S.sel = null; load(Number(e.target.value)); };

$('inTime').oninput = updateHrs;
$('outTime').oninput = updateHrs;
/**
 * Editing the field itself gets the same guard as the buttons - typing over a
 * recorded time, or fumbling the picker on a phone, loses it just as easily.
 * Declining puts the original back.
 */
async function onTimeEdited(which) {
  const el = $(which === 'in' ? 'inTime' : 'outTime');
  const prev = (S.prevTimes || {})[which] || '';
  const next = el.value;
  if (prev && next !== prev) {
    const label = which === 'in' ? 'In' : 'Out';
    const okd = await askConfirm({
      title: `Change the ${label} time?`,
      body: next
        ? `${shortDate(S.sel)} has a recorded ${label} time of ${prev}. Change it to ${next}?`
        : `${shortDate(S.sel)} has a recorded ${label} time of ${prev}. Remove it?`,
      ok: next ? 'Change it' : 'Remove it',
    });
    if (!okd) { el.value = prev; updateHrs(); return; }
  }
  S.prevTimes[which] = next;
  updateHrs();
  saveCurrent();
}

$('inTime').onchange = () => onTimeEdited('in');
$('outTime').onchange = () => onTimeEdited('out');
$('comment').onchange = saveCurrent;
/**
 * Ask before a button overwrites a time that's already recorded. Only when
 * there is something to lose - punching in on a blank day stays one tap.
 * Resolves false on Escape or backdrop dismissal, so the safe answer wins.
 */
function askConfirm({ title, body, ok }) {
  const dlgC = $('confirmDlg');
  return new Promise((resolve) => {
    $('confirmTitle').textContent = title;
    $('confirmBody').textContent = body;
    $('confirmYes').textContent = ok;
    const finish = (value) => {
      $('confirmYes').removeEventListener('click', yes);
      $('confirmNo').removeEventListener('click', no);
      dlgC.removeEventListener('cancel', cancelled);
      if (dlgC.open) dlgC.close();
      resolve(value);
    };
    const yes = () => finish(true);
    const no = () => finish(false);
    const cancelled = () => finish(false);
    $('confirmYes').addEventListener('click', yes);
    $('confirmNo').addEventListener('click', no);
    dlgC.addEventListener('cancel', cancelled);
    dlgC.showModal();
  });
}

const shownTime = (t) => t || 'not set';

$('stdTimes').onclick = async () => {
  const inV = $('inTime').value, outV = $('outTime').value;
  if ((inV || outV) && !(await askConfirm({
    title: 'Replace the times?',
    body: `${shortDate(S.sel)} is ${shownTime(inV)} to ${shownTime(outV)}. Replace with the standard day, ${S.settings.defaultIn} to ${S.settings.defaultOut}?`,
    ok: 'Replace',
  }))) return;
  $('inTime').value = S.settings.defaultIn;
  $('outTime').value = S.settings.defaultOut;
  updateHrs();
  saveCurrent();
};

// Punching in or out is a statement that you were in the office, so it codes
// the day O whatever it was set to before.
$('nowIn').onclick = async () => {
  const now = nowHHMM(), inV = $('inTime').value;
  if (inV && !(await askConfirm({
    title: 'Change the In time?',
    body: `${shortDate(S.sel)} already has an In time of ${inV}. Change it to ${now}?`,
    ok: 'Change it',
  }))) return;
  $('inTime').value = now;
  updateHrs();
  saveAsOffice();
};

$('nowOut').onclick = async () => {
  const now = nowHHMM(), outV = $('outTime').value;
  if (outV && !(await askConfirm({
    title: 'Change the Out time?',
    body: `${shortDate(S.sel)} already has an Out time of ${outV}. Change it to ${now}?`,
    ok: 'Change it',
  }))) return;
  $('outTime').value = now;
  updateHrs();
  saveAsOffice();
};

$('clearTimes').onclick = async () => {
  const inV = $('inTime').value, outV = $('outTime').value;
  if ((inV || outV) && !(await askConfirm({
    title: 'Clear the times?',
    body: `${shortDate(S.sel)} is ${shownTime(inV)} to ${shownTime(outV)}. Clearing removes both.`,
    ok: 'Clear them',
  }))) return;
  $('inTime').value = '';
  $('outTime').value = '';
  updateHrs();
  saveCurrent();
};

$('periodYtd').onclick = () => { if (!S.todayInFy) return; S.period = 'ytd'; renderTiles(); };
$('periodFull').onclick = () => { S.period = 'full'; renderTiles(); };
$('periodMtd').onclick = () => { S.period = 'mtd'; renderTiles(); };
$('periodMonth').onclick = () => { S.period = 'month'; renderTiles(); };
$('monthSel').onchange = (e) => { S.monthIdx = Number(e.target.value); renderTiles(); };

// Only acts when the page has gone stale; renderVersion decides that.
$('version').onclick = () => { if ($('version').classList.contains('stale')) hardReload(); };
$('version').onkeydown = (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && $('version').classList.contains('stale')) { e.preventDefault(); hardReload(); }
};

const themeBtn = $('themeBtn');
const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
try { applyTheme(localStorage.getItem('theme')); } catch {}
themeBtn.onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch {}
};

/* settings dialog */
const dlg = $('settingsDlg');
$('settingsBtn').onclick = () => {
  $('setStd').value = S.settings.stdDayHours;
  $('setReq').value = Math.round(S.settings.officeReqPct * 100);
  $('setNw').value = S.settings.nonWorkingWeekday;
  $('addFyLabel').textContent = `Add FY${S.lastFy + 1}`;
  $('setIn').value = S.settings.defaultIn;
  $('setOut').value = S.settings.defaultOut;
  dlg.showModal();
};
$('closeSettings').onclick = () => dlg.close();
$('saveSettings').onclick = async () => {
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({
      stdDayHours: Number($('setStd').value),
      officeReqPct: Number($('setReq').value) / 100,
      nonWorkingWeekday: Number($('setNw').value),
      defaultIn: $('setIn').value, defaultOut: $('setOut').value,
    }) });
    dlg.close(); await refresh(); flash('Settings saved');
  } catch (e) { alert(e.message); }
};
$('addFy').onclick = async () => {
  const r = await api('/api/add-fy', { method: 'POST' });
  await load(r.lastFy);
  dlg.close();
  flash(`FY${r.lastFy} added · ${r.filled} days laid out`);
};
$('fillSkeleton').onclick = async () => {
  const r = await api('/api/calendar-skeleton', { method: 'POST', body: JSON.stringify({ fy: S.fy }) });
  await refresh(); dlg.close(); flash(`${r.filled} days filled`);
};
/**
 * Everything entered against days still to come, from tomorrow to the end of
 * the financial year. The calendar itself is left alone, so this only ever
 * removes entries, never the shape of the year.
 */
function futureEntries() {
  // Tomorrow, or the start of the year being viewed if that comes later.
  const tomorrow = shift(S.today, 1);
  const from = tomorrow > fyStart(S.fy) ? tomorrow : fyStart(S.fy);
  const to = fyEnd(S.fy);
  const skeleton = new Set(['W', 'NW', 'PH']);
  const dates = Object.entries(S.days)
    .filter(([date, rec]) => date >= from && date <= to && !skeleton.has(rec.code))
    .map(([date]) => date)
    .sort();
  return { from, to, dates };
}

$('clearFuture').onclick = async () => {
  const { from, to, dates } = futureEntries();
  const n = dates.length;
  if (!n) { flash(`Nothing logged between ${shortDate(from)} and ${shortDate(to)}`); return; }
  const day = n === 1 ? 'day' : 'days';
  const okd = await askConfirm({
    title: `Clear ${n} future ${day}?`,
    body: `This removes everything logged between ${shortDate(from)} and ${shortDate(to)} — ${n} ${day}`
      + `${dates[0] !== from ? `, starting ${shortDate(dates[0])}` : ''}. `
      + `Weekends, public holidays and non-working days stay. Today and anything earlier is untouched.`,
    ok: 'Clear them',
  });
  if (!okd) return;
  const r = await api('/api/clear-future', { method: 'POST', body: JSON.stringify({ fy: S.fy }) });
  await refresh();
  dlg.close();
  flash(`${r.cleared} future ${r.cleared === 1 ? 'day' : 'days'} cleared`);
};

$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (!confirm('Restore this backup? Existing days with the same dates will be overwritten.')) return;
  try {
    const body = JSON.parse(await f.text());
    const r = await api('/api/import', { method: 'POST', body: JSON.stringify({ days: body.days, settings: body.settings }) });
    await refresh(); dlg.close(); flash(`${r.imported} days imported`);
  } catch (err) { alert(err.message); }
  e.target.value = '';
};

/* keyboard: arrows move day, 1-9 not bound to avoid surprises */
document.addEventListener('keydown', (e) => {
  if (dlg.open || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); selectDate(shift(S.sel, -1)); }
  if (e.key === 'ArrowRight') { e.preventDefault(); selectDate(shift(S.sel, 1)); }
  if (e.key === 'ArrowUp') { e.preventDefault(); selectDate(shift(S.sel, -7)); }
  if (e.key === 'ArrowDown') { e.preventDefault(); selectDate(shift(S.sel, 7)); }
});

load().catch((e) => { document.body.innerHTML = `<div class="wrap"><p class="err" style="margin-top:40px">Could not load: ${e.message}</p></div>`; });
