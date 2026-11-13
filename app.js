'use strict';

/* =========================================================
   교육수석 컨퍼런스 시뮬레이터
   - 모든 데이터는 사용자의 브라우저(localStorage)에만 저장됩니다.
   - 실제 인원·휴가 정보는 이 저장소(코드)에 넣지 마세요.
   ========================================================= */

const CATEGORIES = ['파견지', 'JR', 'JW', 'CR', '영상', '내시경'];
const CAT_COLOR = {
  '파견지': '#7c3aed',
  'JR': '#2563eb',
  'JW': '#0891b2',
  'CR': '#059669',
  '영상': '#d97706',
  '내시경': '#dc2626',
};

// 하루에 놓을 수 있는 컨퍼런스 수
const MAX_PER_DAY = 1;

// 대한민국 공휴일(평일 판단용). 목록에 없는 휴무일은 화면에서 날짜를 더블클릭해 추가합니다.
const HOLIDAYS = {
  // 2026
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일',
  '2026-06-03': '지방선거',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
  '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  // 2027
  '2027-01-01': '신정',
  '2027-02-05': '설날 연휴', '2027-02-06': '설날', '2027-02-07': '설날 연휴', '2027-02-08': '대체공휴일',
  '2027-03-01': '삼일절',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일',
  '2027-08-15': '광복절', '2027-08-16': '대체공휴일',
  '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
  '2027-10-03': '개천절', '2027-10-04': '대체공휴일',
  '2027-10-09': '한글날', '2027-10-11': '대체공휴일',
  '2027-12-25': '성탄절', '2027-12-27': '대체공휴일',
};

const STORE_KEY = 'conference-simulator:v1';

/* ---------------- 날짜 도우미 ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const toMonday = (d) => addDays(d, -((d.getDay() + 6) % 7));
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

/* ---------------- 기타 도우미 ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- 상태 ---------------- */
function sampleState() {
  const now = new Date();
  const start = toMonday(new Date(now.getFullYear(), now.getMonth() + 1, 1)); // 다음 달 1일이 든 주의 월요일
  const d = (w, i) => ymd(addDays(start, w * 7 + i));       // w주차 i요일(0=월)
  const range = (w, from, to) => Array.from({ length: to - from + 1 }, (_, k) => d(w, from + k));
  return {
    settings: { startMonday: ymd(start), weeks: 5, customHolidays: {}, removedHolidays: [] },
    people: [
      { id: 'P1', name: '샘플교수A', role: '교수', off: range(0, 0, 2) },
      { id: 'P2', name: '샘플교수B', role: '교수', off: range(2, 1, 4) },
      { id: 'P3', name: '샘플교수C', role: '교수', off: [d(1, 0)] },
      { id: 'P4', name: '샘플교수D', role: '교수', off: range(4, 0, 4) },
      { id: 'P5', name: '샘플교수E', role: '교수', off: [] },
      { id: 'R1', name: '전공의1', role: '전공의', off: range(1, 2, 4) },
      { id: 'R2', name: '전공의2', role: '전공의', off: [d(0, 3), d(3, 3)] },
      { id: 'R3', name: '전공의3', role: '전공의', off: range(3, 0, 1) },
      { id: 'R4', name: '전공의4', role: '전공의', off: [] },
      { id: 'R5', name: '전공의5', role: '전공의', off: range(2, 0, 0) },
      { id: 'R6', name: '전공의6', role: '전공의', off: range(0, 3, 4) },
    ],
    conferences: [
      { id: 'C1', topic: '샘플 주제 1', category: '파견지', professor: 'P1', residents: ['R1'] },
      { id: 'C2', topic: '샘플 주제 2', category: '파견지', professor: 'P2', residents: ['R2', 'R3'] },
      { id: 'C3', topic: '샘플 주제 3', category: 'JR', professor: 'P3', residents: ['R4'] },
      { id: 'C4', topic: '샘플 주제 4', category: 'JR', professor: 'P4', residents: ['R5'] },
      { id: 'C5', topic: '샘플 주제 5', category: 'JR', professor: 'P5', residents: ['R6'] },
      { id: 'C6', topic: '샘플 주제 6', category: 'JW', professor: 'P1', residents: ['R2'] },
      { id: 'C7', topic: '샘플 주제 7', category: 'JW', professor: 'P2', residents: ['R4', 'R6'] },
      { id: 'C8', topic: '샘플 주제 8', category: 'CR', professor: 'P3', residents: ['R1', 'R5'] },
      { id: 'C9', topic: '샘플 주제 9', category: 'CR', professor: 'P4', residents: ['R3'] },
      { id: 'C10', topic: '샘플 주제 10', category: '영상', professor: 'P5', residents: ['R2'] },
      { id: 'C11', topic: '샘플 주제 11', category: '영상', professor: 'P1', residents: ['R6'] },
      { id: 'C12', topic: '샘플 주제 12', category: '내시경', professor: 'P2', residents: ['R5'] },
      { id: 'C13', topic: '샘플 주제 13', category: '내시경', professor: 'P4', residents: ['R1', 'R4'] },
    ],
    assignments: {},   // { 컨퍼런스id: 'YYYY-MM-DD' }
  };
}

function normalize(s) {
  if (!s || typeof s !== 'object') throw new Error('형식이 올바르지 않습니다.');
  const base = sampleState();
  const settings = { ...base.settings, ...(s.settings || {}) };
  settings.weeks = Number(settings.weeks) === 4 ? 4 : 5;
  settings.customHolidays = settings.customHolidays || {};
  settings.removedHolidays = settings.removedHolidays || [];
  if (!Array.isArray(s.people) || !Array.isArray(s.conferences)) throw new Error('people / conferences 목록이 없습니다.');
  const people = s.people.map((p) => ({ ...p, id: String(p.id), off: Array.isArray(p.off) ? p.off : [] }));
  const conferences = s.conferences.map((c) => ({ ...c, id: String(c.id), residents: Array.isArray(c.residents) ? c.residents.map(String) : [] }));
  const ids = new Set(conferences.map((c) => c.id));
  const assignments = {};
  for (const [cid, date] of Object.entries(s.assignments || {})) if (ids.has(cid)) assignments[cid] = date;
  return { settings, people, conferences, assignments };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch { return null; }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 저장 불가 환경 */ }
}

let state = load() || sampleState();
let filterCat = '전체';
let dragId = null;

const person = (id) => state.people.find((p) => p.id === id);
const conf = (id) => state.conferences.find((c) => c.id === id);

/* ---------------- 규칙 ---------------- */
function holidayName(ds) {
  const s = state.settings;
  if (ds in s.customHolidays) return s.customHolidays[ds] || '휴무';
  if (s.removedHolidays.includes(ds)) return null;
  return HOLIDAYS[ds] || null;
}

function viewDays() {
  const start = parseYmd(state.settings.startMonday);
  const out = [];
  for (let w = 0; w < state.settings.weeks; w++) for (let i = 0; i < 5; i++) out.push(addDays(start, w * 7 + i));
  return out;
}

/** 이 컨퍼런스를 이 날짜에 놓을 수 있는지와 불가 사유 */
function checkDate(c, ds) {
  const h = holidayName(ds);
  if (h) return { ok: false, reasons: [h] };
  const reasons = [];
  const members = [person(c.professor), ...c.residents.map(person)].filter(Boolean);
  for (const p of members) if (p.off.includes(ds)) reasons.push(`${p.name} 불가`);
  const others = Object.entries(state.assignments).filter(([cid, d]) => d === ds && cid !== c.id);
  if (others.length >= MAX_PER_DAY) reasons.push(`이미 배정: ${others.map(([cid]) => conf(cid)?.topic).join(', ')}`);
  return { ok: reasons.length === 0, reasons };
}

function availableCount(c) {
  return viewDays().filter((d) => checkDate(c, ymd(d)).ok).length;
}

/* ---------------- 그리기 ---------------- */
function cardEl(c, placed) {
  const el = document.createElement('div');
  el.className = 'card';
  el.draggable = true;
  el.dataset.id = c.id;
  el.style.setProperty('--c', CAT_COLOR[c.category] || '#64748b');

  const prof = person(c.professor);
  const res = c.residents.map(person).filter(Boolean);
  let extra = '';

  if (placed) {
    const chk = checkDate(c, state.assignments[c.id]);
    if (!chk.ok) {
      el.classList.add('conflict');
      extra = `<div class="warn">⚠ ${esc(chk.reasons.join(', '))}</div>`;
    }
  } else {
    const n = availableCount(c);
    const at = state.assignments[c.id];
    extra = `<div class="meta">가능 <b class="${n ? '' : 'zero'}">${n}일</b>${at ? ` · 기간 밖 배정(${esc(at)})` : ''}</div>`;
  }

  el.innerHTML = `
    <div class="top">
      <span class="badge">${esc(c.category)}</span>
      <span class="topic" title="${esc(c.topic)}">${esc(c.topic)}</span>
      ${placed ? '<button class="x" title="배정 취소">×</button>' : ''}
    </div>
    <div class="people">${prof ? esc(prof.name) : '교수 미정'} · ${res.length ? res.map((r) => esc(r.name)).join(', ') : '전공의 미정'}</div>
    ${extra}`;
  return el;
}

function renderCalendar() {
  const days = viewDays();
  const mid = days[Math.floor(days.length / 2)];
  const mainMonth = mid.getMonth();
  const today = ymd(new Date());

  $('#calTitle').textContent = `${mid.getFullYear()}년 ${mainMonth + 1}월`;
  $('#calRange').textContent = `${md(days[0])} ~ ${md(days[days.length - 1])} · ${state.settings.weeks}주 · 평일 ${days.length}일`;

  const byDate = {};
  for (const [cid, d] of Object.entries(state.assignments)) (byDate[d] ||= []).push(cid);

  const grid = $('#grid');
  grid.innerHTML = ['월', '화', '수', '목', '금'].map((d) => `<div class="dow">${d}</div>`).join('');

  for (const d of days) {
    const ds = ymd(d);
    const h = holidayName(ds);
    const cell = document.createElement('div');
    cell.className = 'cell' + (h ? ' holiday' : '') + (d.getMonth() !== mainMonth ? ' other' : '') + (ds === today ? ' today' : '');
    cell.dataset.date = ds;
    cell.innerHTML = `
      <div class="date" title="더블클릭: 휴무일 지정/해제">
        <span>${md(d)}</span>${h ? `<span class="hname">${esc(h)}</span>` : ''}
      </div>
      <div class="slot"></div>
      <div class="reason"></div>`;
    const slot = cell.querySelector('.slot');
    for (const cid of byDate[ds] || []) { const c = conf(cid); if (c) slot.appendChild(cardEl(c, true)); }
    grid.appendChild(cell);
  }
}

function renderList() {
  const inView = new Set(viewDays().map(ymd));
  const pending = state.conferences.filter((c) => !inView.has(state.assignments[c.id]));

  // 분류 칩
  const counts = { '전체': pending.length };
  for (const c of pending) counts[c.category] = (counts[c.category] || 0) + 1;
  $('#chips').innerHTML = ['전체', ...CATEGORIES].map((k) =>
    `<button class="chip ${filterCat === k ? 'on' : ''}" data-cat="${esc(k)}">${esc(k)} ${counts[k] || 0}</button>`).join('');

  let shown = filterCat === '전체' ? pending : pending.filter((c) => c.category === filterCat);
  const catIdx = (c) => { const i = CATEGORIES.indexOf(c.category); return i < 0 ? 99 : i; };
  if ($('#sortBy').value === 'avail') {
    const n = new Map(shown.map((c) => [c.id, availableCount(c)]));
    shown = [...shown].sort((a, b) => n.get(a.id) - n.get(b.id) || catIdx(a) - catIdx(b));
  } else {
    shown = [...shown].sort((a, b) => catIdx(a) - catIdx(b));
  }

  const list = $('#list');
  list.innerHTML = '';
  if (!shown.length) list.innerHTML = `<div class="empty">${pending.length ? '이 분류는 모두 배정했습니다' : '모든 컨퍼런스를 배정했습니다 🎉'}</div>`;
  for (const c of shown) list.appendChild(cardEl(c, false));

  $('#listCount').textContent = `미배정 ${pending.length}`;
  $('#stat').textContent = `배정 ${state.conferences.length - pending.length} / ${state.conferences.length}`;
}

function render() {
  $('#startDate').value = state.settings.startMonday;
  $('#weeks').value = String(state.settings.weeks);
  renderCalendar();
  renderList();
}

function commit() { save(); render(); }

/* ---------------- 드래그 ---------------- */
function markAvailability() {
  const c = conf(dragId);
  if (!c) return;
  for (const cell of $$('#grid .cell')) {
    const ds = cell.dataset.date;
    const r = checkDate(c, ds);
    cell.classList.toggle('avail', r.ok);
    cell.classList.toggle('unavail', !r.ok);
    cell.querySelector('.reason').textContent = r.ok || holidayName(ds) ? '' : r.reasons.join(' · ');
  }
  // 달력에 있던 카드를 끌 때만 목록이 '배정 취소' 영역이 됩니다.
  $('#list').classList.toggle('droppable', !!state.assignments[dragId]);
}

function finishDrag() {
  dragId = null;
  document.body.classList.remove('dragging');
  $$('.card.dragging').forEach((el) => el.classList.remove('dragging'));
  $$('#grid .cell').forEach((cell) => {
    cell.classList.remove('avail', 'unavail', 'over');
    cell.querySelector('.reason').textContent = '';
  });
  $('#list').classList.remove('droppable');
}

document.addEventListener('dragstart', (e) => {
  const card = e.target.closest?.('.card');
  if (!card) return;
  dragId = card.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  // 드래그 이미지가 만들어진 뒤에 화면 표시를 바꿉니다.
  setTimeout(() => {
    if (dragId !== card.dataset.id) return;
    card.classList.add('dragging');
    document.body.classList.add('dragging');
    markAvailability();
  }, 0);
});
document.addEventListener('dragend', finishDrag);

const grid = $('#grid');
let overCell = null;
function setOver(cell) {
  if (overCell === cell) return;
  overCell?.classList.remove('over');
  overCell = cell;
  cell?.classList.add('over');
}
grid.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const cell = e.target.closest('.cell');
  if (cell && cell.classList.contains('avail')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOver(cell);
  } else setOver(null);
});
grid.addEventListener('dragleave', (e) => { if (!grid.contains(e.relatedTarget)) setOver(null); });
grid.addEventListener('drop', (e) => {
  const cell = e.target.closest('.cell');
  if (!dragId || !cell || !cell.classList.contains('avail')) return;
  e.preventDefault();
  state.assignments[dragId] = cell.dataset.date;
  setOver(null);
  finishDrag();
  commit();
});

const list = $('#list');
list.addEventListener('dragover', (e) => {
  if (dragId && state.assignments[dragId]) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
});
list.addEventListener('drop', (e) => {
  if (!dragId || !state.assignments[dragId]) return;
  e.preventDefault();
  delete state.assignments[dragId];
  finishDrag();
  commit();
});

/* ---------------- 클릭·입력 ---------------- */
grid.addEventListener('click', (e) => {
  const x = e.target.closest('.x');
  if (!x) return;
  delete state.assignments[x.closest('.card').dataset.id];
  commit();
});

grid.addEventListener('dblclick', (e) => {
  const head = e.target.closest('.date');
  if (!head) return;
  const ds = head.closest('.cell').dataset.date;
  const s = state.settings;
  if (holidayName(ds)) {
    if (ds in s.customHolidays) delete s.customHolidays[ds];
    else s.removedHolidays.push(ds);
    toast(`${ds} 휴무 해제`);
  } else {
    const name = prompt(`${ds}을(를) 휴무일로 지정합니다. 이름(선택):`, '휴무');
    if (name === null) return;
    s.removedHolidays = s.removedHolidays.filter((d) => d !== ds);
    s.customHolidays[ds] = name.trim() || '휴무';
    const moved = Object.entries(state.assignments).filter(([, d]) => d === ds);
    for (const [cid] of moved) delete state.assignments[cid];
    toast(moved.length ? `${ds} 휴무 지정 · 배정 ${moved.length}건 목록으로 이동` : `${ds} 휴무 지정`);
  }
  commit();
});

$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  filterCat = chip.dataset.cat;
  renderList();
});
$('#sortBy').addEventListener('change', renderList);

$('#startDate').addEventListener('change', (e) => {
  if (!e.target.value) return;
  const d = parseYmd(e.target.value);
  const mon = toMonday(d);
  if (d.getDay() !== 1) toast(`월요일이 아니어서 그 주 월요일(${ymd(mon)})로 맞췄습니다`);
  state.settings.startMonday = ymd(mon);
  commit();
});
$('#weeks').addEventListener('change', (e) => {
  state.settings.weeks = Number(e.target.value);
  commit();
});

$('#btnClear').addEventListener('click', () => {
  if (!Object.keys(state.assignments).length) return;
  if (!confirm('모든 배정을 취소하고 목록으로 되돌립니다. 계속할까요?')) return;
  state.assignments = {};
  commit();
});

/* ---------------- 파일 저장·불러오기 ---------------- */
$('#btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `컨퍼런스배정_${state.settings.startMonday}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#btnImport').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    state = normalize(JSON.parse(await file.text()));
    commit();
    toast(`${file.name} 불러옴`);
  } catch (err) {
    alert(`불러오기 실패: ${err.message}`);
  }
});

/* ---------------- 인원·컨퍼런스 편집(임시 JSON) ---------------- */
const dlg = $('#dataDialog');
$('#btnData').addEventListener('click', () => {
  $('#dataText').value = JSON.stringify({ people: state.people, conferences: state.conferences }, null, 2);
  $('#dataErr').textContent = '';
  dlg.showModal();
});
$('#dataSave').addEventListener('click', (e) => {
  try {
    const next = JSON.parse($('#dataText').value);
    state = normalize({ ...state, people: next.people, conferences: next.conferences });
    commit();
    toast('적용했습니다');
  } catch (err) {
    e.preventDefault();
    $('#dataErr').textContent = `오류: ${err.message}`;
  }
});

render();
