'use strict';

/* =========================================================
   감수 요청 메일 — 달력에 놓인 컨퍼런스마다 감수 교수님께 보낼 메일을 만듭니다.
   app.js(state, conf, membersOf …)와 export.js(exportTopic, resLine)를 사용합니다.
   ========================================================= */

const MAIL_LINE_TOP = '===================================================';
const MAIL_LINE_BOTTOM = '====================================================';

const mailDate = (d) => `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`;
function mailTime(t) {
  const [h, m] = String(t || '07:45').split(':').map(Number);
  const hh = h || 0;
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ampm} ${h12}:${pad(m || 0)}`;
}

/** 스케줄의 달(달력 가운데 날짜 기준) */
function scheduleMonth() {
  const days = viewDays();
  return days[Math.floor(days.length / 2)].getMonth() + 1;
}

function mailBody({ prof, date, topic, presenters, name, month, place, time }) {
  const who = name || '○○○';
  return [
    `${prof} 교수님께,`,
    '',
    '교수님, 안녕하십니까.',
    `${month}월 교육수석 ${who}입니다.`,
    '',
    `${date} 모닝컨퍼런스 감수가 가능하실지 여쭙고자 메일 드리게 되었습니다.`,
    '',
    MAIL_LINE_TOP,
    `일시: ${date} ${time}`,
    '',
    `장소: ${place}`,
    '',
    `주제: ${topic}`,
    '',
    `발표자: ${presenters || '미정'}`,
    MAIL_LINE_BOTTOM,
    '',
    '상기와 같이 컨퍼런스 진행 예정으로, 감수 가능하실지 여쭙습니다.',
    '',
    '혹시 다른 날짜가 더 편하시면, 회신 주시면 반영하겠습니다.',
    '',
    '바쁘신 중에도 늘 전공의 교육에 힘 써주심에 깊이 감사드립니다.',
    '',
    '',
    `교육수석 ${who} 올림`,
  ].join('\n');
}

/** 날짜순 메일 목록. 감수 교수가 없는 컨퍼런스는 skipped 로 따로 */
function buildMails() {
  const opt = state.settings.mail;
  const month = Number(opt.month) || ((scheduleMonth() + 10) % 12) + 1;   // 기본: 스케줄 달의 전달
  const time = mailTime(state.settings.export.time);
  const inView = new Set(viewDays().map(ymd));
  const placed = state.conferences
    .filter((c) => inView.has(state.assignments[c.id]) && !isInvited(c))
    .sort((a, b) => state.assignments[a.id].localeCompare(state.assignments[b.id]));

  const mails = [];
  const skipped = [];
  for (const c of placed) {
    const { profs, res } = membersOf(c);
    if (!profs.length) { skipped.push(c); continue; }
    const date = mailDate(parseYmd(state.assignments[c.id]));
    const topic = exportTopic(c);
    const presenters = res.map(resLine).join(' / ');
    for (const p of profs) {
      mails.push({
        c, prof: p.name, date, topic,
        body: mailBody({ prof: p.name, date, topic, presenters, name: opt.name.trim(), month, place: opt.place.trim() || '대회의실', time }),
      });
    }
  }
  return { mails, skipped, month };
}

function renderMails() {
  const { mails, skipped, month } = buildMails();
  if (!$('#mMonth').value) $('#mMonth').value = month;
  $('#mailList').innerHTML =
    (skipped.length ? `<div class="mail-skip">⚠ 감수 교수가 정해지지 않아 빠진 컨퍼런스: ${skipped.map((c) => esc(label(c))).join(', ')}</div>` : '') +
    (mails.map((m, i) => `
      <div class="mail" style="--c:${colorOf(m.c)}">
        <div class="mail-head"><b>${esc(m.date)}</b> <span>${esc(m.topic)}</span> · <span class="to">${esc(m.prof)} 교수님</span>
          <button data-copy="${i}">복사</button></div>
        <pre>${esc(m.body)}</pre>
      </div>`).join('') || '<div class="empty-note">달력에 놓인 컨퍼런스가 없습니다.</div>');
  $('#mailCount').textContent = mails.length ? `메일 ${mails.length}통` : '';
  renderMails.current = mails;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 클립보드 권한이 없을 때의 예비 방법
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// '월'은 직접 바꿨을 때만 저장합니다(그대로 두면 매번 스케줄 달의 전달로 자동 계산).
let monthTouched = false;
function saveMailOpts() {
  state.settings.mail = {
    name: $('#mName').value.trim(),
    month: monthTouched ? (Number($('#mMonth').value) || null) : state.settings.mail.month,
    place: $('#mPlace').value.trim() || '대회의실',
  };
  save();
}

$('#btnMail').addEventListener('click', () => {
  const opt = state.settings.mail;
  monthTouched = !!opt.month;
  $('#mName').value = opt.name || '';
  $('#mMonth').value = opt.month || '';
  $('#mPlace').value = opt.place || '대회의실';
  renderMails();
  $('#mailDialog').showModal();
  if (!opt.name) $('#mName').focus();
});

for (const id of ['#mName', '#mMonth', '#mPlace']) {
  $(id).addEventListener('input', () => {
    if (id === '#mMonth') monthTouched = true;
    saveMailOpts();
    renderMails();
  });
}

$('#mailList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const m = renderMails.current[Number(b.dataset.copy)];
  await copyText(m.body);
  b.textContent = '복사됨';
  b.classList.add('done');
  toast(`${m.date} ${m.prof} 교수님 메일을 복사했습니다`);
});

$('#mCopyAll').addEventListener('click', async () => {
  const mails = renderMails.current || [];
  if (!mails.length) return;
  const sep = '\n\n\n────────────────────────────\n\n\n';
  await copyText(mails.map((m) => m.body).join(sep));
  toast(`메일 ${mails.length}통을 모두 복사했습니다`);
});

$('#mClose').addEventListener('click', () => $('#mailDialog').close());
