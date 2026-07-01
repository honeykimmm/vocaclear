/* ============================================
   보카클리어 고교필수편 — 메인 앱 로직
   ============================================ */

const WORDS = window.VOCA_DATA || [];
const TOTAL_DAYS = 40;

// 선생님 > 반 구조
const TEACHER_CLASSES = {
  "강민지": ["월수반", "월금반", "화목반"],
  "송정은": ["화목반"],
};
const TEACHER_LIST = Object.keys(TEACHER_CLASSES);

// className은 "선생님_반" 형태의 고유 키로 저장 (예: "강민지_월수반")
function makeClassName(teacher, cls) { return `${teacher}_${cls}`; }
function splitClassName(className) {
  if (!className) return { teacher: "", cls: "" };
  const i = className.indexOf("_");
  if (i === -1) return { teacher: className, cls: "" };
  return { teacher: className.slice(0, i), cls: className.slice(i + 1) };
}
function classLabel(className) {
  const { teacher, cls } = splitClassName(className);
  return `${teacher} · ${cls}`;
}
// 전체 반 목록 (평탄화) - 랭킹/대시보드 순회용
const ALL_CLASSES = TEACHER_LIST.flatMap(t => TEACHER_CLASSES[t].map(c => makeClassName(t, c)));

// 교사 대시보드 비밀번호 (전체 공유)
const TEACHER_DASH_PASSWORD = "dyb2024";

// ---------- 로컬스토리지 키 ----------
const LS_KEYS = {
  profile: "vc_profile",
  theme: "vc_theme",
  history: "vc_history", // fallback local history if firebase unavailable
};

// ---------- 전역 상태 ----------
const state = {
  route: "home",          // home | list | flash | typing | rank | profile | dash
  theme: localStorage.getItem(LS_KEYS.theme) || "auto",
  profile: loadProfile(),  // {name, className}
  selectedDays: [1],
  flash: { idx: 0, flipped: false, shuffle: false, order: [] },
  typing: { running: false, idx: 0, correct: 0, wrong: 0, startTime: 0, order: [], input: "", lastResult: null, finished: false },
  rankClass: null,
  rankLoading: false,
  rankData: [],
  profileHistory: [],
  profileLoading: false,
  dashLoading: false,
  dashData: [],
};

function loadProfile() {
  try {
    const raw = localStorage.getItem(LS_KEYS.profile);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveProfile(p) {
  state.profile = p;
  localStorage.setItem(LS_KEYS.profile, JSON.stringify(p));
}

// ---------- 테마 ----------
function applyTheme() {
  const t = state.theme;
  let actual = t;
  if (t === "auto") {
    actual = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", actual);
}
function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const i = order.indexOf(state.theme);
  state.theme = order[(i + 1) % order.length];
  localStorage.setItem(LS_KEYS.theme, state.theme);
  applyTheme();
  render();
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.theme === "auto") applyTheme();
});

// ---------- 유틸 ----------
function wordsForDays(days) {
  const set = new Set(days);
  return WORDS.filter(w => set.has(w.day));
}
function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function normalize(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
function showToast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
function fmtDate(d) {
  if (!d) return "";
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getMonth()+1}/${dt.getDate()}`;
}
function fmtDateTime(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}

// 선생님 > 반 2단계 선택 UI. idPrefix로 data attribute 충돌을 피함.
// selectedClassName: "선생님_반" 형태 또는 null
function renderTeacherClassPicker(idPrefix, selectedClassName) {
  const sel = splitClassName(selectedClassName);
  let html = `<div class="teacher-picker" data-tcpw="${idPrefix}">`;
  html += `<div class="rank-class-select">`;
  html += TEACHER_LIST.map(t => `<button class="rank-chip ${sel.teacher===t?'selected':''}" data-${idPrefix}-teacher="${t}">${t} 선생님</button>`).join("");
  html += `</div>`;
  if (sel.teacher) {
    const classes = TEACHER_CLASSES[sel.teacher] || [];
    html += `<div class="rank-class-select" style="margin-top:8px;">`;
    html += classes.map(c => `<button class="rank-chip ${sel.cls===c?'selected':''}" data-${idPrefix}-cls="${c}">${c}</button>`).join("");
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

// renderTeacherClassPicker가 그려진 컨테이너에 클릭 핸들러 연결.
// onChange(newClassName)이 선생님 또는 반이 바뀔 때마다 호출됨.
function attachTeacherClassPicker(idPrefix, currentClassName, onChange) {
  const sel = splitClassName(currentClassName);
  document.querySelectorAll(`[data-${idPrefix}-teacher]`).forEach(el => {
    el.addEventListener("click", () => {
      const teacher = el.getAttribute(`data-${idPrefix}-teacher`);
      // 선생님만 바뀌고 반은 아직 미정 -> 송정은처럼 반이 1개뿐이면 자동 선택
      const classes = TEACHER_CLASSES[teacher] || [];
      const autoCls = classes.length === 1 ? classes[0] : null;
      onChange(autoCls ? makeClassName(teacher, autoCls) : makeClassName(teacher, ""));
    });
  });
  document.querySelectorAll(`[data-${idPrefix}-cls]`).forEach(el => {
    el.addEventListener("click", () => {
      const cls = el.getAttribute(`data-${idPrefix}-cls`);
      if (!sel.teacher) return;
      onChange(makeClassName(sel.teacher, cls));
    });
  });
}

// ---------- 라우터 ----------
function navigate(route) {
  state.route = route;
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
}

// ---------- 렌더 루트 ----------
function render() {
  applyTheme();
  const app = document.getElementById("app");
  app.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    <main>${renderRoute()}</main>
  `;
  attachGlobalHandlers();
  attachRouteHandlers();
}

function renderHeader() {
  const themeIcon = state.theme === "auto" ? "◐" : (state.theme === "dark" ? "●" : "○");
  const themeLabel = state.theme === "auto" ? "자동" : (state.theme === "dark" ? "다크" : "라이트");
  return `
  <header class="header">
    <div class="brand" data-nav="home" style="cursor:pointer">
      <span class="brand-mark">VC</span>
      <div>
        <div class="brand-title">Voca Clear</div>
        <div class="brand-sub">보카클리어 고교필수편 · DAY 01–40 · 1,600 단어</div>
      </div>
    </div>
    <button class="theme-toggle" id="themeToggleBtn">
      <span>${themeIcon}</span><span>${themeLabel}</span>
    </button>
  </header>`;
}

function renderTabs() {
  const tabs = [
    { id: "home", label: "홈" },
    { id: "list", label: "단어 목록" },
    { id: "flash", label: "플래시카드" },
    { id: "typing", label: "타이핑테스트" },
    { id: "rank", label: "랭킹" },
    { id: "profile", label: "내 기록" },
    { id: "dash", label: "교사 대시보드" },
  ];
  return `<nav class="tabs">
    ${tabs.map(t => `<button class="tab ${state.route===t.id?'active':''}" data-nav="${t.id}">${t.label}</button>`).join("")}
  </nav>`;
}

function attachGlobalHandlers() {
  document.querySelectorAll("[data-nav]").forEach(el => {
    el.addEventListener("click", () => navigate(el.getAttribute("data-nav")));
  });
  const tt = document.getElementById("themeToggleBtn");
  if (tt) tt.addEventListener("click", (e) => { e.stopPropagation(); cycleTheme(); });
}

function renderRoute() {
  switch (state.route) {
    case "home": return renderHome();
    case "list": return renderList();
    case "flash": return renderFlash();
    case "typing": return renderTyping();
    case "rank": return renderRank();
    case "profile": return renderProfile();
    case "dash": return renderDash();
    default: return renderHome();
  }
}

/* ============================================
   홈 화면
   ============================================ */

function renderHome() {
  const name = state.profile ? state.profile.name : null;
  return `
  <section class="hero">
    <div class="section-eyebrow">VOCA CLEAR · 고교필수 ${WORDS.length} 단어 · DAY 01–40</div>
    <h1 class="hero-headline">${name ? `${escapeHtml(name)}님, 오늘은<br/>몇 <em>DAY</em>를 외워볼까요?` : `Voca Clear,<br/><em>내 손안의 단어장</em>`}</h1>
    <div class="hero-meta">
      <span>총 단어 <b>${WORDS.length}</b></span>
      <span>DAY <b>40</b>개</span>
      <span>모드 <b>4</b>가지</span>
    </div>
  </section>
  <div class="mode-grid">
    <button class="mode-card" data-nav="list">
      <span class="mode-index">01 · LIST</span>
      <span class="mode-name">단어 목록</span>
      <span class="mode-desc">DAY별 전체 단어를 훑어보고 발음을 들어요.</span>
    </button>
    <button class="mode-card" data-nav="flash">
      <span class="mode-index">02 · CARD</span>
      <span class="mode-name">플래시카드</span>
      <span class="mode-desc">카드를 넘기며 뜻을 떠올려 암기해요.</span>
    </button>
    <button class="mode-card" data-nav="typing">
      <span class="mode-index">03 · TYPE</span>
      <span class="mode-name">타이핑테스트</span>
      <span class="mode-desc">뜻을 보고 영단어를 직접 입력해요.</span>
    </button>
    <button class="mode-card" data-nav="rank">
      <span class="mode-index">04 · RANK</span>
      <span class="mode-name">반별 랭킹</span>
      <span class="mode-desc">실시간으로 우리 반 순위를 확인해요.</span>
    </button>
    <button class="mode-card" data-nav="profile">
      <span class="mode-index">05 · TRACK</span>
      <span class="mode-name">내 점수 기록</span>
      <span class="mode-desc">그래프로 보는 나의 성장 추이.</span>
    </button>
    <button class="mode-card" data-nav="dash">
      <span class="mode-index">06 · TEACH</span>
      <span class="mode-name">교사 대시보드</span>
      <span class="mode-desc">반 전체 학생 현황을 한눈에.</span>
    </button>
  </div>
  `;
}

function attachHomeHandlers() {}

/* ============================================
   단어 목록
   ============================================ */

let listState = { day: 1 };

function renderList() {
  const words = wordsForDays([listState.day]);
  return `
  <section>
    <div class="section-eyebrow">WORD LIST</div>
    <h2 class="section-title">단어 목록</h2>
    <p class="section-desc">DAY를 선택하면 해당 회차 단어 40개를 확인할 수 있어요. 영단어를 누르면 발음을 들을 수 있어요.</p>
    ${renderDayGrid(listState.day, "listDay")}
    <div class="word-list card" style="padding: 6px 18px; margin-top:18px;">
      ${words.map(w => `
        <div class="word-row">
          <span class="word-id">${String(w.id).padStart(4,'0')}</span>
          <span class="word-en" data-speak="${escapeHtml(w.word)}">${escapeHtml(w.word)}</span>
          <button class="speak-btn" data-speak="${escapeHtml(w.word)}" title="발음 듣기">▸</button>
          <span class="word-kr">${escapeHtml(w.meaning)}</span>
        </div>
      `).join("")}
    </div>
  </section>`;
}

function renderDayGrid(selected, dataAttr) {
  let chips = "";
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    chips += `<button class="day-chip ${d===selected?'selected':''}" data-${dataAttr}="${d}">${d}</button>`;
  }
  return `<div class="day-grid">${chips}</div>`;
}

function attachListHandlers() {
  document.querySelectorAll("[data-listDay]").forEach(el => {
    el.addEventListener("click", () => {
      listState.day = parseInt(el.getAttribute("data-listDay"));
      render();
    });
  });
  document.querySelectorAll("[data-speak]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      speak(el.getAttribute("data-speak"));
    });
  });
}

function attachRouteHandlers() {
  switch (state.route) {
    case "home": attachHomeHandlers(); break;
    case "list": attachListHandlers(); break;
    case "flash": attachFlashHandlers(); break;
    case "typing": attachTypingHandlers(); break;
    case "rank": attachRankHandlers(); break;
    case "profile": attachProfileHandlers(); break;
    case "dash": attachDashHandlers(); break;
  }
}
/* ============================================
   플래시카드
   ============================================ */

let flashSetup = { day: 1, started: false };

function getFlashWords() {
  let words = wordsForDays([flashSetup.day]);
  if (state.flash.shuffle) {
    if (state.flash.order.length !== words.length) {
      state.flash.order = shuffleArr(words.map((_, i) => i));
    }
    return state.flash.order.map(i => words[i]);
  }
  return words;
}

function renderFlash() {
  if (!flashSetup.started) {
    return `
    <section>
      <div class="section-eyebrow">FLASHCARD</div>
      <h2 class="section-title">플래시카드 암기</h2>
      <p class="section-desc">암기할 DAY를 선택하고 시작하세요. 카드를 클릭하면 뒤집혀서 뜻이 보여요.</p>
      ${renderDayGrid(flashSetup.day, "flashDay")}
      <button class="btn btn-primary" id="flashStartBtn" style="margin-top:18px;">DAY ${flashSetup.day} 시작하기 →</button>
    </section>`;
  }

  const words = getFlashWords();
  const idx = state.flash.idx;
  const w = words[idx];
  if (!w) return `<div class="empty-state">단어가 없습니다.</div>`;

  return `
  <section class="flash-wrap">
    <a class="back-link" id="flashBackBtn">← DAY 선택으로</a>
    <div class="flash-progress">DAY ${flashSetup.day} · ${idx + 1} / ${words.length}</div>
    <div class="flash-card ${state.flash.flipped ? 'flipped':''}" id="flashCard">
      <div class="flash-inner">
        <div class="flash-face front">
          <span class="flash-day-tag">DAY ${w.day} · #${String(w.id).padStart(4,'0')}</span>
          <div class="flash-word">${escapeHtml(w.word)}</div>
          <span class="flash-hint">탭하여 뜻 보기</span>
        </div>
        <div class="flash-face back">
          <span class="flash-day-tag">DAY ${w.day} · #${String(w.id).padStart(4,'0')}</span>
          <div class="flash-meaning">${escapeHtml(w.meaning)}</div>
          <span class="flash-hint">탭하여 다시 보기</span>
        </div>
      </div>
    </div>
    <div class="flash-controls">
      <button class="flash-nav-btn" id="flashPrevBtn" ${idx===0?'disabled':''}>←</button>
      <button class="flash-shuffle ${state.flash.shuffle?'active':''}" id="flashShuffleBtn">🔀 셔플</button>
      <button class="speak-btn" id="flashSpeakBtn" title="발음 듣기">▸</button>
      <button class="flash-nav-btn" id="flashNextBtn" ${idx===words.length-1?'disabled':''}>→</button>
    </div>
  </section>`;
}

function attachFlashHandlers() {
  const startBtn = document.getElementById("flashStartBtn");
  if (startBtn) startBtn.addEventListener("click", () => {
    flashSetup.started = true;
    state.flash.idx = 0;
    state.flash.flipped = false;
    state.flash.order = [];
    render();
  });
  document.querySelectorAll("[data-flashDay]").forEach(el => {
    el.addEventListener("click", () => {
      flashSetup.day = parseInt(el.getAttribute("data-flashDay"));
      render();
    });
  });
  const backBtn = document.getElementById("flashBackBtn");
  if (backBtn) backBtn.addEventListener("click", () => { flashSetup.started = false; render(); });

  const card = document.getElementById("flashCard");
  if (card) card.addEventListener("click", () => {
    state.flash.flipped = !state.flash.flipped;
    render();
  });
  const prev = document.getElementById("flashPrevBtn");
  if (prev) prev.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.flash.idx > 0) { state.flash.idx--; state.flash.flipped = false; render(); }
  });
  const next = document.getElementById("flashNextBtn");
  if (next) next.addEventListener("click", (e) => {
    e.stopPropagation();
    const words = getFlashWords();
    if (state.flash.idx < words.length - 1) { state.flash.idx++; state.flash.flipped = false; render(); }
  });
  const shuf = document.getElementById("flashShuffleBtn");
  if (shuf) shuf.addEventListener("click", (e) => {
    e.stopPropagation();
    state.flash.shuffle = !state.flash.shuffle;
    state.flash.order = [];
    state.flash.idx = 0;
    state.flash.flipped = false;
    render();
  });
  const spk = document.getElementById("flashSpeakBtn");
  if (spk) spk.addEventListener("click", (e) => {
    e.stopPropagation();
    const words = getFlashWords();
    const w = words[state.flash.idx];
    if (w) speak(w.word);
  });
}
/* ============================================
   타이핑 테스트
   ============================================ */

let typingSetup = { days: [1], mode: "setup", editingProfile: false }; // setup | running | result

function isProfileComplete(p) {
  if (!p || !p.name || !p.name.trim()) return false;
  const { teacher, cls } = splitClassName(p.className);
  return !!(teacher && cls);
}

function renderTypingProfileForm() {
  if (isProfileComplete(state.profile) && !typingSetup.editingProfile) {
    return `
    <div class="card" style="padding:16px 20px; margin-top:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <span style="font-weight:700;">${escapeHtml(state.profile.name)}</span>
        <span style="color:var(--ink-soft); font-size:13px; margin-left:8px;">${escapeHtml(classLabel(state.profile.className))}</span>
      </div>
      <button class="btn btn-ghost btn-sm" id="tpEditProfileBtn">정보 변경</button>
    </div>`;
  }
  const curClass = state.profile ? state.profile.className : null;
  return `
  <div class="card" style="padding:24px; margin-top:14px;">
    <span class="field-label">이름</span>
    <input type="text" id="tpName" class="text-input" placeholder="예: 김민준" value="${state.profile ? escapeHtml(state.profile.name) : ''}" style="margin-bottom:14px;">
    <span class="field-label">선생님 / 반</span>
    ${renderTeacherClassPicker("tp", curClass)}
  </div>`;
}

function renderTyping() {
  if (typingSetup.mode === "setup") {
    return `
    <section>
      <div class="section-eyebrow">TYPING TEST</div>
      <h2 class="section-title">타이핑 테스트</h2>
      <p class="section-desc">뜻을 보고 영단어를 입력하세요. 결과는 자동으로 내 기록과 반 랭킹에 저장돼요.</p>
      ${renderTypingProfileForm()}
      <div style="margin-top:18px;">
        <span class="field-label">범위 선택 (복수 선택 가능)</span>
        ${renderDayGridMulti(typingSetup.days)}
        <div class="day-controls">
          <button class="btn btn-ghost btn-sm" id="tpSelectAll">전체 선택</button>
          <button class="btn btn-ghost btn-sm" id="tpClearAll">초기화</button>
        </div>
      </div>
      <button class="btn btn-primary" id="tpStartBtn" style="margin-top:18px;">테스트 시작 (${wordsForDays(typingSetup.days).length}문항) →</button>
    </section>`;
  }
  if (typingSetup.mode === "running") return renderTypingRunning();
  return renderTypingResult();
}

function renderDayGridMulti(selectedArr) {
  let chips = "";
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    chips += `<button class="day-chip ${selectedArr.includes(d)?'selected':''}" data-tpDay="${d}">${d}</button>`;
  }
  return `<div class="day-grid">${chips}</div>`;
}

function renderTypingRunning() {
  const t = state.typing;
  const words = t.order;
  const w = words[t.idx];
  const total = words.length;
  const elapsed = ((Date.now() - t.startTime) / 1000).toFixed(0);

  if (!w || t.finished) {
    return `<div class="empty-state"><div class="empty-icon">·</div><p>채점 중...</p></div>`;
  }

  return `
  <div class="typing-active">
    <div class="typing-hud">
      <div class="hud-item"><b id="tpHudIdx">${t.idx + 1} / ${total}</b><span>문항</span></div>
      <div class="hud-item"><b id="tpHudCorrect" style="color:var(--mint)">${t.correct}</b><span>정답</span></div>
      <div class="hud-item"><b id="tpHudWrong" style="color:var(--accent)">${t.wrong}</b><span>오답</span></div>
      <div class="hud-item"><b>${elapsed}s</b><span>경과</span></div>
    </div>
    <div class="typing-question">
      <div class="typing-q-day">DAY ${w.day} · #${String(w.id).padStart(4,'0')}</div>
      <div class="typing-q-meaning">${escapeHtml(w.meaning)}</div>
    </div>
    <div class="typing-input-row">
      <input type="text" id="tpInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="영단어를 입력하세요" value="${escapeHtml(t.input)}" ${t.submitting ? 'disabled' : ''}>
    </div>
    <div class="typing-answer-reveal" id="tpReveal"></div>
  </div>`;
}

function renderTypingResult() {
  const t = state.typing;
  const total = t.correct + t.wrong;
  const acc = total > 0 ? Math.round((t.correct / total) * 100) : 0;
  const elapsed = t.endTime && t.startTime ? Math.round((t.endTime - t.startTime) / 1000) : 0;

  return `
  <div class="typing-result">
    <div class="section-eyebrow">RESULT</div>
    <h2 class="section-title">테스트 결과</h2>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-label">정답</div><div class="stat-value mint">${t.correct}</div></div>
      <div class="stat-box"><div class="stat-label">오답</div><div class="stat-value accent">${t.wrong}</div></div>
      <div class="stat-box"><div class="stat-label">정확도</div><div class="stat-value">${acc}%</div></div>
      <div class="stat-box"><div class="stat-label">소요 시간</div><div class="stat-value">${elapsed}s</div></div>
    </div>
    ${t.wrongList && t.wrongList.length ? `
    <div class="card" style="padding:18px 20px; margin-top:6px;">
      <span class="field-label">틀린 단어</span>
      <div class="word-list">
        ${t.wrongList.map(w => `
          <div class="word-row">
            <span class="word-id">#${String(w.id).padStart(4,'0')}</span>
            <span class="word-en">${escapeHtml(w.word)}</span>
            <span></span>
            <span class="word-kr">${escapeHtml(w.meaning)} <span style="color:var(--accent)">— 입력: ${escapeHtml(w.userInput || '(빈칸)')}</span></span>
          </div>`).join("")}
      </div>
    </div>` : ''}
    <div style="display:flex; gap:10px; margin-top:22px; flex-wrap:wrap;">
      <button class="btn btn-primary" id="tpRetryBtn">다시 풀기</button>
      <button class="btn btn-ghost" id="tpGoProfileBtn">내 기록 보기</button>
      <button class="btn btn-ghost" id="tpGoRankBtn">반 랭킹 보기</button>
    </div>
    <p style="font-size:12px; color:var(--ink-faint); margin-top:14px;">결과가 자동으로 저장되었어요.</p>
  </div>`;
}

function attachTypingHandlers() {
  if (typingSetup.mode === "setup") {
    const showingSummary = isProfileComplete(state.profile) && !typingSetup.editingProfile;
    if (showingSummary) {
      const editBtn = document.getElementById("tpEditProfileBtn");
      if (editBtn) editBtn.addEventListener("click", () => {
        typingSetup.editingProfile = true;
        render();
      });
    } else {
      document.getElementById("tpName").addEventListener("input", (e) => {
        const cls = state.profile ? state.profile.className : "";
        saveProfile({ name: e.target.value, className: cls });
      });
      attachTeacherClassPicker("tp", state.profile ? state.profile.className : null, (newClassName) => {
        const name = state.profile ? state.profile.name : (document.getElementById("tpName").value || "");
        saveProfile({ name, className: newClassName });
        render();
      });
    }
    document.querySelectorAll("[data-tpDay]").forEach(el => {
      el.addEventListener("click", () => {
        const d = parseInt(el.getAttribute("data-tpDay"));
        const i = typingSetup.days.indexOf(d);
        if (i >= 0) typingSetup.days.splice(i, 1);
        else typingSetup.days.push(d);
        if (typingSetup.days.length === 0) typingSetup.days = [d];
        render();
      });
    });
    document.getElementById("tpSelectAll").addEventListener("click", () => {
      typingSetup.days = Array.from({length: TOTAL_DAYS}, (_, i) => i + 1);
      render();
    });
    document.getElementById("tpClearAll").addEventListener("click", () => {
      typingSetup.days = [1];
      render();
    });
    document.getElementById("tpStartBtn").addEventListener("click", () => {
      if (!state.profile || !state.profile.name || !state.profile.name.trim()) {
        showToast("이름을 입력해주세요");
        return;
      }
      const { teacher, cls } = splitClassName(state.profile.className);
      if (!teacher) {
        showToast("선생님을 선택해주세요");
        return;
      }
      if (!cls) {
        showToast("반을 선택해주세요");
        return;
      }
      startTypingTest();
    });
    return;
  }

  if (typingSetup.mode === "running") {
    const input = document.getElementById("tpInput");
    if (input && !input.disabled) {
      input.focus();
      input.addEventListener("input", (e) => { state.typing.input = e.target.value; });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submitTypingAnswer(); }
      });
    }
    return;
  }

  const retry = document.getElementById("tpRetryBtn");
  if (retry) retry.addEventListener("click", () => { typingSetup.mode = "setup"; render(); });
  const gp = document.getElementById("tpGoProfileBtn");
  if (gp) gp.addEventListener("click", () => navigate("profile"));
  const gr = document.getElementById("tpGoRankBtn");
  if (gr) gr.addEventListener("click", () => navigate("rank"));
}

function startTypingTest() {
  typingSetup.editingProfile = false;
  const words = shuffleArr(wordsForDays(typingSetup.days));
  state.typing = {
    running: true, idx: 0, correct: 0, wrong: 0,
    startTime: Date.now(), order: words, input: "",
    lastResult: null, finished: false, wrongList: []
  };
  typingSetup.mode = "running";
  render();
}

function submitTypingAnswer() {
  const t = state.typing;
  if (t.submitting) return;
  const w = t.order[t.idx];
  if (!w) return;
  t.submitting = true;

  const userAns = t.input;
  const isCorrect = normalize(userAns) === normalize(w.word);

  if (isCorrect) {
    t.correct++;
    t.wrongList; // no push
  } else {
    t.wrong++;
    t.wrongList.push({ ...w, userInput: userAns });
  }

  // DOM 직접 조작 — render() 없이 즉시 피드백 표시
  const input = document.getElementById("tpInput");
  const reveal = document.getElementById("tpReveal");
  const hud = document.getElementById("tpHudCorrect");
  const hudWrong = document.getElementById("tpHudWrong");
  const hudIdx = document.getElementById("tpHudIdx");

  if (input) {
    input.disabled = true;
    input.className = isCorrect ? "correct" : "wrong";
  }
  if (reveal) {
    reveal.textContent = isCorrect ? "✓ 정답" : `✗  정답: ${w.word}`;
    reveal.className = "typing-answer-reveal " + (isCorrect ? "reveal-correct" : "reveal-wrong");
  }
  if (hud) hud.textContent = t.correct;
  if (hudWrong) hudWrong.textContent = t.wrong;
  if (hudIdx) hudIdx.textContent = `${t.idx + 1} / ${t.order.length}`;

  setTimeout(() => {
    t.idx++;
    t.input = "";
    t.submitting = false;
    if (t.idx >= t.order.length) {
      finishTypingTest();
    } else {
      render();
    }
  }, isCorrect ? 500 : 1200);
}

function finishTypingTest() {
  const t = state.typing;
  t.finished = true;
  t.endTime = Date.now();
  typingSetup.mode = "result";

  const total = t.correct + t.wrong;
  const acc = total > 0 ? Math.round((t.correct / total) * 100) : 0;
  const elapsedSec = Math.round((t.endTime - t.startTime) / 1000);

  const record = {
    name: state.profile.name.trim(),
    className: state.profile.className,
    correct: t.correct,
    wrong: t.wrong,
    total: total,
    accuracy: acc,
    elapsedSec: elapsedSec,
    days: typingSetup.days.slice(),
    createdAt: Date.now(),
  };

  saveTypingRecord(record);
  render();
}

/* ============================================
   점수 저장 (Firebase or 로컬 fallback)
   ============================================ */

function saveTypingRecord(record) {
  if (firebaseReady && db) {
    db.collection("vocaclear_scores").add({
      ...record,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: record.createdAt,
    }).then(() => {
      showToast("기록이 저장되었어요");
    }).catch((e) => {
      console.warn("Firestore 저장 실패, 로컬에 저장합니다.", e);
      saveLocalRecord(record);
    });
  } else {
    saveLocalRecord(record);
  }
}

function saveLocalRecord(record) {
  try {
    const raw = localStorage.getItem(LS_KEYS.history);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(record);
    localStorage.setItem(LS_KEYS.history, JSON.stringify(arr));
    showToast("기록이 로컬에 저장되었어요 (오프라인 모드)");
  } catch (e) {
    console.error(e);
  }
}

function getLocalRecords() {
  try {
    const raw = localStorage.getItem(LS_KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

// Firestore에서 받아온 기록(remote)과 이 기기의 localStorage 기록(local)을 합치되,
// 같은 학생의 같은 응시(name+className+createdAt 동일)는 한 번만 카운트한다.
// 오프라인 중 로컬에만 저장됐다가 아직 Firestore에 동기화 안 된 기록을 놓치지 않기 위함.
function mergeRecords(remote, local) {
  const profileLocal = local.filter(r => r.name === state.profile.name && r.className === state.profile.className);
  const seen = new Set(remote.map(r => `${r.name}|${r.className}|${r.createdAt}`));
  const onlyLocal = profileLocal.filter(r => !seen.has(`${r.name}|${r.className}|${r.createdAt}`));
  return [...remote, ...onlyLocal].sort((a, b) => a.createdAt - b.createdAt);
}

/* ============================================
   반별 랭킹 (실시간)
   ============================================ */

let rankUnsub = null;

function renderRank() {
  return `
  <section>
    <div class="section-eyebrow">LIVE RANKING</div>
    <h2 class="section-title">반별 랭킹</h2>
    <p class="section-desc">타이핑 테스트 정답 수 기준 실시간 순위예요. ${firebaseReady ? '' : '<span style="color:var(--accent)">(오프라인 모드 — 이 기기 기록만 표시돼요)</span>'}</p>
    ${renderTeacherClassPicker("rk", state.rankClass)}
    <div id="rankContent" style="margin-top:18px;">${renderRankTable()}</div>
  </section>`;
}

function renderRankTable() {
  const { cls } = splitClassName(state.rankClass);
  if (!cls) {
    return `<div class="empty-state"><div class="empty-icon">—</div><p>선생님과 반을 선택하면<br/>실시간 순위가 표시돼요.</p></div>`;
  }
  if (state.rankLoading) {
    return `<div class="empty-state"><div class="empty-icon">·</div><p>불러오는 중...</p></div>`;
  }
  const data = state.rankData;
  if (!data.length) {
    return `<div class="empty-state"><div class="empty-icon">—</div><p>아직 기록이 없어요.<br/>타이핑 테스트를 풀면 여기에 순위가 표시돼요.</p></div>`;
  }
  const myName = state.profile ? state.profile.name : null;
  return `
  <table class="rank-table">
    <thead><tr><th>순위</th><th>이름</th><th>정확도</th><th style="text-align:right">정답</th></tr></thead>
    <tbody>
      ${data.map((r, i) => `
        <tr class="${myName && r.name === myName ? 'rank-row-me' : ''}">
          <td class="rank-pos ${i<3?'gold':''}">${i+1}</td>
          <td class="rank-name">${escapeHtml(r.name)}</td>
          <td>${r.accuracy}%</td>
          <td class="rank-score">${r.correct}</td>
        </tr>`).join("")}
    </tbody>
  </table>`;
}

function loadRankData(className) {
  state.rankLoading = true;
  if (rankUnsub) { rankUnsub(); rankUnsub = null; }

  if (firebaseReady && db) {
    rankUnsub = db.collection("vocaclear_scores")
      .where("className", "==", className)
      .limit(200)
      .onSnapshot((snap) => {
        const best = {};
        snap.forEach(doc => {
          const d = doc.data();
          if (!best[d.name] || d.correct > best[d.name].correct) {
            best[d.name] = d;
          }
        });
        state.rankData = Object.values(best).sort((a, b) => b.correct - a.correct).slice(0, 30);
        state.rankLoading = false;
        if (state.route === "rank") {
          const el = document.getElementById("rankContent");
          if (el) el.innerHTML = renderRankTable();
        }
      }, (err) => {
        console.warn("랭킹 로드 실패", err);
        state.rankLoading = false;
        state.rankData = [];
        if (state.route === "rank") render();
      });
  } else {
    const local = getLocalRecords().filter(r => r.className === className);
    const best = {};
    local.forEach(d => {
      if (!best[d.name] || d.correct > best[d.name].correct) best[d.name] = d;
    });
    state.rankData = Object.values(best).sort((a, b) => b.correct - a.correct);
    state.rankLoading = false;
    if (state.route === "rank") {
      const el = document.getElementById("rankContent");
      if (el) el.innerHTML = renderRankTable();
    }
  }
}

function attachRankHandlers() {
  const { cls } = splitClassName(state.rankClass);
  if (cls && (!state._rankInited || state._rankInitedClass !== state.rankClass)) {
    loadRankData(state.rankClass);
    state._rankInited = true;
    state._rankInitedClass = state.rankClass;
  }
  attachTeacherClassPicker("rk", state.rankClass, (newClassName) => {
    state.rankClass = newClassName;
    const { cls: newCls } = splitClassName(newClassName);
    if (newCls) loadRankData(newClassName);
    render();
  });
}
/* ============================================
   내 점수 기록 (개인 트래킹)
   ============================================ */

let profPickerTempClass = null;

function renderProfile() {
  if (!isProfileComplete(state.profile)) {
    return `
    <div class="login-wrap">
      <div class="section-eyebrow">MY RECORD</div>
      <h2 class="section-title">내 점수 기록</h2>
      <p class="section-desc">이름과 반을 입력하면 그동안의 타이핑 테스트 기록을 확인할 수 있어요.</p>
      <div class="card" style="padding:24px; text-align:left;">
        <span class="field-label">이름</span>
        <input type="text" id="profNameInput" class="text-input" placeholder="예: 김민준" style="margin-bottom:14px;">
        <span class="field-label">선생님 / 반</span>
        ${renderTeacherClassPicker("pf", profPickerTempClass)}
      </div>
      <button class="btn btn-primary" id="profConfirmBtn" style="margin-top:18px;">내 기록 확인하기</button>
    </div>`;
  }

  if (state.profileLoading) {
    return `<div class="empty-state"><div class="empty-icon">·</div><p>불러오는 중...</p></div>`;

  }

  const records = state.profileHistory;
  if (!records.length) {
    return `
    <div style="max-width:600px; margin:0 auto;">
      <a class="back-link" id="profSwitchBtn">${escapeHtml(state.profile.name)} (${escapeHtml(classLabel(state.profile.className))}) · 다른 학생으로 보기</a>
      <div class="empty-state">
        <div class="empty-icon">—</div>
        <p>아직 타이핑 테스트 기록이 없어요.<br/>테스트를 한 번 풀어보면 여기에 그래프가 그려져요.</p>
        <button class="btn btn-primary" data-nav="typing" style="margin-top:16px;">타이핑 테스트 하러 가기</button>
      </div>
    </div>`;
  }

  return renderProfileDashboard(records);
}

function renderProfileDashboard(records) {
  const sorted = records.slice().sort((a, b) => a.createdAt - b.createdAt);
  const accs = sorted.map(r => r.accuracy);
  const overallAvg = Math.round(accs.reduce((a,b) => a+b, 0) / accs.length);
  const last3 = accs.slice(-3);
  const last3Avg = Math.round(last3.reduce((a,b) => a+b, 0) / last3.length);

  // 추세: 최근 3개 평균 vs 그 이전 평균
  let trend = "flat";
  let trendMsg = "꾸준히 잘하고 있어요. 이 페이스를 유지해봐요! 🌿";
  if (sorted.length >= 4) {
    const prevChunk = accs.slice(0, -3);
    const prevAvg = prevChunk.length ? Math.round(prevChunk.reduce((a,b)=>a+b,0)/prevChunk.length) : last3Avg;
    if (last3Avg > prevAvg + 3) { trend = "up"; trendMsg = `최근 점수가 ${last3Avg - prevAvg}점 올랐어요! 정말 잘하고 있어요 👏`; }
    else if (last3Avg < prevAvg - 3) { trend = "down"; trendMsg = `최근 점수가 조금 떨어졌어요. 오늘 10분만 다시 복습해볼까요? 할 수 있어요 💪`; }
  } else if (sorted.length >= 2) {
    if (accs[accs.length-1] > accs[accs.length-2]) { trend = "up"; trendMsg = "지난 번보다 점수가 올랐어요! 좋은 흐름이에요 👏"; }
    else if (accs[accs.length-1] < accs[accs.length-2]) { trend = "down"; trendMsg = "지난 번보다 조금 아쉬웠어요. 다시 한 번 도전해봐요 💪"; }
  }

  const totalWords = sorted.reduce((a, r) => a + r.total, 0);
  const totalCorrect = sorted.reduce((a, r) => a + r.correct, 0);

  return `
  <div style="max-width:680px; margin:0 auto;">
    <a class="back-link" id="profSwitchBtn">← 다른 학생으로 보기</a>
    <div class="profile-card" id="profileCaptureArea">
      <div class="profile-header">
        <div>
          <div class="profile-name">${escapeHtml(state.profile.name)}</div>
          <div class="profile-class">${escapeHtml(classLabel(state.profile.className))} · 보카클리어 고교필수편</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:var(--font-mono); font-size:11px; color:var(--ink-faint);">총 응시</div>
          <div style="font-family:var(--font-display); font-size:22px; font-weight:600;">${sorted.length}회</div>
        </div>
      </div>

      <div class="encourage-banner ${trend}">
        ${trend === "up" ? "📈" : trend === "down" ? "🌱" : "🌿"} ${trendMsg}
      </div>

      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-label">전체 평균</div>
          <div class="stat-value">${overallAvg}<span style="font-size:15px;">%</span></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">최근 3회 평균</div>
          <div class="stat-value accent">${last3Avg}<span style="font-size:15px;">%</span></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">누적 정답</div>
          <div class="stat-value mint">${totalCorrect}</div>
          <div class="stat-sub">/ ${totalWords}문항</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">최고 기록</div>
          <div class="stat-value">${Math.max(...accs)}<span style="font-size:15px;">%</span></div>
        </div>
      </div>

      <div class="chart-wrap">
        <span class="field-label">정확도 추이</span>
        ${renderAccuracyChart(sorted)}
      </div>

      <div class="history-table-wrap">
        <table class="rank-table">
          <thead><tr><th>날짜</th><th>범위</th><th>정확도</th><th style="text-align:right">정답/전체</th></tr></thead>
          <tbody>
            ${sorted.slice().reverse().slice(0, 10).map(r => `
              <tr>
                <td style="font-family:var(--font-mono); font-size:12px;">${fmtDate(r.createdAt)}</td>
                <td style="font-size:12px; color:var(--ink-soft);">DAY ${formatDaysShort(r.days)}</td>
                <td>${r.accuracy}%</td>
                <td class="rank-score">${r.correct}/${r.total}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div style="display:flex; gap:10px; margin-top:18px; flex-wrap:wrap;">
      <button class="btn btn-primary" id="profExportBtn">📷 이미지로 내보내기</button>
      <button class="btn btn-ghost" data-nav="typing">테스트 한 번 더 풀기</button>
    </div>
  </div>`;
}

function formatDaysShort(days) {
  if (!days || !days.length) return "-";
  const sorted = days.slice().sort((a,b)=>a-b);
  if (sorted.length <= 3) return sorted.join(",");
  return `${sorted[0]}~${sorted[sorted.length-1]} 외 ${sorted.length}개`;
}

function renderAccuracyChart(sorted) {
  const w = 600, h = 180, pad = 28;
  const accs = sorted.map(r => r.accuracy);
  const n = accs.length;
  const xStep = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const points = accs.map((a, i) => {
    const x = pad + i * xStep;
    const y = h - pad - (a / 100) * (h - pad * 2);
    return [x, y];
  });
  const pathD = points.map((p, i) => `${i===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${points[points.length-1][0].toFixed(1)},${h-pad} L${points[0][0].toFixed(1)},${h-pad} Z`;

  const gridLines = [0,25,50,75,100].map(v => {
    const y = h - pad - (v/100)*(h-pad*2);
    return `<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="var(--rule)" stroke-width="1" />
            <text x="${pad-8}" y="${y+4}" font-size="9" fill="var(--ink-faint)" text-anchor="end" font-family="JetBrains Mono, monospace">${v}</text>`;
  }).join("");

  const dots = points.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--accent)" stroke="var(--paper-raised)" stroke-width="1.5" />`).join("");

  return `
  <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;">
    <defs>
      <linearGradient id="chartFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.18" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaD}" fill="url(#chartFade)" />
    <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}
  </svg>`;
}

function attachProfileHandlers() {
  const confirmBtn = document.getElementById("profConfirmBtn");
  if (confirmBtn) {
    attachTeacherClassPicker("pf", profPickerTempClass, (newClassName) => {
      profPickerTempClass = newClassName;
      render();
    });
    confirmBtn.addEventListener("click", () => {
      const name = document.getElementById("profNameInput").value.trim();
      if (!name) { showToast("이름을 입력해주세요"); return; }
      const { teacher, cls } = splitClassName(profPickerTempClass);
      if (!teacher) { showToast("선생님을 선택해주세요"); return; }
      if (!cls) { showToast("반을 선택해주세요"); return; }
      saveProfile({ name, className: profPickerTempClass });
      profPickerTempClass = null;
      loadProfileHistory();
      render();
    });
    return;
  }

  const switchBtn = document.getElementById("profSwitchBtn");
  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      saveProfile(null);
      profPickerTempClass = null;
      localStorage.removeItem(LS_KEYS.profile);
      state.profile = null;
      render();
    });
  }

  const exportBtn = document.getElementById("profExportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportProfileImage());
  }

  if (state.profile && state._profileLoadedFor !== (state.profile.name + state.profile.className)) {
    loadProfileHistory();
  }
}

function loadProfileHistory() {
  if (!state.profile) return;
  state.profileLoading = true;
  state._profileLoadedFor = state.profile.name + state.profile.className;

  if (firebaseReady && db) {
    db.collection("vocaclear_scores")
      .where("name", "==", state.profile.name)
      .where("className", "==", state.profile.className)
      .get()
      .then(snap => {
        const remote = snap.docs.map(d => d.data()).sort((a, b) => (a.createdAtMs || a.createdAt || 0) - (b.createdAtMs || b.createdAt || 0));
        state.profileHistory = mergeRecords(remote, getLocalRecords());
        state.profileLoading = false;
        if (state.route === "profile") render();
      })
      .catch(err => {
        console.warn("프로필 기록 로드 실패", err);
        state.profileHistory = getLocalRecords().filter(r => r.name === state.profile.name && r.className === state.profile.className);
        state.profileLoading = false;
        if (state.route === "profile") render();
      });
  } else {
    state.profileHistory = getLocalRecords().filter(r => r.name === state.profile.name && r.className === state.profile.className);
    state.profileLoading = false;
    if (state.route === "profile") render();
  }
}

function exportProfileImage() {
  const el = document.getElementById("profileCaptureArea");
  if (!el || !window.html2canvas) { showToast("이미지 내보내기를 사용할 수 없어요"); return; }
  showToast("이미지 생성 중...");
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  html2canvas(el, { backgroundColor: bg, scale: 2 }).then(canvas => {
    const link = document.createElement("a");
    link.download = `보카클리어_${state.profile.name}_기록.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }).catch(err => {
    console.error(err);
    showToast("이미지 생성에 실패했어요");
  });
}
/* ============================================
   교사 대시보드
   ============================================ */

let dashClass = "전체";
let dashUnsub = null;

function renderDash() {
  if (!isDashUnlocked()) {
    return `
    <div class="login-wrap">
      <div class="section-eyebrow">TEACHER ONLY</div>
      <h2 class="section-title">교사 대시보드</h2>
      <p class="section-desc">선생님만 볼 수 있는 페이지예요. 비밀번호를 입력해주세요.</p>
      <div class="card" style="padding:24px;">
        <input type="password" id="dashPwInput" class="text-input" placeholder="비밀번호" autocomplete="off">
        <p id="dashPwError" style="color:var(--accent); font-size:12.5px; margin:10px 0 0; display:none;">비밀번호가 올바르지 않아요.</p>
      </div>
      <button class="btn btn-primary" id="dashUnlockBtn" style="margin-top:16px;">입장하기</button>
    </div>`;
  }

  const classOptions = ["전체", ...ALL_CLASSES];
  return `
  <section>
    <div class="section-eyebrow">TEACHER DASHBOARD</div>
    <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px;">
      <h2 class="section-title">교사 대시보드</h2>
      <a class="back-link" id="dashLockBtn" style="margin-bottom:6px;">🔒 잠그기</a>
    </div>
    <p class="section-desc">학생별 최근 기록과 추세를 한눈에 확인할 수 있어요. ${firebaseReady ? '' : '<span style="color:var(--accent)">(오프라인 모드 — 이 기기 기록만 표시돼요)</span>'}</p>
    <div class="dash-toolbar">
      <div class="rank-class-select" style="margin-bottom:0;" id="dashClassSelect">
        ${classOptions.map(c => `<button class="rank-chip ${dashClass===c?'selected':''}" data-dcls="${escapeHtml(c)}">${c === '전체' ? '전체' : classLabel(c)}</button>`).join("")}
      </div>
      <button class="btn btn-ghost btn-sm" id="dashRefreshBtn">↻ 새로고침</button>
    </div>
    <div id="dashContent">${renderDashTable()}</div>
  </section>`;
}

function isDashUnlocked() {
  try { return sessionStorage.getItem("vc_dash_unlocked") === "1"; }
  catch (e) { return false; }
}

function renderDashTable() {
  if (state.dashLoading) {
    return `<div class="empty-state"><div class="empty-icon">·</div><p>불러오는 중...</p></div>`;
  }
  const students = buildStudentSummaries(state.dashData);
  if (!students.length) {
    return `<div class="empty-state"><div class="empty-icon">—</div><p>아직 기록이 없어요.</p></div>`;
  }
  return `
  <div class="dash-table-wrap">
    <table class="dash-table">
      <thead>
        <tr>
          <th>이름</th><th>선생님</th><th>반</th><th>응시</th><th>전체 평균</th><th>최근 3회</th><th>추세</th><th>추이</th><th>최근</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${students.map(s => {
          const { teacher, cls } = splitClassName(s.className);
          const key = encodeURIComponent(s.name + "||" + s.className);
          return `
          <tr>
            <td style="font-weight:600;">${escapeHtml(s.name)}</td>
            <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(teacher)}</td>
            <td style="font-family:var(--font-mono); font-size:11.5px; color:var(--ink-soft);">${escapeHtml(cls)}</td>
            <td>${s.count}회</td>
            <td>${s.overallAvg}%</td>
            <td>${s.last3Avg}%</td>
            <td class="trend-${s.trend}">${s.trend === 'up' ? '▲ 상승' : s.trend === 'down' ? '▼ 하락' : '— 유지'}</td>
            <td class="mini-bar-cell">
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${s.last3Avg}%; background:${s.trend==='down' ? 'var(--accent)' : s.trend==='up' ? 'var(--mint)' : 'var(--gold)'}"></div></div>
            </td>
            <td style="font-family:var(--font-mono); font-size:11px; color:var(--ink-faint);">${fmtDate(s.lastDate)}</td>
            <td>
              <button class="btn-dash-delete" data-key="${key}" data-name="${escapeHtml(s.name)}" title="${escapeHtml(s.name)} 기록 삭제">✕</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>`;
}

function buildStudentSummaries(records) {
  const byStudent = {};
  records.forEach(r => {
    const key = r.name + "||" + r.className;
    if (!byStudent[key]) byStudent[key] = [];
    byStudent[key].push(r);
  });

  const summaries = Object.values(byStudent).map(list => {
    const sorted = list.slice().sort((a,b) => a.createdAt - b.createdAt);
    const accs = sorted.map(r => r.accuracy);
    const overallAvg = Math.round(accs.reduce((a,b)=>a+b,0)/accs.length);
    const last3 = accs.slice(-3);
    const last3Avg = Math.round(last3.reduce((a,b)=>a+b,0)/last3.length);
    let trend = "flat";
    if (sorted.length >= 4) {
      const prevChunk = accs.slice(0, -3);
      const prevAvg = prevChunk.length ? Math.round(prevChunk.reduce((a,b)=>a+b,0)/prevChunk.length) : last3Avg;
      if (last3Avg > prevAvg + 3) trend = "up";
      else if (last3Avg < prevAvg - 3) trend = "down";
    } else if (sorted.length >= 2) {
      if (accs[accs.length-1] > accs[accs.length-2]) trend = "up";
      else if (accs[accs.length-1] < accs[accs.length-2]) trend = "down";
    }
    return {
      name: sorted[0].name,
      className: sorted[0].className,
      count: sorted.length,
      overallAvg, last3Avg, trend,
      lastDate: sorted[sorted.length-1].createdAt,
    };
  });

  return summaries.sort((a, b) => b.lastDate - a.lastDate);
}

function loadDashData(cls) {
  state.dashLoading = true;
  if (dashUnsub) { dashUnsub(); dashUnsub = null; }

  if (firebaseReady && db) {
    let ref = db.collection("vocaclear_scores");
    if (cls !== "전체") ref = ref.where("className", "==", cls);
    dashUnsub = ref.limit(500).onSnapshot(snap => {
      const data = snap.docs.map(d => d.data());
      state.dashData = data.sort((a, b) => (b.createdAtMs || b.createdAt || 0) - (a.createdAtMs || a.createdAt || 0));
      state.dashLoading = false;
      if (state.route === "dash") {
        const el = document.getElementById("dashContent");
        if (el) el.innerHTML = renderDashTable();
      }
    }, err => {
      console.warn("대시보드 로드 실패", err);
      state.dashData = [];
      state.dashLoading = false;
      if (state.route === "dash") render();
    });
  } else {
    let local = getLocalRecords();
    if (cls !== "전체") local = local.filter(r => r.className === cls);
    state.dashData = local;
    state.dashLoading = false;
    if (state.route === "dash") {
      const el = document.getElementById("dashContent");
      if (el) el.innerHTML = renderDashTable();
    }
  }
}

function attachDashHandlers() {
  if (!isDashUnlocked()) {
    const unlockBtn = document.getElementById("dashUnlockBtn");
    const pwInput = document.getElementById("dashPwInput");
    const tryUnlock = () => {
      const val = pwInput ? pwInput.value : "";
      if (val === TEACHER_DASH_PASSWORD) {
        try { sessionStorage.setItem("vc_dash_unlocked", "1"); } catch (e) {}
        render();
      } else {
        const err = document.getElementById("dashPwError");
        if (err) err.style.display = "block";
      }
    };
    if (unlockBtn) unlockBtn.addEventListener("click", tryUnlock);
    if (pwInput) {
      pwInput.focus();
      pwInput.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
    }
    return;
  }

  const lockBtn = document.getElementById("dashLockBtn");
  if (lockBtn) lockBtn.addEventListener("click", () => {
    try { sessionStorage.removeItem("vc_dash_unlocked"); } catch (e) {}
    render();
  });

  if (!state._dashInited || state._dashInitedClass !== dashClass) {
    loadDashData(dashClass);
    state._dashInited = true;
    state._dashInitedClass = dashClass;
  }
  document.querySelectorAll("[data-dcls]").forEach(el => {
    el.addEventListener("click", () => {
      dashClass = el.getAttribute("data-dcls");
      loadDashData(dashClass);
      render();
    });
  });
  const refreshBtn = document.getElementById("dashRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadDashData(dashClass));

  document.querySelectorAll(".btn-dash-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = decodeURIComponent(btn.getAttribute("data-key"));
      const name = btn.getAttribute("data-name");
      const [studentName, className] = key.split("||");
      const { teacher, cls } = splitClassName(className);
      const confirmed = window.confirm(`'${name}' (${teacher} · ${cls}) 학생의 기록을 전부 삭제할까요?\n\n이 작업은 되돌릴 수 없어요.`);
      if (confirmed) deleteStudentRecords(studentName, className);
    });
  });
}

function deleteStudentRecords(name, className) {
  showToast("삭제 중...");

  if (firebaseReady && db) {
    db.collection("vocaclear_scores")
      .where("name", "==", name)
      .where("className", "==", className)
      .get()
      .then(snap => {
        if (snap.empty) {
          showToast("삭제할 기록이 없어요.");
          return;
        }
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        return batch.commit();
      })
      .then(() => {
        deleteLocalRecords(name, className);
        showToast(`'${name}' 학생 기록을 삭제했어요.`);
        state._dashInited = false;
        loadDashData(dashClass);
      })
      .catch(err => {
        console.error("삭제 실패", err);
        showToast("삭제에 실패했어요. 다시 시도해주세요.");
      });
  } else {
    deleteLocalRecords(name, className);
    state._dashInited = false;
    loadDashData(dashClass);
    showToast(`'${name}' 학생 기록을 삭제했어요. (로컬)`);
  }
}

function deleteLocalRecords(name, className) {
  try {
    const all = getLocalRecords();
    const filtered = all.filter(r => !(r.name === name && r.className === className));
    localStorage.setItem(LS_KEYS.history, JSON.stringify(filtered));
    if (state.profile && state.profile.name === name && state.profile.className === className) {
      state.profileHistory = [];
      state._profileLoadedFor = null;
    }
  } catch (e) { console.error(e); }
}

/* ============================================
   초기 부트스트랩
   ============================================ */

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  render();
});
