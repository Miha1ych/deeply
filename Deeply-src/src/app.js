'use strict';
/* Deeply — renderer: tasks, timer, stats, garden, music, settings. */

const api = window.deeply;
const $ = id => document.getElementById(id);
const PHASES = ['focus', 'short', 'long'];
const PHASE_NAME = { focus: 'Фокус', short: 'Короткий перерыв', long: 'Длинный перерыв' };
const RING_C = 2 * Math.PI * 96;

// ───────────────────────────── helpers ─────────────────────────────
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
function minutesText(m) { return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function uuid() { return crypto.randomUUID(); }
function fmtTime(secs) { return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`; }

// Dates are stored like .NET writes them ("2026-09-25T03:44:08.3623708+05:00") so both versions share data.json
function parseDate(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(/(\.\d{3})\d+/, '$1'));
  return isNaN(d) ? null : d;
}
function isoLocal(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function fileUrl(p) { return 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F') + '?v=' + Date.now(); }
function dayKey(d) { return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : ''; }

// ───────────────────────────── data ─────────────────────────────
const DEFAULT_SETTINGS = {
  FocusMinutes: 25, ShortBreakMinutes: 5, LongBreakMinutes: 15, LongBreakEvery: 4,
  AutoStartBreaks: true, AutoStartFocus: false, Sound: true, AlwaysOnTop: false, MinimizeToTray: false,
  BlockNotifications: true, DndChanged: 0, ShowCat: true, MusicUrl: '', MusicEnabled: true, MusicInBreaks: false,
  MusicVolume: 40, TaskTab: 0, BackgroundFile: '', ThemeId: 'emerald', MiniX: null, MiniY: null
};
let data;

function normalize(d) {
  d = d && typeof d === 'object' ? d : {};
  d.Tasks = Array.isArray(d.Tasks) ? d.Tasks : [];
  d.Sessions = Array.isArray(d.Sessions) ? d.Sessions : [];
  d.Settings = Object.assign({}, DEFAULT_SETTINGS, d.Settings || {});
  d.Garden = Object.assign({ Minutes: 0, Eaten: 0 }, d.Garden || {});
  for (const t of d.Tasks) {
    t.Id = t.Id || uuid();
    t.Title = String(t.Title || '');
    t.Estimate = Math.max(1, t.Estimate | 0 || 1);
    t.Done = t.Done | 0;
    t.Completed = !!t.Completed;
    t.Created = t.Created || isoLocal();
    t.CompletedAt = t.CompletedAt || null;
    t.Scope = t.Scope | 0;
  }
  return d;
}
function save() { api.saveData(JSON.stringify(data, null, 2)); }

// ───────────────────────────── state ─────────────────────────────
let phase = 'focus', running = false;
let endAt = 0, remaining = 0, total = 0;    // ms
let lastTick = 0, cycleCount = 0, phaseSerial = 0, todayPomos = 0;
let currentTaskId = null, gardenMode = false, statsDay = dayKey(new Date());
let ticker = null;
let theme = themeById('emerald');
let garden;

const S = () => data.Settings;
const currentTask = () => currentTaskId ? data.Tasks.find(t => t.Id === currentTaskId) || null : null;
const phaseMinutes = p => p === 'focus' ? S().FocusMinutes : p === 'short' ? S().ShortBreakMinutes : S().LongBreakMinutes;

// ───────────────────────────── theme ─────────────────────────────
function applyTheme(id) {
  theme = themeById(id);
  const r = document.documentElement.style;
  const set = (k, v) => r.setProperty(k, v);
  set('--page-top', theme.pageTop); set('--page-mid', theme.pageMid); set('--page-end', theme.pageEnd);
  set('--mid-stop', theme.midStop + '%');
  set('--glows', theme.glows.map(([x, y, rad, c]) => `radial-gradient(circle at ${x}% ${y}%, ${c}, transparent ${rad}%)`).join(', '));
  set('--accent', theme.accent); set('--accent2', theme.accent2); set('--ink', theme.ink);
  set('--border', theme.border); set('--surface', theme.surface); set('--surface-hover', theme.surfaceHover);
  set('--selected', theme.selected); set('--text', theme.text); set('--muted', theme.muted); set('--tint', theme.tint);
  set('--tile2', theme.tile2 || theme.surface);
  set('--panel-alpha', theme.light ? '.9' : '.62');
  if (theme.light) document.documentElement.setAttribute('data-light', ''); else document.documentElement.removeAttribute('data-light');
  document.documentElement.dataset.theme = theme.id;
  LiquidGlass.setEnabled(theme.id === 'glass');
  api.setMaterial(theme.id === 'glass' ? 'acrylic' : 'none');   // Стекло: the Windows desktop shows through
  applyBackground();
  applyPhaseColors();
  api.setChrome({ color: '#00000000', symbol: theme.light ? '#FFF7EE' : theme.text });
  if (garden) garden.setTheme(theme);
  pushMini();
}

function applyBackground() {
  const img = document.querySelector('.bg-img'), wash = document.querySelector('.bg-wash');
  const own = S().BackgroundFile;
  let url = null;
  if (own) url = fileUrl(own);
  else if (theme.backdrop === 'rug') url = '../assets/rug.jpg';
  if (url) {
    const probe = new Image();
    probe.onload = () => { img.style.backgroundImage = `url("${url}")`; img.classList.add('on'); wash.classList.toggle('on', !!own); };
    probe.onerror = () => { img.classList.remove('on'); wash.classList.remove('on'); };
    probe.src = url;
  } else { img.classList.remove('on'); wash.classList.remove('on'); }
}

function applyPhaseColors() {
  const [a, b] = phaseColors(theme, phase);
  document.documentElement.style.setProperty('--ph-a', a);
  document.documentElement.style.setProperty('--ph-b', b);
  document.querySelectorAll('#phaseSeg button').forEach(btn => btn.classList.toggle('active', btn.dataset.phase === phase));
  moveThumb($('phaseSeg'));
}

function moveThumb(seg) {
  const active = seg.querySelector('button.active'), thumb = seg.querySelector('.seg-thumb');
  if (!active || !seg.offsetWidth) return;
  thumb.style.left = active.offsetLeft + 'px';
  thumb.style.width = active.offsetWidth + 'px';
}

// ───────────────────────────── tasks ─────────────────────────────
const est = { value: 1 };
function setEstimate(v) { est.value = Math.max(1, Math.min(50, v)); $('estimate').querySelector('span').textContent = est.value; }

function addTask() {
  const input = $('taskInput');
  const title = input.value.trim();
  if (!title) return;
  const t = { Id: uuid(), Title: title, Estimate: est.value, Done: 0, Completed: false, Created: isoLocal(), CompletedAt: null, Scope: S().TaskTab };
  data.Tasks.push(t);
  if (!currentTaskId) currentTaskId = t.Id;
  input.value = '';
  setEstimate(1);
  save();
  renderList();
}

function toggleCompleted(t) {
  t.Completed = !t.Completed;
  t.CompletedAt = t.Completed ? isoLocal() : null;
  if (t.Completed && currentTaskId === t.Id) currentTaskId = null;
  save();
  renderList();
  updateStats();
}

async function deleteTask(t) {
  if (!await confirmDialog('Удаление', `Удалить задачу «${esc(t.Title)}»?`, 'Удалить')) return;
  data.Tasks = data.Tasks.filter(x => x !== t);
  if (currentTaskId === t.Id) currentTaskId = null;
  save(); renderList(); updateStats();
}

async function clearCompleted() {
  const n = data.Tasks.filter(t => t.Completed).length;
  if (!n) return;
  if (!await confirmDialog('Удаление', `Удалить выполненные задачи (${n})? Статистика арбузов сохранится.`, 'Удалить')) return;
  data.Tasks = data.Tasks.filter(t => !t.Completed);
  save(); renderList(); updateStats();
}

async function editTask(t) {
  const r = await modal({
    title: 'Задача', ok: 'Сохранить',
    body: `<input class="text-input" id="edTitle" maxlength="200" value="${esc(t.Title)}">
      <div class="row" style="margin-top:8px"><span>Оценка, арбузов</span>${numInput('edEst', t.Estimate)}</div>`,
    onOpen: root => { const i = root.querySelector('#edTitle'); i.focus(); i.select(); wireNums(root, { edEst: [1, 50] }); },
    collect: root => ({ title: root.querySelector('#edTitle').value.trim(), est: +root.querySelector('#edEst').value })
  });
  if (!r || !r.title) return;
  t.Title = r.title;
  t.Estimate = Math.max(1, Math.min(50, r.est | 0 || 1));
  save(); renderList();
}

function moveTask(t) { t.Scope = t.Scope === 0 ? 1 : 0; save(); renderList(); }

function renderList() {
  const scope = S().TaskTab;
  const showDone = $('showDone').checked;
  const items = data.Tasks.filter(t => t.Scope === scope && (!t.Completed || showDone))
    .sort((a, b) => (parseDate(a.Created) || 0) - (parseDate(b.Created) || 0));
  const cur = currentTask();
  if (currentTaskId && (!cur || cur.Completed)) currentTaskId = null;

  const ul = $('taskList');
  const existing = new Map([...ul.children].map(li => [li.dataset.id, li]));
  const keep = new Set();
  let prev = null;
  for (const t of items) {
    let li = existing.get(t.Id);
    if (!li) {
      li = document.createElement('li');
      li.className = 'task';
      li.dataset.id = t.Id;
      li.innerHTML = `<button class="check" title="Выполнено">${icon('check', 14)}</button><span class="title"></span><span class="count"></span>`;
    }
    keep.add(t.Id);
    li.classList.toggle('done', t.Completed);
    li.classList.toggle('current', t.Id === currentTaskId);
    li.querySelector('.title').textContent = t.Title;
    li.querySelector('.title').title = t.Title;
    const cnt = li.querySelector('.count');
    const sig = `${t.Done}/${t.Estimate}/${t.Completed}`;
    if (cnt.dataset.sig !== sig) {
      cnt.dataset.sig = sig;
      cnt.innerHTML = `${watermelonSvg(16, t.Completed)}<span>${t.Done}/${t.Estimate}</span>`;
      cnt.classList.toggle('full', t.Done >= t.Estimate && !t.Completed);
    }
    const want = prev ? prev.nextSibling : ul.firstChild;
    if (want !== li) ul.insertBefore(li, want);
    prev = li;
  }
  for (const [id, li] of existing) if (!keep.has(id)) li.remove();

  let empty = ul.querySelector('.empty');
  if (!items.length) {
    if (!empty) { empty = document.createElement('li'); empty.className = 'empty'; ul.appendChild(empty); }
    empty.innerHTML = `${watermelonSvg(40, true)}<br>${scope === 0 ? 'Список на сегодня пуст' : 'Список на неделю пуст'}`;
  } else if (empty) empty.remove();

  const open = data.Tasks.filter(t => t.Scope === scope && !t.Completed);
  const left = open.reduce((s, t) => s + Math.max(0, t.Estimate - t.Done), 0);
  $('summary').textContent = open.length === 0
    ? (scope === 0 ? 'На сегодня задач нет — добавьте первую' : 'На неделю задач нет — добавьте первую')
    : `${open.length} ${plural(open.length, 'задача', 'задачи', 'задач')} · осталось ≈ ${minutesText(left * S().FocusMinutes)}`;

  const day = data.Tasks.filter(t => t.Scope === 0 && !t.Completed).length;
  const week = data.Tasks.filter(t => t.Scope === 1 && !t.Completed).length;
  document.querySelectorAll('#scopeSeg button').forEach(b => {
    const s = +b.dataset.scope;
    b.classList.toggle('active', s === scope);
    b.querySelector('.count').textContent = (s === 0 ? day : week) || '';
  });
  moveThumb($('scopeSeg'));
  $('taskInput').placeholder = scope === 0 ? 'Задача на сегодня…' : 'Задача на неделю…';
  updateTaskLabel();
}

function setScope(s) {
  if (S().TaskTab === s) return;
  S().TaskTab = s;
  save();
  renderList();
}

function updateTaskLabel() {
  const t = currentTask();
  const l = $('taskLabel');
  l.textContent = t ? t.Title : 'Выберите задачу слева — или просто начните';
  l.classList.toggle('has', !!t);
  pushMini();
}

// ───────────────────────────── context menu ─────────────────────────────
function openMenu(t, x, y) {
  const m = $('menu');
  m.innerHTML = '';
  const add = (ico, text, fn, opts = {}) => {
    const b = document.createElement('button');
    b.innerHTML = `${icon(ico, 16)}<span>${text}</span>`;
    if (opts.danger) b.className = 'danger';
    if (opts.disabled) b.disabled = true;
    b.onclick = () => { closeMenu(); fn(); };
    m.appendChild(b);
  };
  add('target', 'Фокусироваться на задаче', () => {
    currentTaskId = t.Id; renderList();
    if (phase !== 'focus') setPhase('focus', false);
    if (!running) startTimer();
  }, { disabled: t.Completed });
  add('edit', 'Изменить…', () => editTask(t));
  add('check', t.Completed ? 'Вернуть в работу' : 'Отметить выполненной', () => toggleCompleted(t));
  add('move', t.Scope === 0 ? 'Перенести в «Неделю»' : 'Перенести в «Сегодня»', () => moveTask(t));
  m.appendChild(document.createElement('hr'));
  add('trash', 'Удалить', () => deleteTask(t), { danger: true });
  m.classList.add('open');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function closeMenu() { $('menu').classList.remove('open'); }

// ───────────────────────────── modals ─────────────────────────────
let modalOpen = 0;
function modal({ title, body, ok = 'OK', cancel = 'Отмена', onOpen, collect, wide }) {
  return new Promise(resolve => {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal" ${wide ? 'style="width:min(640px,calc(100vw - 48px))"' : ''}>
      <header><h3>${title}</h3><button class="close" title="Закрыть">${icon('close', 18)}</button></header>
      <div class="body">${body}</div>
      <footer>${cancel ? `<button class="btn" data-r="cancel">${cancel}</button>` : ''}<button class="btn primary" data-r="ok" style="--ph-a:var(--accent);--ph-b:var(--accent2)">${ok}</button></footer></div>`;
    $('modalRoot').appendChild(bd);
    modalOpen++;
    let done = false;
    const close = result => {
      if (done) return;
      done = true;
      modalOpen--;
      document.removeEventListener('keydown', onKey, true);
      bd.classList.add('closing');
      setTimeout(() => bd.remove(), 180);
      resolve(result);
    };
    const okNow = () => close(collect ? collect(bd) : true);
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); e.stopPropagation(); okNow(); }
    };
    document.addEventListener('keydown', onKey, true);
    bd.querySelector('.close').onclick = () => close(null);
    bd.querySelector('[data-r="ok"]').onclick = okNow;
    const c = bd.querySelector('[data-r="cancel"]'); if (c) c.onclick = () => close(null);
    bd.addEventListener('mousedown', e => { if (e.target === bd) close(null); });
    bd.close = close;
    if (onOpen) onOpen(bd, close);
    else bd.querySelector('[data-r="ok"]').focus();
  });
}
const confirmDialog = (title, text, ok = 'Да') => modal({ title, body: `<div class="confirm-text">${text}</div>`, ok, cancel: 'Отмена' }).then(r => !!r);

function numInput(id, v) {
  return `<div class="num"><button type="button" data-num="${id}" data-d="-1">−</button><input id="${id}" value="${v}" inputmode="numeric"><button type="button" data-num="${id}" data-d="1">+</button></div>`;
}
function wireNums(root, ranges) {
  root.querySelectorAll('[data-num]').forEach(b => b.onclick = () => {
    const inp = root.querySelector('#' + b.dataset.num), [lo, hi] = ranges[b.dataset.num];
    inp.value = Math.max(lo, Math.min(hi, (parseInt(inp.value) || lo) + +b.dataset.d));
  });
  for (const [id, [lo, hi]] of Object.entries(ranges)) {
    const inp = root.querySelector('#' + id);
    inp.addEventListener('change', () => { inp.value = Math.max(lo, Math.min(hi, parseInt(inp.value) || lo)); });
    inp.addEventListener('wheel', e => { e.preventDefault(); inp.value = Math.max(lo, Math.min(hi, (parseInt(inp.value) || lo) + (e.deltaY < 0 ? 1 : -1))); }, { passive: false });
  }
}

// ───────────────────────────── timer ─────────────────────────────
function setPhase(p, autoStart) {
  phase = p;
  phaseSerial++;
  running = false;
  musicOverride = null;
  stopTicker();
  total = phaseMinutes(p) * 60000;
  remaining = total;
  applyPhaseColors();
  if (autoStart) startTimer(); else updateTimerUI();
}

function startTimer() {
  if (remaining <= 0) remaining = total;
  endAt = Date.now() + remaining;
  lastTick = Date.now();
  running = true;
  musicOverride = null;
  stopTicker();
  ticker = setInterval(onTick, 200);
  updateTimerUI();
}

function pauseTimer() {
  if (!running) return;
  remaining = Math.max(0, endAt - Date.now());
  running = false;
  musicOverride = null;
  stopTicker();
  updateTimerUI();
}

function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }
function toggleTimer() { running ? pauseTimer() : startTimer(); }

function onTick() {
  const now = Date.now();
  // a long gap between ticks means the PC slept: freeze the timer where it was
  if (now - lastTick > 60000) {
    remaining = Math.min(total, Math.max(0, endAt - lastTick));
    running = false;
    stopTicker();
    updateTimerUI();
    return;
  }
  lastTick = now;
  remaining = endAt - now;
  if (remaining <= 0) { remaining = 0; phaseFinished(false); return; }
  updateTimerUI();
}

async function confirmInterrupt() {
  if (phase !== 'focus' || remaining >= total || total - remaining < 60000) return true;
  const serial = phaseSerial;
  const yes = await confirmDialog('Фокус', 'Прервать текущий арбуз? Он не будет засчитан.', 'Прервать');
  // the timer keeps running behind the dialog: if the phase ended meanwhile, the answer is stale
  return yes && serial === phaseSerial;
}

async function switchPhaseByUser(p) {
  if (p === phase && !running) return;
  if (await confirmInterrupt()) setPhase(p, false);
}

function phaseFinished(skipped) {
  stopTicker();
  running = false;
  updateDnd();   // lift "Do not disturb" before our own notification
  const s = S();
  if (phase === 'focus') {
    let next = 'short';
    if (!skipped) {
      const t = currentTask();
      const mins = Math.round(total / 60000);
      data.Sessions.push({ End: isoLocal(), Minutes: mins, TaskId: t ? t.Id : null });
      if (t) t.Done++;
      const wasRipe = data.Garden.Minutes >= GARDEN_TARGET;
      data.Garden.Minutes += mins;
      const justRipened = !wasRipe && data.Garden.Minutes >= GARDEN_TARGET;
      syncGarden();
      cycleCount++;
      if (cycleCount >= s.LongBreakEvery) { next = 'long'; cycleCount = 0; }
      save(); renderList(); updateStats();
      notify('Арбуз завершён! 🍉',
        (t ? `«${t.Title}» — ${t.Done}/${t.Estimate}. Время отдохнуть.` : 'Отличная работа. Время отдохнуть.')
        + (justRipened ? ' На грядке созрел арбуз — загляни!' : ''));
    }
    setPhase(next, !skipped && s.AutoStartBreaks);
  } else {
    if (!skipped) {
      notify('Перерыв окончен', 'Пора возвращаться к работе!');
      if (s.ShowCat) api.showCat();
    }
    setPhase('focus', !skipped && s.AutoStartFocus);
  }
}

let lastRingSig = '';
function updateTimerUI() {
  updateDnd();
  updateMusic();
  const secs = Math.ceil(Math.max(0, remaining) / 1000);
  const time = fmtTime(secs);
  const frac = total > 0 ? remaining / total : 0;
  const every = S().LongBreakEvery;
  const dots = phase === 'long' ? every : cycleCount;
  const sig = `${time}|${Math.round(frac * 1440)}|${phase}|${todayPomos}|${dots}/${every}|${running}`;
  if (sig !== lastRingSig) {
    lastRingSig = sig;
    $('ringTime').textContent = time;
    $('ringProgress').style.strokeDashoffset = (RING_C * (1 - frac)).toFixed(2);
    $('ringCaption').textContent = PHASE_NAME[phase];
    $('ringSub').textContent = `сегодня: ${todayPomos} ${plural(todayPomos, 'арбуз', 'арбуза', 'арбузов')}`;
    const dotsEl = $('ringDots');
    if (dotsEl.children.length !== every) dotsEl.innerHTML = '<i></i>'.repeat(every);
    [...dotsEl.children].forEach((d, i) => d.classList.toggle('on', i < dots));
    const startText = running ? 'Пауза' : (remaining < total ? 'Продолжить' : 'Старт');
    const btn = $('btnStart');
    if (btn.dataset.text !== startText) { btn.dataset.text = startText; btn.innerHTML = `${icon(running ? 'pause' : 'play', 18)}<span>${startText}</span>`; }
    $('timerView').classList.toggle('running', running);
    const partial = running || remaining < total;
    $('titleStatus').textContent = partial ? `· ${time} · ${PHASE_NAME[phase]}` : '';
    document.title = partial ? `${time} · ${PHASE_NAME[phase]}` : 'Deeply';
    api.trayState({ running, tooltip: running ? `${time} — ${PHASE_NAME[phase]}` : 'Deeply' });
  }
  pushMini();
}

// ───────────────────────────── stats ─────────────────────────────
const DAY_NAMES = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function updateStats() {
  const today = new Date();
  statsDay = dayKey(today);
  const byDay = new Map();
  for (const s of data.Sessions) {
    const k = dayKey(parseDate(s.End));
    byDay.set(k, (byDay.get(k) || 0) + (s.Minutes | 0));
  }
  const todaySessions = data.Sessions.filter(s => dayKey(parseDate(s.End)) === statsDay);
  todayPomos = todaySessions.length;
  const todayMinutes = todaySessions.reduce((a, s) => a + (s.Minutes | 0), 0);
  const todayTasks = data.Tasks.filter(t => t.Completed && dayKey(parseDate(t.CompletedAt)) === statsDay).length;
  $('statPomos').textContent = todayPomos;
  $('statPomosLabel').textContent = `${plural(todayPomos, 'арбуз', 'арбуза', 'арбузов')} сегодня`;
  $('statMinutes').textContent = minutesText(todayMinutes);
  $('statTasks').textContent = todayTasks;
  $('statTasksLabel').textContent = `${plural(todayTasks, 'задача выполнена', 'задачи выполнено', 'задач выполнено')}`;

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    week.push({ v: byDay.get(dayKey(d)) || 0, label: i === 0 ? 'Сегодня' : DAY_NAMES[d.getDay()], today: i === 0 });
  }
  const max = Math.max(30, ...week.map(w => w.v));
  const bars = $('bars');
  if (bars.children.length !== 7) bars.innerHTML = '<div class="bar-col"><div class="bar-track"><div class="bar-val"></div><div class="bar"></div></div><div class="bar-day"></div></div>'.repeat(7);
  week.forEach((w, i) => {
    const col = bars.children[i];
    col.querySelector('.bar-val').textContent = w.v || '';
    const bar = col.querySelector('.bar');
    bar.style.height = (w.v / max * 82).toFixed(1) + '%';
    bar.classList.toggle('has', w.v > 0);
    bar.classList.toggle('today', w.today);
    const day = col.querySelector('.bar-day');
    day.textContent = w.label;
    day.classList.toggle('today', w.today);
  });
  lastRingSig = '';
  updateTimerUI();
}

// ───────────────────────────── notifications & sound ─────────────────────────────
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const t0 = audioCtx.currentTime + 0.02;
    [[784, 0], [988, 0.18], [1319, 0.36]].forEach(([f, dt]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + dt);
      g.gain.linearRampToValueAtTime(0.22, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.9);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 1);
    });
  } catch { }
}
function notify(title, body) {
  if (S().Sound) chime();
  whenNotificationsAllowed(() => api.notify(title, body));
}

// ───────────────────────────── Windows "Do not disturb" ─────────────────────────────
// Desired vs applied state; one async loop reconciles them so quick start/pause is applied in order.
let dndWanted = false, dndActive = false, dndBusy = false, dndFlipped = false;
const afterDnd = [];
function updateDnd() {
  dndWanted = S().BlockNotifications && running && phase === 'focus';
  if (dndWanted !== dndActive) reconcileDnd();
}
async function reconcileDnd() {
  if (dndBusy) return;
  dndBusy = true;
  try {
    while (dndWanted !== dndActive) {
      if (dndWanted) {
        const r = await api.setDnd(true);
        dndFlipped = r === 'flipped';     // "already" = the user had it on: leave it on afterwards
        dndActive = true;
      } else {
        if (dndFlipped) await api.setDnd(false);
        dndFlipped = false;
        dndActive = false;
      }
      S().DndChanged = dndFlipped ? 2 : 0;
      save();
    }
  } finally { dndBusy = false; }
  if (!dndActive) afterDnd.splice(0).forEach(f => f());
}
function whenNotificationsAllowed(f) { if (!dndActive && !dndBusy) f(); else afterDnd.push(f); }

// ───────────────────────────── music (YouTube player in a hidden window, see main.js) ─────────────────────────────
const music = {
  video: null, list: null, started: false, ready: false,
  playing: false, title: '', error: null, want: false, volume: 40,
  get configured() { return !!(this.video || this.list); },

  parse(url) {
    let video = null, list = null;
    url = (url || '').trim();
    if (!url) return null;
    let m = url.match(/[?&]list=([A-Za-z0-9_-]+)/); if (m) list = m[1];
    m = url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
    if (m) video = m[1]; else if (/^[A-Za-z0-9_-]{11}$/.test(url)) video = url;
    return video || list ? { video, list } : null;
  },

  setSource(url) {
    const p = this.parse(url) || { video: null, list: null };
    if (p.video === this.video && p.list === this.list) return;
    this.video = p.video; this.list = p.list;
    this.title = ''; this.error = null; this.playing = false;
    onMusicState();
    if (!this.configured) { if (this.ready) api.musicRun('stopAll'); return; }
    this.start();
    if (this.ready) this.load();
  },

  start() { if (!this.started) { this.started = true; api.musicInit(); } },
  load() { api.musicRun('load', this.video, this.list, this.volume, this.want); },

  onEvent(e) {
    if (e.type === 'api') { this.ready = true; if (this.configured) this.load(); return; }
    if (e.type === 'state') {
      this.playing = e.state === 1 || e.state === 3;
      if (e.title) this.title = e.title;
      this.error = null;
      if (e.state === 5 && this.want) api.musicRun('play');   // keep the state we asked for
    } else if (e.type === 'error') {
      const c = e.code;
      this.error = { 2: 'Неверная ссылка', 5: 'Видео нельзя воспроизвести', 100: 'Видео не найдено или удалено', 101: `Автор запретил встраивание — выберите другое видео (${c})`, 150: `Автор запретил встраивание — выберите другое видео (${c})`, 153: 'YouTube отклонил плеер (ошибка 153)' }[c] || `Ошибка YouTube ${c}`;
      this.playing = false;
    } else if (e.type === 'offline') {
      this.error = 'Нет связи с YouTube'; this.started = false; this.ready = false;
    }
    onMusicState();
  },

  setPlaying(on) {
    this.want = on;
    if (!this.configured) return;
    this.start();
    if (this.ready) api.musicRun(on ? 'play' : 'pause');
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(100, v | 0));
    if (this.ready) api.musicRun('setVol', this.volume);
  }
};

let musicOverride = null, musicApplied = false, musicSaveTimer = null, lastVolume = 40;
function updateMusic() {
  if (!music.configured) { musicApplied = false; return; }
  const s = S();
  const auto = s.MusicEnabled && running && (phase === 'focus' || s.MusicInBreaks);
  const want = musicOverride ?? auto;
  if (want === musicApplied) return;
  musicApplied = want;
  music.setPlaying(want);
}
function toggleMusicManually() { musicOverride = !musicApplied; updateMusic(); }
function setMusicVolume(v) {
  music.setVolume(v);
  if (music.volume > 0) lastVolume = music.volume;
  S().MusicVolume = music.volume;
  onMusicState();
  clearTimeout(musicSaveTimer);
  musicSaveTimer = setTimeout(save, 600);
}
function onMusicState() {
  const bar = $('musicBar');
  bar.classList.toggle('hidden', !music.configured);
  const tgl = $('musicToggle');
  const ico = music.playing ? 'pause' : 'play';
  if (tgl.dataset.ico !== ico) { tgl.dataset.ico = ico; tgl.innerHTML = icon(ico, 16); }
  tgl.title = music.playing ? 'Пауза музыки' : 'Включить музыку';
  const title = $('musicTitle');
  title.textContent = music.error || music.title || 'Музыка для фокуса';
  title.title = title.textContent;
  title.classList.toggle('error', !!music.error);
  title.classList.toggle('muted', !music.error && !music.title);
  const vol = $('volSlider');
  if (+vol.value !== music.volume) vol.value = music.volume;
  vol.style.setProperty('--val', music.volume + '%');
  const vi = music.volume === 0 ? 'mute' : 'volume';
  const volIcon = $('volIcon');
  if (volIcon.dataset.ico !== vi) { volIcon.dataset.ico = vi; volIcon.innerHTML = icon(vi, 18); }
  pushMini();
}

// ───────────────────────────── garden ─────────────────────────────
function toggleGarden() {
  gardenMode = !gardenMode;
  $('mainCol').classList.toggle('garden', gardenMode);
  $('timerView').classList.toggle('active', !gardenMode);
  $('gardenView').classList.toggle('active', gardenMode);
  $('btnGarden').title = gardenMode ? 'Назад к таймеру' : 'Грядка с арбузом';
  renderGardenButton();
  garden.setVisible(gardenMode);
  if (!gardenMode) requestAnimationFrame(() => moveThumb($('phaseSeg')));
}
function renderGardenButton() {
  const b = $('btnGarden');
  b.innerHTML = (gardenMode ? icon('stopwatch', 20) : watermelonSvg(22)) + '<span class="badge"></span>';
  b.classList.toggle('ripe', data.Garden.Minutes >= GARDEN_TARGET);
}
function syncGarden() {
  garden.set(data.Garden.Minutes, data.Garden.Eaten);
  renderGardenButton();
}
function onCatFinished() {
  data.Garden.Minutes = Math.max(0, data.Garden.Minutes - GARDEN_TARGET);
  data.Garden.Eaten++;
  save();
  syncGarden();
}

// ───────────────────────────── mini widget ─────────────────────────────
let miniOpen = false;
function showMini() {
  miniOpen = true;
  api.showMini({ x: S().MiniX, y: S().MiniY });
  setTimeout(pushMini, 300);
}
function pushMini() {
  if (!miniOpen || !data) return;
  const secs = Math.ceil(Math.max(0, remaining) / 1000);
  const [a, b] = phaseColors(theme, phase);
  api.miniState({
    time: fmtTime(secs), elapsed: total > 0 ? 1 - remaining / total : 0, phase: PHASE_NAME[phase],
    task: currentTask()?.Title || '', running, colors: [a, b],
    music: { configured: music.configured, playing: music.playing, title: music.error || music.title || 'Музыка', volume: music.volume },
    theme: { accent: theme.accent, accent2: theme.accent2, text: theme.light ? '#2E2520' : theme.text, muted: theme.muted, tint: theme.tint, light: !!theme.light, border: theme.border }
  });
}

async function onCommand(cmd, arg) {
  switch (cmd) {
    case 'toggle': toggleTimer(); break;
    case 'skip': if (await confirmInterrupt()) phaseFinished(true); break;
    case 'reset': if (await confirmInterrupt()) setPhase(phase, false); break;
    case 'music': toggleMusicManually(); break;
    case 'volume': setMusicVolume(+arg); break;
    case 'mini-ready': pushMini(); break;
    case 'mini-closed': miniOpen = false; break;
  }
}

// ───────────────────────────── settings ─────────────────────────────
async function openSettings() {
  const s = S();
  const autostart = await api.getAutostart().catch(() => false);
  const origTheme = s.ThemeId;
  let pickedTheme = s.ThemeId;
  const sw = (id, text, on, hint = '') =>
    `<label class="row"><span>${text}${hint ? `<div class="hint">${hint}</div>` : ''}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></span></label>`;
  const themeCards = THEMES.map(t => `<button class="theme-card ${t.id === s.ThemeId ? 'sel' : ''}" data-theme="${t.id}">
      <span class="sw" style="display:block;background:${t.backdrop === 'rug' ? `url(../assets/rug.jpg) center/cover` : `linear-gradient(145deg, ${t.pageTop}, ${t.pageEnd})`}"><i style="background:linear-gradient(90deg, ${t.accent}, ${t.accent2})"></i></span>
      <span class="name">${t.name}</span></button>`).join('');
  const body = `
    <div class="section-title">Оформление</div>
    <div class="themes-grid">${themeCards}</div>
    <div class="row"><span>Фон</span><div class="bg-row"><div class="bg-preview" id="bgPreview"></div>
      <button class="btn" id="bgLoad" style="height:36px">${icon('image', 16)}Загрузить…</button><button class="btn" id="bgClear" style="height:36px">Убрать</button></div></div>
    <div class="section-title">Таймер</div>
    <div class="row"><span>Фокус, минут</span>${numInput('nFocus', s.FocusMinutes)}</div>
    <div class="row"><span>Короткий перерыв, минут</span>${numInput('nShort', s.ShortBreakMinutes)}</div>
    <div class="row"><span>Длинный перерыв, минут</span>${numInput('nLong', s.LongBreakMinutes)}</div>
    <div class="row"><span>Длинный перерыв после, арбузов</span>${numInput('nEvery', s.LongBreakEvery)}</div>
    ${sw('cAutoB', 'Автоматически начинать перерывы', s.AutoStartBreaks)}
    ${sw('cAutoF', 'Автоматически начинать фокус после перерыва', s.AutoStartFocus)}
    <div class="section-title">Поведение</div>
    ${sw('cSound', 'Звуковой сигнал', s.Sound)}
    ${sw('cDnd', 'Отключать уведомления Windows во время фокуса', s.BlockNotifications, 'Режим «Не беспокоить» включается на время арбуза')}
    ${sw('cCat', 'Кот «ВРЕМЯ РАБОТАТЬ!», когда заканчивается перерыв', s.ShowCat)}
    ${sw('cTop', 'Поверх всех окон', s.AlwaysOnTop)}
    ${sw('cTray', 'Сворачивать в трей', s.MinimizeToTray)}
    ${sw('cAutoRun', 'Запускать вместе с Windows (свёрнутым)', autostart)}
    <div class="section-title">Музыка</div>
    <input class="text-input" id="musicUrl" placeholder="Ссылка на видео или плейлист YouTube" value="${esc(s.MusicUrl || '')}">
    <div class="field-hint" id="musicHint"></div>
    ${sw('cMusic', 'Включать музыку, когда начинается фокус', s.MusicEnabled)}
    ${sw('cMusicBreaks', 'Не выключать музыку на перерывах', s.MusicInBreaks)}`;

  const r = await modal({
    title: 'Настройки', ok: 'Сохранить', wide: true, body,
    onOpen: root => {
      wireNums(root, { nFocus: [1, 180], nShort: [1, 60], nLong: [1, 90], nEvery: [2, 12] });
      root.querySelectorAll('.theme-card').forEach(c => c.onclick = () => {
        root.querySelectorAll('.theme-card').forEach(x => x.classList.toggle('sel', x === c));
        pickedTheme = c.dataset.theme;
        applyTheme(pickedTheme);           // live preview; reverted on cancel
      });
      const preview = () => {
        const p = root.querySelector('#bgPreview');
        const f = S().BackgroundFile;
        p.style.backgroundImage = f ? `url("${fileUrl(f)}")` : '';
        p.innerHTML = f ? '' : '<span style="font-size:11px">тема</span>';
      };
      preview();
      root.querySelector('#bgLoad').onclick = async () => {
        const f = await api.pickBackground();
        if (!f) return;
        S().BackgroundFile = f; save(); applyBackground(); preview();
      };
      root.querySelector('#bgClear').onclick = async () => {
        await api.clearBackground();
        S().BackgroundFile = ''; save(); applyBackground(); preview();
      };
      const url = root.querySelector('#musicUrl'), hint = root.querySelector('#musicHint');
      const upd = () => {
        const v = url.value.trim();
        const p = music.parse(v);
        hint.className = 'field-hint' + (!v ? '' : p ? ' ok' : ' bad');
        hint.textContent = !v ? 'Пусто — без музыки' : !p ? 'Не похоже на ссылку YouTube' : p.list ? 'Плейлист ✓' : 'Видео ✓ (будет играть по кругу)';
      };
      url.addEventListener('input', upd); upd();
      root.querySelector('[data-r="ok"]').focus();
    },
    collect: root => {
      const v = id => root.querySelector('#' + id);
      return {
        FocusMinutes: +v('nFocus').value, ShortBreakMinutes: +v('nShort').value, LongBreakMinutes: +v('nLong').value, LongBreakEvery: +v('nEvery').value,
        AutoStartBreaks: v('cAutoB').checked, AutoStartFocus: v('cAutoF').checked, Sound: v('cSound').checked,
        BlockNotifications: v('cDnd').checked, ShowCat: v('cCat').checked, AlwaysOnTop: v('cTop').checked, MinimizeToTray: v('cTray').checked,
        MusicUrl: v('musicUrl').value.trim(), MusicEnabled: v('cMusic').checked, MusicInBreaks: v('cMusicBreaks').checked,
        autorun: v('cAutoRun').checked
      };
    }
  });
  if (!r) { if (pickedTheme !== origTheme) applyTheme(origTheme); return; }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x | 0 || lo));
  r.FocusMinutes = clamp(r.FocusMinutes, 1, 180); r.ShortBreakMinutes = clamp(r.ShortBreakMinutes, 1, 60);
  r.LongBreakMinutes = clamp(r.LongBreakMinutes, 1, 90); r.LongBreakEvery = clamp(r.LongBreakEvery, 2, 12);
  const { autorun } = r; delete r.autorun;
  Object.assign(s, r, { ThemeId: pickedTheme });
  if (autorun !== autostart) api.setAutostart(autorun);
  save();
  applyTheme(s.ThemeId);
  applyWindowSettings();
  music.setSource(s.MusicUrl);
  musicApplied = false;
  if (!running && remaining >= total) setPhase(phase, false);
  renderList();
  updateStats();
}

function applyWindowSettings() { api.setWindowSettings({ minimizeToTray: S().MinimizeToTray, alwaysOnTop: S().AlwaysOnTop }); }

// ───────────────────────────── wiring ─────────────────────────────
function wire() {
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, el.classList.contains('round') ? 22 : 20); });

  $('addForm').addEventListener('submit', e => { e.preventDefault(); addTask(); });
  $('estimate').addEventListener('click', e => { const d = e.target.dataset.d; if (d) setEstimate(est.value + +d); });
  $('estimate').addEventListener('wheel', e => { e.preventDefault(); setEstimate(est.value + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  $('showDone').addEventListener('change', renderList);
  $('clearDone').addEventListener('click', clearCompleted);
  $('scopeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setScope(+b.dataset.scope); });

  const list = $('taskList');
  const taskOf = el => { const li = el.closest('.task'); return li && data.Tasks.find(t => t.Id === li.dataset.id); };
  list.addEventListener('click', e => {
    const t = taskOf(e.target); if (!t) return;
    if (e.target.closest('.check')) {
      const li = e.target.closest('.task');
      if (!t.Completed && !$('showDone').checked) { li.classList.add('done'); setTimeout(() => { li.classList.add('leaving'); setTimeout(() => toggleCompleted(t), 220); }, 250); }
      else toggleCompleted(t);
      return;
    }
    if (t.Completed) return;
    currentTaskId = currentTaskId === t.Id ? null : t.Id;
    renderList();
  });
  list.addEventListener('dblclick', e => { const t = taskOf(e.target); if (t && !e.target.closest('.check')) editTask(t); });
  list.addEventListener('contextmenu', e => { const t = taskOf(e.target); if (!t) return; e.preventDefault(); openMenu(t, e.clientX, e.clientY); });
  document.addEventListener('mousedown', e => { if (!e.target.closest('#menu')) closeMenu(); });
  window.addEventListener('blur', closeMenu);

  $('phaseSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) switchPhaseByUser(b.dataset.phase); });
  $('btnStart').addEventListener('click', toggleTimer);
  $('btnReset').addEventListener('click', async () => { if (await confirmInterrupt()) setPhase(phase, false); });
  $('btnSkip').addEventListener('click', async () => { if (await confirmInterrupt()) phaseFinished(true); });
  $('btnGarden').addEventListener('click', toggleGarden);
  $('btnMini').addEventListener('click', showMini);
  $('btnSettings').addEventListener('click', openSettings);

  $('musicToggle').addEventListener('click', toggleMusicManually);
  $('volSlider').addEventListener('input', e => setMusicVolume(+e.target.value));
  $('volIcon').addEventListener('click', () => setMusicVolume(music.volume > 0 ? 0 : lastVolume || 40));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
    if (e.code === 'Space' && !modalOpen && !(e.target instanceof HTMLInputElement) && !e.repeat) {
      e.preventDefault();
      toggleTimer();
    }
  });
  new ResizeObserver(() => { moveThumb($('phaseSeg')); moveThumb($('scopeSeg')); }).observe(document.body);

  api.on('cmd', onCommand);
  api.on('music', e => music.onEvent(e));
  api.on('mini:moved', p => { S().MiniX = p.x; S().MiniY = p.y; save(); });
  api.on('power', () => { if (running) pauseTimer(); });
  api.on('app:close-request', async () => {
    if (running && phase === 'focus' && !await confirmDialog('Deeply', 'Идёт арбуз. Выйти и прервать его?', 'Выйти')) return;
    await shutdown();
  });

  // midnight rollover for the stats
  setInterval(() => { if (dayKey(new Date()) !== statsDay) updateStats(); }, 60000);
}

async function shutdown() {
  stopTicker();
  running = false;
  if (dndActive && dndFlipped) { try { await api.setDnd(false); } catch { } }
  S().DndChanged = 0;
  save();
  api.quit();
}

// ───────────────────────────── start ─────────────────────────────
(async function init() {
  data = normalize(await api.loadData());
  if (api.env('DEEPLY_THEME')) S().ThemeId = api.env('DEEPLY_THEME');
  garden = new Garden($('gardenCanvas'), { stage: $('gardenStage'), sub: $('gardenSub'), eaten: $('gardenEaten'), fill: $('gardenFill'), min: $('gardenMin') });
  garden.onCatFinished = onCatFinished;
  wire();
  applyTheme(S().ThemeId);
  applyWindowSettings();
  if (S().DndChanged) {   // the app was closed while it had silenced notifications: give them back
    api.setDnd(false);
    S().DndChanged = 0;
    save();
  }
  music.volume = S().MusicVolume | 0;
  lastVolume = music.volume || 40;
  renderList();
  syncGarden();
  setPhase('focus', false);
  updateStats();
  music.setSource(S().MusicUrl);
  onMusicState();
  requestAnimationFrame(() => { moveThumb($('phaseSeg')); moveThumb($('scopeSeg')); document.body.classList.add('ready'); });
  $('taskInput').focus();
  diagnostics();
})();

// Test hooks (environment variables), same as the old version
async function diagnostics() {
  const gm = parseInt(api.env('DEEPLY_GARDEN_MINUTES'));
  if (!isNaN(gm)) { data.Garden.Minutes = gm; syncGarden(); }
  if (api.env('DEEPLY_GARDEN_OPEN') === '1') toggleGarden();
  if (api.env('DEEPLY_OPEN_SETTINGS') === '1') openSettings();
  if (api.env('DEEPLY_GARDEN_DEMO') === '1') {
    if (!gardenMode) toggleGarden();
    data.Garden.Minutes = 0; syncGarden();
    await new Promise(r => setTimeout(r, 1500));
    for (let m = 1; m <= GARDEN_TARGET; m++) { data.Garden.Minutes = m; syncGarden(); await new Promise(r => setTimeout(r, 120)); }
  }
  if (api.env('DEEPLY_MINI') === '1') showMini();
  if (api.env('DEEPLY_RUN') === '1') startTimer();
  if (api.env('DEEPLY_MUSIC_PLAY') === '1') setTimeout(toggleMusicManually, 2500);
  if (api.env('DEEPLY_CAT_TEST') === '1') { setPhase('short', false); startTimer(); endAt = Date.now() + 1000; }
}
