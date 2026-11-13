'use strict';

/* =========================================================
   엑셀 내보내기 — 모닝컨퍼런스 스케줄 양식(모컨양식.xlsx)을 그대로 따릅니다.
   app.js 의 state·viewDays·holidayName 등을 사용합니다.

   열:  B 일시 | C 요일 | D 시작시간 | E 발표자 | F 감수 | G 전임의 | H 주제 | I 비고
   - 평일마다 한 줄, 주(週) 사이에는 회색 구분줄
   - 공휴일·휴무일: 날짜를 빨간색으로, 비고에 휴일 이름
   - 주제 칸(H) 규칙
       FL·IL          → "FL : 주제"            (주제 없으면 "미정")
       CR·GR          → "CR 1 : 주제"          (주제 없으면 "미정")
       JR·GR 번호     → 전공의 한 명당 하나씩 이어서  "JR 1/2", "JR 3/4"
       파견지 증례    → "파견지 증례(1)"        (주제가 있으면 " : 주제")
       JW             → "Journal watch"
       그 밖          → 이름(+번호)            (주제가 있으면 " : 주제")
   ========================================================= */

const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

const XL = {
  cols: { A: 4.6, B: 19.4, C: 5.2, D: 10.2, E: 23.8, F: 18.5, G: 16.8, H: 74.1, I: 14.7 },
  headers: ['일시', '요일', '시작시간', '발표자', '감수', '전임의', '주제', '비고'],
  gray: 'FFBFBFBF',
  sep: 'FFAEAEAE',
  red: 'FFFF0000',
};
const EXPORT_NAME = { 't-JW': 'Journal watch' };
const TOPIC_REQUIRED = new Set(['t-FL', 't-INV', 't-GR', 't-CR']);
const PAPER_TYPES = new Set(['t-JR', 't-GR']);

let excelJsPromise = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  excelJsPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = EXCELJS_URL;
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = () => {
      excelJsPromise = null;
      s.remove();
      reject(new Error('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
    };
    document.head.appendChild(s);
  });
  return excelJsPromise;
}

/* ---------------- 셀 내용 ---------------- */
const withPf = (name) => (/^\s*(pf|prof|dr)\b\.?/i.test(name) ? name.trim() : `Pf. ${name.trim()}`);
const resLine = (p) => `R${p.year} ${p.name}`;

/** JR·GR: 이 컨퍼런스의 전공의가 맡는 번호들 (앞 번호 컨퍼런스의 전공의 수만큼 이어서) */
function paperNumbers(c) {
  const insts = state.conferences.filter((x) => x.typeId === c.typeId).sort((a, b) => a.no - b.no);
  const size = (x) => Math.max(1, membersOf(x).res.length);
  let start = 1;
  for (const x of insts) { if (x.id === c.id) break; start += size(x); }
  const total = insts.reduce((n, x) => n + size(x), 0);
  return total > 1 ? Array.from({ length: size(c) }, (_, i) => start + i) : [];
}

function exportTopic(c) {
  const t = typeOf(c);
  if (!t) return '';
  let head;
  if (t.kind === 'invited') head = t.short;
  else {
    const name = EXPORT_NAME[t.id] || t.name;
    if (t.id === 't-DISP') head = t.count > 1 ? `${name}(${c.no})` : name;
    else if (PAPER_TYPES.has(t.id)) { const nums = paperNumbers(c); head = nums.length ? `${name} ${nums.join('/')}` : name; }
    else head = t.count > 1 ? `${name} ${c.no}` : name;
  }
  const topic = c.topic.trim() || (TOPIC_REQUIRED.has(t.id) ? '미정' : '');
  return topic ? `${head} : ${topic}` : head;
}

/** [발표자, 감수, 전임의] */
function exportPeople(c) {
  if (isInvited(c)) {
    const sp = c.speaker.trim() ? withPf(c.speaker) : '미정';
    return [c.affil.trim() ? `${sp}\n(${c.affil.trim()})` : sp, '', ''];
  }
  const { profs, res } = membersOf(c);
  const fel = fellowOf(c);
  return [
    res.map(resLine).join('\n'),
    profs.map((p) => withPf(p.name)).join('\n'),
    fel ? `F. ${fel.name}` : '',
  ];
}

/* ---------------- 줄 높이 추정 ---------------- */
const isWide = (ch) => /[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch);
const textUnits = (s) => [...s].reduce((u, ch) => u + (isWide(ch) ? 1.7 : 1), 0);
function wrapLines(text, colWidth, size) {
  const cap = Math.max(4, (colWidth * 11) / size - 2);
  return String(text || '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(textUnits(line) / cap)), 0);
}

/* ---------------- 통합 문서 만들기 ---------------- */
async function buildWorkbook({ chief, time }) {
  const ExcelJS = await loadExcelJS();
  const days = viewDays();
  const mid = days[Math.floor(days.length / 2)];
  const year = mid.getFullYear();
  const month = mid.getMonth() + 1;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`모컨 ${month}월`, {
    views: [{ showGridLines: false, zoomScale: 60 }],
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  });
  for (const [k, w] of Object.entries(XL.cols)) ws.getColumn(k).width = w;

  const thin = { style: 'thin' };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const font = (size, extra = {}) => ({ name: 'Malgun Gothic', size, bold: true, ...extra });
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const COLS = 'BCDEFGHI'.split('');

  // 1행: 담당교수
  ws.mergeCells('B1:I1');
  const t1 = ws.getCell('B1');
  t1.value = `모닝컨퍼런스 담당교수님: ${chief ? withPf(chief) : ''}`;
  t1.font = font(20);
  t1.alignment = { vertical: 'middle', wrapText: true };
  for (const col of COLS) ws.getCell(`${col}1`).border = box;
  ws.getRow(1).height = 27.75;
  ws.getRow(2).height = 17.25;

  // 3행: 제목
  ws.mergeCells('B3:H3');
  const t3 = ws.getCell('B3');
  t3.value = `${year}년 ${month}월 모닝컨퍼런스 스케줄`;
  t3.font = font(20);
  t3.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  // 병합 칸은 스타일을 공유하므로 한 번에 지정(바깥 테두리만 보입니다)
  const med = { style: 'medium' };
  t3.border = { top: med, left: med, right: med };
  ws.getRow(3).height = 24.75;

  // 4행: 머리줄
  XL.headers.forEach((h, i) => {
    const c = ws.getCell(4, 2 + i);
    c.value = h;
    c.font = { name: 'Arial', size: 18, bold: true };
    c.fill = fill(XL.gray);
    c.border = box;
    c.alignment = center;
  });
  ws.getRow(4).height = 27;

  // 본문
  const [hh, mm] = String(time || '07:45').split(':').map(Number);
  const timeVal = ((hh || 0) * 60 + (mm || 0)) / 1440;
  const byDate = {};
  for (const [cid, d] of Object.entries(state.assignments)) { const c = conf(cid); if (c) (byDate[d] ||= []).push(c); }

  let r = 5;
  const weeks = state.settings.weeks;
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 5; i++) {
      const d = days[w * 5 + i];
      const ds = ymd(d);
      const hol = holidayName(ds);
      const confs = byDate[ds] || [];
      const ppl = confs.map(exportPeople);
      const join = (k) => ppl.map((p) => p[k]).filter(Boolean).join('\n');
      const E = join(0);
      const eLines = E ? E.split('\n').length : 1;
      const eSize = eLines >= 4 ? 14 : eLines === 3 ? 16 : 18;
      const vals = {
        B: [`${d.getMonth() + 1}월 ${d.getDate()}일`, font(20, hol ? { color: { argb: XL.red } } : {})],
        C: [DOW[d.getDay()], font(20)],
        D: [timeVal, font(20)],
        E: [E, font(eSize)],
        F: [join(1), font(18)],
        G: [join(2), font(18)],
        H: [confs.map(exportTopic).join('\n'), font(18)],
        I: [hol || '', font(18)],
      };
      for (const col of COLS) {
        const c = ws.getCell(`${col}${r}`);
        const [v, f] = vals[col];
        c.value = v === '' ? null : v;
        c.font = f;
        c.border = box;
        c.alignment = center;
      }
      ws.getCell(`D${r}`).numFmt = 'h:mm';
      ws.getCell(`C${r}`).fill = fill(XL.gray);

      const lines = Math.max(
        wrapLines(vals.E[0], XL.cols.E, eSize),
        wrapLines(vals.F[0], XL.cols.F, 18),
        wrapLines(vals.G[0], XL.cols.G, 18),
        wrapLines(vals.H[0], XL.cols.H, 18),
        wrapLines(vals.I[0], XL.cols.I, 18),
      );
      ws.getRow(r).height = Math.max(60, lines * 24 + 12);
      r++;
    }
    if (w < weeks - 1) {   // 주 사이 회색 구분줄
      for (const col of COLS) {
        const c = ws.getCell(`${col}${r}`);
        c.fill = fill(XL.sep);
        c.border = box;
      }
      ws.getRow(r).height = 21;
      r++;
    }
  }

  return { wb, year, month };
}

async function downloadWorkbook(opts) {
  const { wb, year, month } = await buildWorkbook(opts);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `모컨_${year}년_${month}월.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return a.download;
}

/* ---------------- 내보내기 창 ---------------- */
function exportWarnings() {
  const inView = new Set(viewDays().map(ymd));
  const placed = state.conferences.filter((c) => inView.has(state.assignments[c.id]));
  const pending = state.conferences.length - placed.length;
  const conflicts = placed.filter((c) => !checkDate(c, state.assignments[c.id]).ok);
  const incomplete = placed.filter((c) => compIssues(c).length);
  const noFellow = placed.filter((c) => !isInvited(c) && !fellowOf(c));
  const lines = [];
  if (noFellow.length) lines.push(`<div class="bad">⚠ 전임의를 넣지 않은 컨퍼런스 ${noFellow.length}개: ${noFellow.map((c) => esc(label(c))).join(', ')}</div>`);
  if (pending) lines.push(`<div class="bad">⚠ 달력에 놓지 않은 컨퍼런스 ${pending}개 — 엑셀에 나오지 않습니다</div>`);
  if (conflicts.length) lines.push(`<div class="bad">⚠ 날짜 충돌 ${conflicts.length}개: ${conflicts.map((c) => esc(label(c))).join(', ')}</div>`);
  if (incomplete.length) lines.push(`<div class="bad">⚠ 구성이 덜 된 컨퍼런스 ${incomplete.length}개: ${incomplete.map((c) => esc(label(c))).join(', ')}</div>`);
  return lines.join('') || '<div class="ok">✓ 모든 컨퍼런스가 배정되었습니다</div>';
}

$('#btnXlsx').addEventListener('click', () => {
  const ex = state.settings.export;
  const profs = state.people.filter((p) => p.role === '교수');
  $('#xChief').innerHTML = '<option value="">(비워 두기)</option>' +
    profs.map((p) => `<option ${p.name === ex.chief ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#xTime').value = ex.time || '07:45';
  $('#xWarn').innerHTML = exportWarnings();
  $('#xlsxDialog').showModal();
});

$('#xGo').addEventListener('click', async (e) => {
  e.preventDefault();
  const btn = e.currentTarget;
  state.settings.export = { chief: $('#xChief').value, time: $('#xTime').value || '07:45' };
  save();
  btn.disabled = true;
  btn.textContent = '만드는 중…';
  try {
    const name = await downloadWorkbook(state.settings.export);
    $('#xlsxDialog').close();
    toast(`${name} 저장`);
  } catch (err) {
    alert(`내보내기 실패: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '내보내기';
  }
});
