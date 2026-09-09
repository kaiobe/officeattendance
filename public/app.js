const $ = (id) => document.getElementById(id);
const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DOW_S = ['Su','Mo','Tu','We','Th','Fr','Sa'];

const S = {
  fy: null, today: '', settings: {}, codes: [], codeMap: {}, days: {},
  summary: null, sel: null, anchor: null, range: [], period: 'ytd', saving: false,
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
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const minsBetween = (a, b) => { if (!a || !b) return 0; const [ah,am] = a.split(':').map(Number), [bh,bm] = b.split(':').map(Number); let x = bh*60+bm-(ah*60+am); if (x < 0) x += 1440; return x; };
const fmtHrs = (h) => (Math.round(h * 100) / 100).toLocaleString('en-AU', { maximumFractionDigits: 2 });
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
  if (!S.todayInFy) S.period = 'full';
  S.settings = data.settings;
  S.codes = data.codes;
  S.codeMap = Object.fromEntries(data.codes.map((c) => [c.code, c]));
  S.days = data.days;
  S.summary = data.summary;
  S.fys = [...new Set([...data.availableFys, data.settings.fy, fyOf(data.today)])].sort((a, b) => a - b);
  if (!S.sel || fyOf(S.sel) !== S.fy) {
    S.sel = fyOf(S.today) === S.fy ? S.today : fyStart(S.fy);
    S.anchor = S.sel; S.range = [];
  }
  renderAll();
}

async function refresh() {
  const data = await api(`/api/state?fy=${S.fy}`);
  S.days = data.days; S.summary = data.summary; S.settings = data.settings;
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

function renderTiles() {
  const s = S.summary[S.period === 'ytd' ? 'ytd' : 'total'];
  const req = S.settings.officeReqPct;
  const empty = s.workDays === 0;
  const dStat = empty ? 'idle' : statusOf(s.pctDays, req);
  const hStat = empty || !s.officeHrs || s.untimedOfficeDays > s.timedOfficeDays ? 'idle' : statusOf(s.pctHrs, req);
  const gapAhead = s.gapDays <= 0;
  const gapVal = Math.abs(s.gapDays);

  const dayNote = empty ? '<div class="status idle">No work days logged</div>'
    : `<div class="status ${dStat}">${ICON[dStat]} ${dStat === 'good' ? 'Meeting requirement' : dStat === 'warning' ? 'Just under' : 'Below requirement'}</div>`;
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
      <div class="sub">${fmtNum(s.officeDays)} office of ${fmtNum(s.workDays)} work days${s.workingSickDays ? ` · ${s.workingSickDays} working sick excluded` : ''}</div>
      ${dayNote}
      ${meter(s.pctDays, req, dStat)}
    </div>
    <div class="tile">
      <div class="label">Days ${empty ? 'against target' : gapAhead ? 'ahead' : 'short'}</div>
      <div class="value">${empty ? '—' : (gapVal % 1 === 0 ? gapVal : gapVal.toFixed(1))}</div>
      <div class="sub">Need ${fmtNum(s.reqDays)} office days${empty || gapAhead ? '' : ` · ${fmtNum(s.reqDays - s.officeDays)} to go`}</div>
      ${empty ? '<div class="status idle">Nothing to compare yet</div>'
        : `<div class="status ${gapAhead ? 'good' : 'critical'}">${gapAhead ? '● On track' : '▼ Short'}</div>`}
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

  $('tilesTitle').textContent = S.period === 'ytd' ? `Year to date · to ${longDate(S.today)}` : `Full FY${S.fy}`;
  const ytdBtn = $('periodYtd');
  ytdBtn.disabled = !S.todayInFy;
  ytdBtn.title = S.todayInFy ? '' : `Today is outside FY${S.fy}`;
  ytdBtn.setAttribute('aria-pressed', String(S.period === 'ytd'));
  $('periodFull').setAttribute('aria-pressed', String(S.period !== 'ytd'));
}

/* ---------- log card ---------- */
function renderLog() {
  const date = S.sel;
  const rec = S.days[date] || {};
  $('dateInput').value = date;
  $('dayline').innerHTML = `<span class="dow">${DOW[dowOf(date)]}</span> ${longDate(date)}`;

  const multi = S.range.length > 1;
  const note = $('rangenote');
  note.hidden = !multi;
  if (multi) {
    note.innerHTML = `<span>${S.range.length} days selected — choosing a code applies to all of them.</span><button id="clearRange">Clear</button>`;
    $('clearRange').onclick = () => { S.range = []; renderAll(); };
  }

  const groups = [['work', 'At work'], ['leave', 'Leave'], ['off', 'Not a work day']];
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
  updateHrs();
}

function updateHrs() {
  const m = minsBetween($('inTime').value, $('outTime').value);
  $('hrsOut').textContent = m ? `${fmtHrs(m / 60)} hrs` : '';
}

/* ---------- grid ---------- */
function renderGrid() {
  const months = S.summary.months;
  let head = `<thead><tr><th class="mth">Month</th>`;
  for (let d = 1; d <= 31; d++) head += `<th class="num">${d}</th>`;
  head += `<th class="stat">Work</th><th class="stat">Office</th><th class="stat">%</th><th class="stat">Req</th><th class="stat">Gap</th><th class="stat">Hrs</th></tr></thead>`;

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
    const gapCls = m.workDays === 0 ? '' : (m.gapDays <= 0 ? 'gap-ok' : 'gap-short');
    body += `<td class="stat">${m.workDays || '—'}</td><td class="stat">${m.officeDays || '—'}</td>
      <td class="stat">${m.pctDays == null ? '—' : pct(m.pctDays) + '%'}</td>
      <td class="stat">${m.workDays ? fmtNum(m.reqDays) : '—'}</td>
      <td class="stat"><span class="${gapCls}">${m.workDays ? (m.gapDays > 0 ? '+' : '') + fmtNum(m.gapDays) : '—'}</span></td>
      <td class="stat">${m.officeHrs ? fmtHrs(m.officeHrs) : '—'}</td></tr>`;
  }
  const t = S.summary.total;
  body += `<tr class="totals"><td class="mth">FY${S.fy}</td><td class="cell" colspan="31"></td>
    <td class="stat">${t.workDays}</td><td class="stat">${t.officeDays}</td>
    <td class="stat">${pct(t.pctDays)}%</td><td class="stat">${fmtNum(t.reqDays)}</td>
    <td class="stat"><span class="${t.gapDays <= 0 ? 'gap-ok' : 'gap-short'}">${(t.gapDays > 0 ? '+' : '') + fmtNum(t.gapDays)}</span></td>
    <td class="stat">${fmtHrs(t.officeHrs)}</td></tr></tbody>`;

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

function renderAll() {
  $('fyLabel').textContent = S.fy;
  $('fyrange').textContent = `FY${S.fy} · Oct ${2000 + S.fy - 1} – Sep ${2000 + S.fy}`;
  const sel = $('fysel');
  sel.innerHTML = S.fys.map((f) => `<option value="${f}" ${f === S.fy ? 'selected' : ''}>FY${f}</option>`).join('');
  $('csvLink').href = `/api/export.csv?fy=${S.fy}`;
  renderTiles(); renderLog(); renderGrid(); renderKeyTotals(); renderLegend();
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
$('inTime').onchange = saveCurrent;
$('outTime').onchange = saveCurrent;
$('comment').onchange = saveCurrent;
$('stdTimes').onclick = () => { $('inTime').value = S.settings.defaultIn; $('outTime').value = S.settings.defaultOut; updateHrs(); saveCurrent(); };
$('nowIn').onclick = () => { $('inTime').value = nowHHMM(); updateHrs(); saveCurrent(); };
$('nowOut').onclick = () => { $('outTime').value = nowHHMM(); updateHrs(); saveCurrent(); };
$('clearTimes').onclick = () => { $('inTime').value = ''; $('outTime').value = ''; updateHrs(); saveCurrent(); };

$('periodYtd').onclick = () => { if (!S.todayInFy) return; S.period = 'ytd'; renderTiles(); };
$('periodFull').onclick = () => { S.period = 'full'; renderTiles(); };

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
  $('setFy').value = S.settings.fy;
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
      fy: Number($('setFy').value),
      defaultIn: $('setIn').value, defaultOut: $('setOut').value,
    }) });
    dlg.close(); await refresh(); flash('Settings saved');
  } catch (e) { alert(e.message); }
};
$('fillSkeleton').onclick = async () => {
  const r = await api('/api/calendar-skeleton', { method: 'POST', body: JSON.stringify({ fy: S.fy }) });
  await refresh(); dlg.close(); flash(`${r.filled} days filled`);
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
