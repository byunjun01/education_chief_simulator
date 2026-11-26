'use strict';

/* =========================================================
   메일 만들기
   (1) 감수 요청  — 달력에 놓인 컨퍼런스마다 감수 교수님께 (FL·IL 제외)
   (2) FL·IL 리마인드 — FL·Invited Lecture 마다 D-7(연자), D-1 전체, D-1 개별(연자)
   app.js(state, conf, membersOf …)와 export.js(exportTopic, resLine, dayConfs, withPf)를 사용합니다.
   ========================================================= */

const MAIL_LINE_TOP = '===================================================';
const MAIL_LINE_BOTTOM = '====================================================';
const REM_LINE = '==================================================================';
const REM_THANKS = '바쁘신 중에 가정의학과 전공의/전임의/교수님 대상으로 특강을 해주심에 진심으로 감사드립니다.';

const mailDate = (d) => `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`;   // 11/16 (월)
const tightDate = (d) => `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;   // 11/16(월)
/** 감수 요청 제목: [교육수석] 11/16(월) 모닝컨퍼런스 감수 요청 */
const mailSubject = (d) => `[교육수석] ${tightDate(d)} 모닝컨퍼런스 감수 요청`;

/** "오전 7:45" (zeroPad 이면 "오전 07:45") */
function mailTime(t, zeroPad = false) {
  const [h, m] = String(t || '07:45').split(':').map(Number);
  const hh = h || 0;
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ampm} ${zeroPad ? pad(h12) : h12}:${pad(m || 0)}`;
}

/** 스케줄의 달(달력 가운데 날짜 기준) */
function scheduleMonth() {
  const days = viewDays();
  return days[Math.floor(days.length / 2)].getMonth() + 1;
}

const mailOpts = () => {
  const o = state.settings.mail;
  return { ...o, who: o.name.trim() || '○○○', place: o.place.trim() || '대회의실' };
};

/* ---------------- (1) 감수 요청 ---------------- */
function supBody({ prof, date, topic, presenters, who, month, place, time }) {
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

/** 날짜순 감수 요청(하루에 한 묶음). 감수 교수가 없는 날의 컨퍼런스는 skipped 로 따로.
    파견지 보고 + 증례가 같은 날이면 증례 교수님께 한 통, 주제·발표자는 합쳐서 적습니다. */
function buildSupMails() {
  const o = mailOpts();
  const month = Number(o.month) || ((scheduleMonth() + 10) % 12) + 1;   // 기본: 스케줄 달의 전달
  const time = mailTime(state.settings.export.time);
  const mails = [];
  const skipped = [];
  for (const d of viewDays()) {
    const confs = dayConfs(ymd(d)).filter((c) => !isInvited(c));   // FL·IL 제외
    if (!confs.length) continue;
    const profs = [...new Map(confs.flatMap((c) => membersOf(c).profs).map((p) => [p.id, p])).values()];
    if (!profs.length) { skipped.push(...confs); continue; }
    const date = mailDate(d);
    const topic = confs.map(exportTopic).join('/');
    const presenters = confs.flatMap((c) => membersOf(c).res.map(resLine)).join(' / ');
    const main = confs.find((c) => hasSupervisor(c)) || confs[0];
    for (const p of profs) {
      mails.push({
        c: main, prof: p.name, date, topic,
        label: `${date} ${p.name} 교수님`,
        subject: mailSubject(d),
        body: supBody({ prof: p.name, date, topic, presenters, who: o.who, month, place: o.place, time }),
      });
    }
  }
  return { mails, skipped, month };
}

/* ---------------- (2) FL·IL 리마인드 ---------------- */
const REM_KINDS = [
  { key: 'D-7', d: 7, to: '연자' },
  { key: 'D-1 전체', d: 1, to: '전체' },
  { key: 'D-1 개별', d: 1, to: '연자' },
];

function remBody(kind, { who, year, date, time, place, speaker, topic, zoom }) {
  const lines = [
    '안녕하십니까 교수님',
    '',
    `가정의학과 교육수석 ${who} 입니다.`,
    `${date} 예정된 모닝컨퍼런스 ${kind.d === 7 ? 'D-7' : 'D-1'} 리마인드 드립니다.`,
    REM_LINE,
    '',
    `일시 : ${date} ${time}`,
    '',
    `장소 : ${place}`,
    '',
    `발표자 : ${speaker}`,
    '',
    `주제 : ${topic}`,
  ];
  if (kind.key === 'D-1 전체') lines.push('', '* 줌 링크', zoom || '(줌 링크를 입력하세요)');
  lines.push(REM_LINE, '', '감사합니다.', '');
  if (kind.key === 'D-7') {
    lines.push(
      '교수님께서도 주지하고 계시겠지만, 원내 전산보안 강화로 외부 메일 및 USB 사용에 제한이 있습니다.',
      '강의자료 ppt 또는 pdf를 보내주시면 강의 전 컴퓨터에 설치하도록 하겠습니다.',
      '',
      REM_THANKS,
      '',
      `${who} 올림`,
    );
  } else if (kind.key === 'D-1 전체') {
    lines.push(`${who} 올림`);
  } else {
    lines.push(REM_THANKS, '', `- 가정의학과 ${year ? `${year}년차 ` : ''}${who} 올림.`);
  }
  return lines.join('\n');
}

/** FL·IL 마다 [D-7, D-1 전체, D-1 개별] */
function buildRemGroups() {
  const o = mailOpts();
  const time = mailTime(state.settings.export.time, true);
  const groups = [];
  for (const d of viewDays()) {
    for (const c of dayConfs(ymd(d)).filter((x) => isInvited(x))) {
      const t = typeOf(c);
      const date = tightDate(d);
      const speaker = c.speaker.trim() ? withPf(c.speaker) : 'Pf. 미정';
      const topic = c.topic.trim() || '미정';
      groups.push({
        c, date, speaker, topic,
        mails: REM_KINDS.map((k) => ({
          c,
          kind: k.key,
          to: k.to === '연자' ? `${c.speaker.trim() || '연자'} 교수님께` : '전체',
          when: tightDate(addDays(d, -k.d)),
          label: `${label(c)} ${date} ${k.key}`,
          subject: `[교육수석] 모닝컨퍼런스 (${t.short}) ${k.d === 7 ? 'D-7' : 'D-1'} 리마인드 드립니다`,
          body: remBody(k, { who: o.who, year: Number(o.year) || null, date, time, place: o.place, speaker, topic, zoom: o.zoom.trim() }),
        })),
      });
    }
  }
  return groups;
}

/* ---------------- 그리기 ---------------- */
const HELP = {
  sup: '달력에 놓인 컨퍼런스마다 감수 교수님께 보낼 메일을 만듭니다(FL·Invited Lecture 제외). [제목 복사]·[본문 복사]로 메일 프로그램에 붙여넣으세요.',
  rem: '달력에 놓인 FL·Invited Lecture마다 D-7(연자께), D-1 전체메일, D-1 개별(연자께) 메일을 만듭니다. 보낼 날은 강의일 기준 7일 전·전날입니다.',
};

function mailCard(m, i, head) {
  return `
    <div class="mail" style="--c:${colorOf(m.c)}">
      <div class="mail-head">${head}</div>
      <div class="mail-subj"><span class="k">제목</span><span class="v">${esc(m.subject)}</span>
        <button data-copy="${i}" data-part="subject">제목 복사</button></div>
      <pre>${esc(m.body)}</pre>
      <div class="mail-foot"><button data-copy="${i}" data-part="body">본문 복사</button></div>
    </div>`;
}

let mailMode = 'sup';
let currentMails = [];

function renderMails() {
  $('#mailDialog').dataset.mode = mailMode;
  $$('.mtab').forEach((b) => b.classList.toggle('on', b.dataset.mtab === mailMode));
  $('#mailHelp').textContent = HELP[mailMode];
  currentMails = [];

  if (mailMode === 'sup') {
    const { mails, skipped, month } = buildSupMails();
    if (!$('#mMonth').value) $('#mMonth').value = month;
    currentMails = mails;
    $('#mailList').innerHTML =
      (skipped.length ? `<div class="mail-skip">⚠ 감수 교수가 정해지지 않아 빠진 컨퍼런스: ${skipped.map((c) => esc(label(c))).join(', ')}</div>` : '') +
      (mails.map((m, i) => mailCard(m, i,
        `<b>${esc(m.date)}</b> <span>${esc(m.topic)}</span> · <span class="to">${esc(m.prof)} 교수님</span>`)).join('')
        || '<div class="empty-note">달력에 놓인 컨퍼런스가 없습니다.</div>');
  } else {
    const groups = buildRemGroups();
    $('#mailList').innerHTML = groups.map((g) => {
      const cards = g.mails.map((m) => {
        const i = currentMails.push(m) - 1;
        return mailCard(m, i,
          `<span class="mail-kind">${esc(m.kind)}</span> · <span class="to">${esc(m.to)}</span>
           <span class="mail-when">· 보낼 날 ${esc(m.when)}</span>`);
      }).join('');
      return `
        <div class="mail-group" style="--c:${colorOf(g.c)}">
          <div class="mail-head"><b>${esc(g.date)}</b> <span>${esc(label(g.c))}</span> · <span class="to">${esc(g.speaker)}</span> · <span>${esc(g.topic)}</span></div>
          ${cards}
        </div>`;
    }).join('') || '<div class="empty-note">달력에 놓인 FL·Invited Lecture가 없습니다.</div>';
  }
  $('#mailCount').textContent = currentMails.length ? `메일 ${currentMails.length}통` : '';
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
  const o = state.settings.mail;
  state.settings.mail = {
    ...o,
    name: $('#mName').value.trim(),
    month: monthTouched ? (Number($('#mMonth').value) || null) : o.month,
    place: $('#mPlace').value.trim() || '대회의실',
    year: Number($('#mYear').value) || null,
    zoom: $('#mZoom').value.trim(),
    tab: mailMode,
  };
  save();
}

$('#btnMail').addEventListener('click', () => {
  const o = state.settings.mail;
  monthTouched = !!o.month;
  mailMode = o.tab === 'rem' ? 'rem' : 'sup';
  $('#mName').value = o.name || '';
  $('#mMonth').value = o.month || '';
  $('#mPlace').value = o.place || '대회의실';
  $('#mYear').value = o.year || '';
  $('#mZoom').value = o.zoom || '';
  renderMails();
  $('#mailDialog').showModal();
  if (!o.name) $('#mName').focus();
});

$('#mailTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.mtab');
  if (!b) return;
  mailMode = b.dataset.mtab;
  saveMailOpts();
  renderMails();
});

for (const id of ['#mName', '#mMonth', '#mPlace', '#mYear', '#mZoom']) {
  $(id).addEventListener('input', () => {
    if (id === '#mMonth') monthTouched = true;
    saveMailOpts();
    renderMails();
  });
}

$('#mailList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const m = currentMails[Number(b.dataset.copy)];
  const isSubject = b.dataset.part === 'subject';
  await copyText(isSubject ? m.subject : m.body);
  b.textContent = isSubject ? '제목 복사됨' : '본문 복사됨';
  b.classList.add('done');
  toast(`${m.label} ${isSubject ? '제목' : '본문'}을 복사했습니다`);
});

$('#mCopyAll').addEventListener('click', async () => {
  if (!currentMails.length) return;
  const sep = '\n\n\n────────────────────────────\n\n\n';
  await copyText(currentMails.map((m) => `■ ${m.label}\n제목: ${m.subject}\n\n${m.body}`).join(sep));
  toast(`메일 ${currentMails.length}통을 모두 복사했습니다`);
});

$('#mClose').addEventListener('click', () => $('#mailDialog').close());
