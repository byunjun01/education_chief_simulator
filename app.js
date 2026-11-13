'use strict';

/* =========================================================
   교육수석 컨퍼런스 시뮬레이터
   - 모든 데이터는 사용자의 브라우저(localStorage)에만 저장됩니다.
   - 실제 인원·휴가 정보는 이 저장소(코드)에 넣지 마세요.
   ========================================================= */

const DEFAULT_CONFS = ['FL', 'JR', '파견지 증례', 'JW', 'CR', '영상 컨퍼런스', '내시경 컨퍼런스'];
// 기본 교수 명단(컨퍼런스 배정 탭에서 추가·삭제할 수 있습니다)
const DEFAULT_PROFESSORS = ['조비룡', '박민선', '박진호', '윤재문', '김계형', '조수환', '민경하',
                            '황서은', '김지영', '김하진', '권혁태', '조우현', '고아령', '전혜령'];
const defaultProfessors = () => DEFAULT_PROFESSORS.map((name) => normPerson({ id: `P-${name}`, name, role: '교수' }));
const PALETTE = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#ca8a04', '#ea580c', '#dc2626',
                 '#db2777', '#4f46e5', '#0d9488', '#65a30d', '#9333ea', '#be123c', '#0369a1'];

// 하루에 놓을 수 있는 컨퍼런스 수
const MAX_PER_DAY = 1;
// 컨퍼런스 구성 기준
const PROF_PER_CONF = 1;
const RES_MIN = 1;
const RES_MAX = 2;

// 대한민국 공휴일(평일 판단용). 목록에 없는 휴무일은 달력에서 날짜를 더블클릭해 추가합니다.
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

const STORE_KEY = 'conference-simulator:v2';

/* ---------------- 날짜 도우미 ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const toMonday = (d) => addDays(d, -((d.getDay() + 6) % 7));
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/* ---------------- 기타 도우미 ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = (o) => JSON.parse(JSON.stringify(o));

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------------- 상태 ----------------
   person = { id, name, role:'교수'|'전공의', year(전공의), confs:[컨퍼런스id],
              vac:[휴가일], no:[불가일(교수)], mode:'block'|'only'(교수), only:[가능일(교수, only 모드)] }
   conference = { id, name, color }
   assignments = { 컨퍼런스id: 'YYYY-MM-DD' }
---------------------------------------- */
function defaultState() {
  const now = new Date();
  const start = toMonday(new Date(now.getFullYear(), now.getMonth() + 1, 1)); // 다음 달 1일이 든 주의 월요일
  return {
    settings: { startMonday: ymd(start), weeks: 5, customHolidays: {}, removedHolidays: [] },
    conferences: DEFAULT_CONFS.map((name, i) => ({ id: `c${i + 1}`, name, color: PALETTE[i] })),
    people: defaultProfessors(),
    assignments: {},
  };
}

function normPerson(p) {
  const role = p.role === '교수' ? '교수' : '전공의';
  return {
    id: String(p.id),
    name: String(p.name).trim(),
    role,
    year: role === '전공의' ? Math.max(1, Number(p.year) || 1) : null,
    confs: arr(p.confs),
    vac: arr(p.vac),
    no: role === '교수' ? arr(p.no) : [],
    mode: role === '교수' && p.mode === 'only' ? 'only' : 'block',
    only: role === '교수' ? arr(p.only) : [],
  };
}

function normalize(s) {
  if (!s || typeof s !== 'object') throw new Error('형식이 올바르지 않습니다.');
  const base = defaultState();
  const settings = { ...base.settings, ...(s.settings || {}) };
  settings.weeks = Number(settings.weeks) === 4 ? 4 : 5;
  settings.customHolidays = settings.customHolidays && typeof settings.customHolidays === 'object' ? settings.customHolidays : {};
  settings.removedHolidays = arr(settings.removedHolidays);

  const conferences = Array.isArray(s.conferences)
    ? s.conferences.filter((c) => c && c.id && c.name)
        .map((c, i) => ({ id: String(c.id), name: String(c.name), color: c.color || PALETTE[i % PALETTE.length] }))
    : base.conferences;
  const confIds = new Set(conferences.map((c) => c.id));

  const people = (Array.isArray(s.people) ? s.people : [])
    .filter((p) => p && p.id && p.name)
    .map(normPerson)
    .map((p) => ({ ...p, confs: p.confs.filter((id) => confIds.has(id)) }));

  const assignments = {};
  for (const [cid, date] of Object.entries(s.assignments || {})) if (confIds.has(cid)) assignments[cid] = String(date);
  return { settings, conferences, people, assignments };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = normalize(JSON.parse(raw));
    // 교수가 한 명도 없던 기존 저장본에는 기본 교수 명단을 채웁니다.
    if (!s.people.some((p) => p.role === '교수')) s.people = [...defaultProfessors(), ...s.people];
    return s;
  } catch { return null; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 저장 불가 환경 */ }
}

let state = load() || defaultState();

/* 설정 탭(컨퍼런스 배정, 휴가·불가일)은 초안(draft)을 고치고, [저장]을 눌러야 state에 반영됩니다. */
let draft = null;
const editable = () => draft || (draft = clone({ conferences: state.conferences, people: state.people }));
const view = () => draft || state;   // 설정 탭이 보여줄 데이터
const isDirty = () => !!draft && JSON.stringify(draft) !== JSON.stringify({ conferences: state.conferences, people: state.people });
function refreshDirty() {
  const dirty = isDirty();
  document.body.classList.toggle('dirty', dirty);
  $('#btnSave').disabled = !dirty;
  $('#btnRevert').disabled = !dirty;
}

/* ---------------- 조회 ---------------- */
const person = (id, src = state) => src.people.find((p) => p.id === id);
const conf = (id, src = state) => src.conferences.find((c) => c.id === id);
const membersOf = (c, src = state) => {
  const ps = src.people.filter((p) => p.confs.includes(c.id));
  return {
    profs: ps.filter((p) => p.role === '교수'),
    res: ps.filter((p) => p.role === '전공의').sort((a, b) => a.year - b.year),
  };
};
const resLabel = (p) => `${p.name}(R${p.year})`;

function compIssues(c, src = state) {
  const { profs, res } = membersOf(c, src);
  const out = [];
  if (profs.length === 0) out.push('교수 미정');
  else if (profs.length > PROF_PER_CONF) out.push(`교수 ${profs.length}명`);
  if (res.length < RES_MIN) out.push('전공의 미정');
  else if (res.length > RES_MAX) out.push(`전공의 ${res.length}명`);
  return out;
}

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

/** 그 사람이 그날 안 되는 이유(되면 null) */
function personBlock(p, ds) {
  if (p.vac.includes(ds)) return '휴가';
  if (p.role === '교수') {
    if (p.mode === 'only') return p.only.includes(ds) ? null : '가능일 아님';
    if (p.no.includes(ds)) return '불가';
  }
  return null;
}

/** 이 컨퍼런스를 이 날짜에 놓을 수 있는지와 불가 사유 */
function checkDate(c, ds) {
  const h = holidayName(ds);
  if (h) return { ok: false, reasons: [h] };
  const reasons = [];
  const { profs, res } = membersOf(c);
  for (const p of [...profs, ...res]) {
    const why = personBlock(p, ds);
    if (why) reasons.push(`${p.name} ${why}`);
  }
  const others = Object.entries(state.assignments).filter(([cid, d]) => d === ds && cid !== c.id);
  if (others.length >= MAX_PER_DAY) reasons.push(`이미 배정: ${others.map(([cid]) => conf(cid)?.name).join(', ')}`);
  return { ok: reasons.length === 0, reasons };
}

const availableCount = (c) => viewDays().filter((d) => checkDate(c, ymd(d)).ok).length;

/* =========================================================
   탭
   ========================================================= */
const TABS = ['cal', 'roster', 'leave'];
let currentTab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'cal';

function showTab(tab) {
  if (currentTab !== tab && currentTab !== 'cal' && tab === 'cal' && isDirty()) {
    if (confirm('저장하지 않은 변경이 있습니다. 저장하고 달력으로 갈까요?\n(취소를 누르면 변경 내용을 유지한 채 이동합니다. 저장 전까지 달력에는 반영되지 않습니다.)')) saveDraft();
  }
  currentTab = tab;
  history.replaceState(null, '', `#${tab}`);
  for (const t of TABS) $(`#view-${t}`).hidden = t !== tab;
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $$('.tabctl').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(tab); });
  render();
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (b) showTab(b.dataset.tab);
});

function saveDraft() {
  if (!draft) return;
  const removed = state.conferences.filter((c) => !draft.conferences.some((d) => d.id === c.id));
  state.conferences = draft.conferences;
  state.people = draft.people;
  for (const c of removed) delete state.assignments[c.id];
  draft = null;
  save();
  toast('저장했습니다. 달력에 반영됩니다.');
}
$('#btnSave').addEventListener('click', () => { saveDraft(); render(); });
$('#btnRevert').addEventListener('click', () => {
  if (!isDirty() || !confirm('저장하지 않은 변경을 모두 버리고 마지막 저장 상태로 되돌릴까요?')) return;
  draft = null;
  render();
});
window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

/* =========================================================
   공통 렌더링
   ========================================================= */
function render() {
  $('#startDate').value = state.settings.startMonday;
  $('#weeks').value = String(state.settings.weeks);
  if (currentTab === 'cal') { renderCalendar(); renderList(); }
  if (currentTab === 'roster') renderRoster();
  if (currentTab === 'leave') renderLeave();
  refreshDirty();
}
function commit() { save(); render(); }

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

/* =========================================================
   1) 배정 달력
   ========================================================= */
function cardEl(c, placed) {
  const el = document.createElement('div');
  el.className = 'card';
  el.draggable = true;
  el.dataset.id = c.id;
  el.style.setProperty('--c', c.color);

  const { profs, res } = membersOf(c);
  const issues = compIssues(c);
  let extra = issues.length ? `<div class="issue">구성: ${esc(issues.join(', '))}</div>` : '';

  if (placed) {
    const chk = checkDate(c, state.assignments[c.id]);
    if (!chk.ok) {
      el.classList.add('conflict');
      extra += `<div class="warn">⚠ ${esc(chk.reasons.join(', '))}</div>`;
    }
  } else {
    const n = availableCount(c);
    const at = state.assignments[c.id];
    extra += `<div class="meta">가능 <b class="${n ? '' : 'zero'}">${n}일</b>${at ? ` · 기간 밖 배정(${esc(at)})` : ''}</div>`;
  }

  el.innerHTML = `
    <div class="top">
      <span class="name">${esc(c.name)}</span>
      ${placed ? '<button class="x" title="배정 취소">×</button>' : ''}
    </div>
    <div class="people">
      <span class="role">교수</span> ${profs.length ? profs.map((p) => esc(p.name)).join(', ') : '-'}<br>
      <span class="role">전공의</span> ${res.length ? res.map((p) => esc(resLabel(p))).join(', ') : '-'}
    </div>
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
  let pending = state.conferences.filter((c) => !inView.has(state.assignments[c.id]));
  if ($('#sortBy').value === 'avail') {
    const n = new Map(pending.map((c) => [c.id, availableCount(c)]));
    pending = [...pending].sort((a, b) => n.get(a.id) - n.get(b.id));
  }

  const list = $('#list');
  list.innerHTML = '';
  if (!pending.length) list.innerHTML = `<div class="empty">${state.conferences.length ? '모든 컨퍼런스를 배정했습니다 🎉' : '컨퍼런스 배정 탭에서 컨퍼런스를 추가하세요'}</div>`;
  for (const c of pending) list.appendChild(cardEl(c, false));

  $('#listCount').textContent = `미배정 ${pending.length}`;
  $('#stat').textContent = `배정 ${state.conferences.length - pending.length} / ${state.conferences.length}`;
}
$('#sortBy').addEventListener('change', renderList);

/* ---------------- 드래그 ---------------- */
let dragId = null;

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
    const next = normalize(JSON.parse(await file.text()));
    if (isDirty() && !confirm('저장하지 않은 설정 변경이 사라집니다. 불러올까요?')) return;
    state = next;
    draft = null;
    commit();
    toast(`${file.name} 불러옴`);
  } catch (err) {
    alert(`불러오기 실패: ${err.message}`);
  }
});

/* =========================================================
   2) 컨퍼런스 배정
   ========================================================= */
function personCard(p, confs) {
  const pills = confs.map((c) =>
    `<button class="pill ${p.confs.includes(c.id) ? 'on' : ''}" style="--c:${c.color}" data-pid="${esc(p.id)}" data-cid="${esc(c.id)}">${esc(c.name)}</button>`).join('');
  return `
    <div class="person ${p.confs.length ? 'has' : ''}">
      <div class="pname">${esc(p.name)}${p.role === '전공의' ? `<span class="ybadge">R${p.year}</span>` : ''}
        ${p.confs.length ? `<span class="cnt">${p.confs.length}개</span>` : ''}
        ${p.role === '교수' ? `<button class="pdel" data-delp="${esc(p.id)}" title="교수 삭제">×</button>` : ''}</div>
      <div class="pills">${pills || '<span class="muted small">컨퍼런스 없음</span>'}</div>
    </div>`;
}

function renderRoster() {
  const src = view();
  const { conferences, people } = src;

  // 컨퍼런스 요약
  $('#confSummary').innerHTML = conferences.map((c) => {
    const { profs, res } = membersOf(c, src);
    const issues = compIssues(c, src);
    return `
      <div class="conf-item" style="--c:${c.color}">
        <div class="head"><b>${esc(c.name)}</b>
          <button data-rename="${esc(c.id)}" title="이름 바꾸기">✎</button>
          <button data-del="${esc(c.id)}" title="삭제">×</button></div>
        <div>교수: ${profs.length ? profs.map((p) => esc(p.name)).join(', ') : '<span class="muted">-</span>'}</div>
        <div>전공의: ${res.length ? res.map((p) => esc(resLabel(p))).join(', ') : '<span class="muted">-</span>'}</div>
        <div class="${issues.length ? 'bad' : 'ok'}">${issues.length ? '⚠ ' + esc(issues.join(', ')) : '✓ 구성 완료'}</div>
      </div>`;
  }).join('') || '<div class="empty-note">컨퍼런스가 없습니다. [+ 컨퍼런스 추가]를 누르세요.</div>';

  // 교수
  const profs = people.filter((p) => p.role === '교수');
  $('#profCount').textContent = profs.length ? `${profs.length}명` : '';
  $('#profArea').innerHTML = profs.length
    ? `<div class="pgrid">${profs.map((p) => personCard(p, conferences)).join('')}</div>`
    : '<div class="empty-note">[+ 교수 추가]로 교수를 넣으세요.</div>';

  // 전공의(년차별)
  const res = people.filter((p) => p.role === '전공의');
  $('#resCount').textContent = res.length ? `${res.length}명` : '';
  const years = [...new Set(res.map((p) => p.year))].sort((a, b) => a - b);
  $('#resArea').innerHTML = res.length
    ? years.map((y) => {
        const ys = res.filter((p) => p.year === y);
        return `<div class="year-title">${y}년차 · ${ys.length}명</div><div class="pgrid">${ys.map((p) => personCard(p, conferences)).join('')}</div>`;
      }).join('')
    : '<div class="empty-note">[명단 붙여넣기]로 전공의 명단을 넣으세요. 빈 줄로 년차를 구분합니다.</div>';
}

$('#view-roster').addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (pill) {
    const p = person(pill.dataset.pid, editable());
    const cid = pill.dataset.cid;
    p.confs = p.confs.includes(cid) ? p.confs.filter((x) => x !== cid) : [...p.confs, cid];
    renderRoster();
    refreshDirty();
    return;
  }
  const ren = e.target.closest('[data-rename]');
  if (ren) {
    const c = conf(ren.dataset.rename, editable());
    const name = prompt('컨퍼런스 이름', c.name);
    if (name && name.trim()) { c.name = name.trim(); renderRoster(); refreshDirty(); }
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    const d = editable();
    const c = conf(del.dataset.del, d);
    if (!confirm(`'${c.name}' 컨퍼런스를 삭제할까요? 사람들의 배정과 달력 배치도 함께 지워집니다(저장 시 반영).`)) return;
    d.conferences = d.conferences.filter((x) => x.id !== c.id);
    for (const p of d.people) p.confs = p.confs.filter((x) => x !== c.id);
    renderRoster();
    refreshDirty();
    return;
  }
  const delp = e.target.closest('[data-delp]');
  if (delp) {
    const d = editable();
    const p = person(delp.dataset.delp, d);
    const hasData = p.confs.length || p.vac.length || p.no.length || p.only.length;
    if (!confirm(`${p.name} 교수를 삭제할까요?${hasData ? '\n컨퍼런스 배정과 휴가·불가일 정보도 함께 지워집니다.' : ''}\n(저장을 눌러야 적용됩니다)`)) return;
    d.people = d.people.filter((x) => x.id !== p.id);
    renderRoster();
    refreshDirty();
    return;
  }
  const paste = e.target.closest('[data-paste]');
  if (paste) openPaste(paste.dataset.paste);
});

$('#btnAddProf').addEventListener('click', () => {
  const name = (prompt('추가할 교수 이름') || '').trim();
  if (!name) return;
  const d = editable();
  if (d.people.some((p) => p.role === '교수' && p.name === name)) { toast(`${name} 교수는 이미 있습니다`); return; }
  d.people.push(normPerson({ id: newId('P'), name, role: '교수' }));
  // 교수를 전공의보다 앞에 두기
  d.people = [...d.people.filter((p) => p.role === '교수'), ...d.people.filter((p) => p.role !== '교수')];
  renderRoster();
  refreshDirty();
  toast(`${name} 교수 추가 (저장을 눌러야 적용됩니다)`);
});

$('#btnAddConf').addEventListener('click', () => {
  const name = prompt('추가할 컨퍼런스 이름 (예: JR 2)');
  if (!name || !name.trim()) return;
  const d = editable();
  const used = new Set(d.conferences.map((c) => c.color));
  const color = PALETTE.find((c) => !used.has(c)) || PALETTE[d.conferences.length % PALETTE.length];
  d.conferences.push({ id: newId('c'), name: name.trim(), color });
  renderRoster();
  refreshDirty();
});

/* ---------------- 명단 붙여넣기 ---------------- */
let pasteRole = '교수';

/** 붙여넣은 글을 [{name, year}]로. 전공의는 빈 줄로 묶음을 나눠 위에서부터 1, 2, 3년차 */
function parseRoster(text, role) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\t.*/, '').trim());
  if (role === '교수') return lines.filter(Boolean).map((name) => ({ name, year: null }));
  const out = [];
  let year = 1;
  let inGroup = false;
  for (const l of lines) {
    if (!l) { if (inGroup) { year++; inGroup = false; } continue; }
    out.push({ name: l, year });
    inGroup = true;
  }
  return out;
}

function rosterText(role) {
  const ps = view().people.filter((p) => p.role === role);
  if (role === '교수') return ps.map((p) => p.name).join('\n');
  const years = [...new Set(ps.map((p) => p.year))].sort((a, b) => a - b);
  return years.map((y) => ps.filter((p) => p.year === y).map((p) => p.name).join('\n')).join('\n\n');
}

function updatePastePreview() {
  const rows = parseRoster($('#pasteText').value, pasteRole);
  if (!rows.length) { $('#pastePreview').textContent = '이름이 없습니다.'; return; }
  if (pasteRole === '교수') { $('#pastePreview').textContent = `교수 ${rows.length}명`; return; }
  const by = {};
  for (const r of rows) by[r.year] = (by[r.year] || 0) + 1;
  $('#pastePreview').innerHTML = Object.entries(by).map(([y, n]) => `<b>${y}년차</b> ${n}명`).join(' · ') +
    (Object.keys(by).length > 3 ? ' <span style="color:var(--warn)">— 묶음이 4개 이상입니다. 빈 줄을 확인하세요.</span>' : '');
}

function openPaste(role) {
  pasteRole = role;
  $('#pasteTitle').textContent = `${role} 명단 붙여넣기`;
  $('#pasteHelp').innerHTML = role === '교수'
    ? '한 줄에 한 명씩 붙여넣으세요. 이미 있는 이름은 컨퍼런스 배정과 휴가 정보가 그대로 유지됩니다.'
    : '한 줄에 한 명씩, <b>빈 줄로 년차를 구분</b>합니다. 위에서부터 첫 묶음이 1년차, 다음이 2년차, 3년차입니다. 이미 있는 이름은 배정과 휴가 정보가 유지됩니다.';
  $('#pasteText').value = rosterText(role);
  updatePastePreview();
  $('#pasteDialog').showModal();
  $('#pasteText').focus();
}
$('#pasteText').addEventListener('input', updatePastePreview);

$('#pasteApply').addEventListener('click', (e) => {
  const rows = parseRoster($('#pasteText').value, pasteRole);
  const d = editable();
  const old = d.people.filter((p) => p.role === pasteRole);
  const pool = [...old];
  const next = rows.map(({ name, year }) => {
    const i = pool.findIndex((p) => p.name === name);
    if (i >= 0) { const [p] = pool.splice(i, 1); return { ...p, year: pasteRole === '전공의' ? year : null }; }
    return normPerson({ id: newId(pasteRole === '교수' ? 'P' : 'R'), name, role: pasteRole, year });
  });
  const lost = pool.filter((p) => p.confs.length || p.vac.length || p.no.length || p.only.length);
  if (lost.length && !confirm(`명단에서 빠진 ${lost.map((p) => p.name).join(', ')}의 배정·휴가 정보가 지워집니다. 계속할까요?`)) {
    e.preventDefault();
    return;
  }
  d.people = pasteRole === '교수'
    ? [...next, ...d.people.filter((p) => p.role !== '교수')]
    : [...d.people.filter((p) => p.role !== '전공의'), ...next];
  render();
  toast(`${pasteRole} ${next.length}명 반영 (저장을 눌러야 적용됩니다)`);
});

/* =========================================================
   3) 휴가·불가일
   ========================================================= */
let brush = 'vac';
let paint = null;   // { action: 'set'|'clear' }

function setBrush(b) {
  brush = b;
  $$('.brush').forEach((el) => el.classList.toggle('on', el.dataset.brush === b));
}
$('#brushes').addEventListener('click', (e) => {
  const b = e.target.closest('.brush');
  if (b) setBrush(b.dataset.brush);
});
$('#onlyAssigned').addEventListener('change', renderLeave);

function cellState(p, ds) {
  if (p.vac.includes(ds)) return 'vac';
  if (p.role === '교수') {
    if (p.mode === 'only') return p.only.includes(ds) ? 'okd' : 'blocked';
    if (p.no.includes(ds)) return 'no';
  }
  return '';
}
const CELL_TEXT = { vac: '휴', no: '불', okd: '가능', blocked: '', '': '' };

function rowSummary(p, days) {
  const inView = new Set(days);
  const n = (list) => list.filter((d) => inView.has(d)).length;
  const parts = [];
  if (n(p.vac)) parts.push(`휴가 ${n(p.vac)}`);
  if (p.role === '교수') {
    if (p.mode === 'only') parts.push(`가능 ${n(p.only)}일`);
    else if (n(p.no)) parts.push(`불가 ${n(p.no)}`);
  }
  return parts.join(' · ');
}

function renderLeave() {
  const src = view();
  const days = viewDays();
  const dss = days.map(ymd);
  setBrush(brush);
  $('#leaveRange').textContent = `${md(days[0])} ~ ${md(days[days.length - 1])} (시작 월요일·기간 기준)`;

  let people = src.people;
  if ($('#onlyAssigned').checked) people = people.filter((p) => p.confs.length);

  const head = `<thead><tr><th class="nm">이름</th>${days.map((d, i) => {
    const ds = dss[i];
    const h = holidayName(ds);
    return `<th class="${h ? 'hol' : ''} ${d.getDay() === 1 && i ? 'wk' : ''}" title="${esc(h || '')}"><span class="d">${md(d)}</span><span class="w">${h ? '휴일' : DOW[d.getDay()]}</span></th>`;
  }).join('')}<th class="sum">요약</th></tr></thead>`;

  const row = (p) => {
    const dots = p.confs.map((cid) => conf(cid, src)).filter(Boolean)
      .map((c) => `<i style="background:${c.color}" title="${esc(c.name)}"></i>`).join('');
    const modeBtn = p.role === '교수'
      ? `<button class="mode ${p.mode === 'only' ? 'only' : ''}" data-mode="${esc(p.id)}" title="누르면 방식이 바뀝니다">${p.mode === 'only' ? '가능일만' : '불가 표시'}</button>`
      : '';
    const cells = days.map((d, i) => {
      const ds = dss[i];
      const wk = d.getDay() === 1 && i ? ' wk' : '';
      if (holidayName(ds)) return `<td class="c hol${wk}"></td>`;
      const st = cellState(p, ds);
      return `<td class="c ${st}${wk}" data-pid="${esc(p.id)}" data-date="${ds}">${CELL_TEXT[st]}</td>`;
    }).join('');
    return `<tr><td class="nm">${modeBtn}<span class="n">${esc(p.name)}</span><span class="dots">${dots}</span></td>${cells}<td class="sum" data-sum="${esc(p.id)}">${esc(rowSummary(p, dss))}</td></tr>`;
  };

  const span = days.length + 2;
  const groups = [];
  const profs = people.filter((p) => p.role === '교수');
  if (profs.length) groups.push(`<tr class="grp"><td colspan="${span}">교수 ${profs.length}명</td></tr>`, ...profs.map(row));
  const res = people.filter((p) => p.role === '전공의');
  for (const y of [...new Set(res.map((p) => p.year))].sort((a, b) => a - b)) {
    const ys = res.filter((p) => p.year === y);
    groups.push(`<tr class="grp"><td colspan="${span}">전공의 ${y}년차 ${ys.length}명</td></tr>`, ...ys.map(row));
  }
  $('#matrix').innerHTML = head + `<tbody>${groups.join('') || `<tr><td class="empty-note" colspan="${span}">${src.people.length ? '조건에 맞는 사람이 없습니다.' : '컨퍼런스 배정 탭에서 명단을 먼저 넣으세요.'}</td></tr>`}</tbody>`;
}

/** 이 사람 줄에서 지금 도구로 칠하면 되는 상태. 쓸 수 없는 도구면 null
    - 전공의: 휴가만
    - 교수(불가 표시): 휴가, 불가
    - 교수(가능일만): 휴가, 가능일 / 불가 도구는 '가능' 해제(=불가)          */
function brushTarget(p) {
  if (brush === 'erase') return '';
  if (brush === 'vac') return 'vac';
  if (p.role !== '교수') return null;
  if (p.mode === 'only') return brush === 'ok' ? 'okd' : 'blocked';
  return brush === 'no' ? 'no' : null;
}
function brushHint(p) {
  if (p.role !== '교수') return '전공의는 휴가만 입력합니다';
  return p.mode === 'only' ? '' : `가능일 도구는 '가능일만' 방식 교수에게 씁니다. ${p.name} 이름 옆 버튼으로 바꾸세요`;
}

/** 칸 하나를 target 상태로 바꿉니다 ('' = 비우기) */
function setCell(p, ds, target) {
  const drop = (k) => { p[k] = p[k].filter((x) => x !== ds); };
  const add = (k) => { if (!p[k].includes(ds)) p[k].push(ds); };
  drop('vac'); drop('no'); drop('only');
  if (target === 'vac') add('vac');
  else if (target === 'no') add('no');
  else if (target === 'okd') add('only');
}

/** 칸 하나에 칠하기/지우기 적용 */
function applyCell(td, action) {
  const p = person(td.dataset.pid, editable());
  const ds = td.dataset.date;
  const target = action === 'clear' ? '' : brushTarget(p);
  if (target === null) return;   // 이 줄에서는 쓸 수 없는 도구
  setCell(p, ds, target);

  const st = cellState(p, ds);
  td.className = `c ${st}${td.classList.contains('wk') ? ' wk' : ''}`;
  td.textContent = CELL_TEXT[st];
  const days = viewDays().map(ymd);
  const sum = $(`#matrix [data-sum="${CSS.escape(p.id)}"]`);
  if (sum) sum.textContent = rowSummary(p, days);
}

/** 첫 칸의 상태로 칠하기/지우기 결정(이미 같은 상태면 지우기) */
function decideAction(td) {
  if (brush === 'erase') return 'clear';
  const p = person(td.dataset.pid, view());
  return cellState(p, td.dataset.date) === brushTarget(p) ? 'clear' : 'set';
}

const matrix = $('#matrix');
matrix.addEventListener('mousedown', (e) => {
  const td = e.target.closest('td.c[data-pid]');
  if (!td || e.button !== 0) return;
  e.preventDefault();
  const p = person(td.dataset.pid, view());
  if (brushTarget(p) === null) { toast(brushHint(p)); return; }
  paint = { action: decideAction(td) };
  applyCell(td, paint.action);
  refreshDirty();
});
matrix.addEventListener('mouseover', (e) => {
  if (!paint) return;
  const td = e.target.closest('td.c[data-pid]');
  if (td) { applyCell(td, paint.action); refreshDirty(); }
});
document.addEventListener('mouseup', () => { paint = null; });

matrix.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  const p = person(b.dataset.mode, editable());
  p.mode = p.mode === 'only' ? 'block' : 'only';
  if (p.mode === 'only' && brush !== 'erase') setBrush('ok');
  if (p.mode === 'block' && brush === 'ok') setBrush('no');
  toast(p.mode === 'only'
    ? `${p.name}: 가능한 날만 고르는 방식 (고르지 않은 날은 모두 불가)`
    : `${p.name}: 불가능한 날을 표시하는 방식`);
  renderLeave();
  refreshDirty();
});

/* ---------------- 시작 ---------------- */
showTab(currentTab);
