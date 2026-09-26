'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, powerMonitor, dialog, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

// ───────────── paths ─────────────
// Data stays where the previous (C#) Deeply kept it, so tasks / stats / garden carry over.
const DATA_DIR = process.env.DEEPLY_DATA_DIR || path.join(app.getPath('appData'), 'Deeply');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
// Chromium's own cache goes to a sub-folder, away from data.json
app.setPath('userData', path.join(DATA_DIR, 'electron'));
app.setAppUserModelId('com.deeply.app');

// assets are unpacked next to app.asar so Windows (toasts, tray) can read them directly
const ASSETS = path.join(__dirname, '..', 'assets').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const ICON = path.join(ASSETS, process.platform === 'win32' ? 'app.ico' : 'icon.png');
const startHidden = process.argv.includes('--autostart');

let mainWin = null, miniWin = null, tray = null;
let quitting = false;
let trayRunning = false;
let minimizeToTray = false;

// ───────────── single instance ─────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());
}

function showMain() {
  if (!mainWin) return;
  if (miniWin && miniWin.isVisible()) miniWin.hide();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

// ───────────── storage ─────────────
function readJson(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return JSON.parse(text);
}

ipcMain.handle('data:load', () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const d = readJson(DATA_FILE);
      try { fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak'); } catch { }
      return d;
    }
  } catch {
    try { fs.copyFileSync(DATA_FILE, DATA_FILE + '.broken'); } catch { }
    try { if (fs.existsSync(DATA_FILE + '.bak')) return readJson(DATA_FILE + '.bak'); } catch { }
  }
  return null;
});

ipcMain.handle('data:save', (_e, json) => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    return true;
  } catch { return false; }
});

// ───────────── background picture ─────────────
ipcMain.handle('bg:pick', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Картинка для фона',
    properties: ['openFile'],
    filters: [{ name: 'Картинки', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const src = r.filePaths[0];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const f of fs.readdirSync(DATA_DIR)) if (/^background\./i.test(f)) try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch { }
  const dest = path.join(DATA_DIR, 'background' + path.extname(src).toLowerCase());
  fs.copyFileSync(src, dest);
  return dest;
});

ipcMain.handle('bg:clear', () => {
  try { for (const f of fs.readdirSync(DATA_DIR)) if (/^background\./i.test(f)) fs.unlinkSync(path.join(DATA_DIR, f)); } catch { }
  return true;
});

// ───────────── window chrome ─────────────
ipcMain.on('chrome:colors', (_e, { color, symbol }) => {
  try { mainWin?.setTitleBarOverlay({ color, symbolColor: symbol, height: 40 }); } catch { }
  try { mainWin?.setBackgroundColor(color); } catch { }
});

ipcMain.on('win:settings', (_e, s) => {
  minimizeToTray = !!s.minimizeToTray;
  mainWin?.setAlwaysOnTop(!!s.alwaysOnTop);
});

ipcMain.on('win:material', (_e, m) => { try { mainWin?.setBackgroundMaterial(m === 'acrylic' ? 'acrylic' : 'none'); } catch { } });
ipcMain.on('win:quit', () => { quitting = true; app.quit(); });

// ───────────── notifications ─────────────
ipcMain.on('notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(ASSETS, 'icon.png'), silent: true });
  n.on('click', showMain);
  n.show();
  if (mainWin && !mainWin.isFocused()) mainWin.flashFrame(true);
});

// ───────────── tray ─────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Показать окно', click: showMain },
    { label: trayRunning ? 'Пауза' : 'Старт', click: () => mainWin?.webContents.send('cmd', 'toggle') },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } }
  ]);
}

ipcMain.on('tray:state', (_e, { running, tooltip }) => {
  if (!tray) return;
  if (running !== trayRunning) { trayRunning = running; tray.setContextMenu(buildTrayMenu()); }
  tray.setToolTip(tooltip || 'Deeply');
});

// ───────────── mini widget ─────────────
function createMini(pos) {
  miniWin = new BrowserWindow({
    width: 390, height: 86, frame: false, resizable: false, maximizable: false, minimizable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false }
  });
  miniWin.setAlwaysOnTop(true, 'floating');
  miniWin.loadFile(path.join(__dirname, 'mini.html'));
  const wa = screen.getPrimaryDisplay().workArea;
  let x = pos?.x, y = pos?.y;
  const onScreen = Number.isFinite(x) && screen.getAllDisplays().some(d =>
    x < d.workArea.x + d.workArea.width && x + 390 > d.workArea.x && y < d.workArea.y + d.workArea.height && y + 86 > d.workArea.y);
  if (!onScreen) { x = wa.x + wa.width - 390 - 16; y = wa.y + wa.height - 136 - 16; }
  miniWin.setPosition(Math.round(x), Math.round(y));
  miniWin.on('moved', () => {
    const [mx, my] = miniWin.getPosition();
    mainWin?.webContents.send('mini:moved', { x: mx, y: my });
  });
  miniWin.on('closed', () => { miniWin = null; mainWin?.webContents.send('cmd', 'mini-closed'); });
}

ipcMain.on('mini:show', (_e, pos) => {
  if (!miniWin) createMini(pos);
  miniWin.once('ready-to-show', () => miniWin.showInactive());
  if (miniWin.webContents.isLoading() === false) miniWin.showInactive();
  mainWin?.hide();
});
ipcMain.on('mini:state', (_e, state) => miniWin?.webContents.send('state', state));
ipcMain.on('mini:resize', (_e, h) => {
  if (!miniWin) return;
  const [x, y] = miniWin.getPosition(); const [, oldH] = miniWin.getSize();
  miniWin.setBounds({ x, y: y + oldH - h, width: 390, height: h });
});
ipcMain.on('mini:cmd', (_e, cmd, arg) => {
  if (cmd === 'expand') { miniWin?.close(); showMain(); return; }
  if (cmd === 'hide') { miniWin?.close(); return; }
  mainWin?.webContents.send('cmd', cmd, arg);
});

// ───────────── music ─────────────
// The official YouTube IFrame player needs a real web origin, so the player page is loaded as a data: URL
// with an https base URL (same trick as the WebView2 virtual host of the old version) in a hidden window.
const PLAYER_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}</style></head>
<body><div id="p"></div><script>
let player = null, want = false, vol = 40;
const post = o => window.bridge.post(o);
function onYouTubeIframeAPIReady() { post({ type: 'api' }); }
function report() {
  if (!player || !player.getPlayerState) return;
  let title = '';
  try { const d = player.getVideoData(); title = (d && d.title) || ''; } catch (e) {}
  post({ type: 'state', state: player.getPlayerState(), title });
}
function load(videoId, listId, volume, autoplay) {
  want = autoplay; vol = volume;
  if (player) { try { player.destroy(); } catch (e) {} player = null; document.body.querySelector('#p') || document.body.insertAdjacentHTML('afterbegin', '<div id="p"></div>'); }
  const vars = { autoplay: autoplay ? 1 : 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0, loop: 1 };
  if (listId) { vars.listType = 'playlist'; vars.list = listId; } else vars.playlist = videoId;
  const opts = { width: 480, height: 300, playerVars: vars, events: {
    onReady: e => { e.target.setVolume(vol); if (want) e.target.playVideo(); report(); },
    onStateChange: () => report(),
    onError: e => post({ type: 'error', code: e.data }) } };
  if (videoId) opts.videoId = videoId;
  player = new YT.Player('p', opts);
}
function play()  { want = true;  if (player && player.playVideo) player.playVideo(); }
function pause() { want = false; if (player && player.pauseVideo) player.pauseVideo(); }
function setVol(v) { vol = v; if (player && player.setVolume) { player.setVolume(v); if (v > 0 && player.isMuted()) player.unMute(); } }
function stopAll() { want = false; if (player && player.stopVideo) player.stopVideo(); }
</script><script src="https://www.youtube.com/iframe_api" onerror="window.bridge.post({type:'offline'})"></script></body></html>`;
let musicWin = null;
const MUSIC_FNS = new Set(['load', 'play', 'pause', 'setVol', 'stopAll']);
ipcMain.on('music:init', () => {
  if (musicWin) return;
  musicWin = new BrowserWindow({
    show: false, width: 480, height: 300, skipTaskbar: true, focusable: false,
    webPreferences: { preload: path.join(__dirname, 'music-preload.js'), sandbox: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  musicWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  musicWin.on('closed', () => { musicWin = null; });
  musicWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PLAYER_HTML), { baseURLForDataURL: 'https://deeply.app/' })
    .catch(() => mainWin?.webContents.send('music', { type: 'offline' }));
});
ipcMain.on('music:event', (_e, ev) => {
  if (ev && ev.type === 'offline') { musicWin?.destroy(); }
  mainWin?.webContents.send('music', ev);
});
ipcMain.on('music:run', (_e, fn, args) => {
  if (!musicWin || !MUSIC_FNS.has(fn)) return;
  const js = `${fn}(${(args || []).map(a => JSON.stringify(a === undefined ? null : a)).join(',')})`;
  musicWin.webContents.executeJavaScript(js).catch(() => { });
});

// ───────────── cat popup ─────────────
ipcMain.on('cat:show', () => {
  const b = mainWin && mainWin.isVisible() && !mainWin.isMinimized() ? mainWin.getBounds() : screen.getPrimaryDisplay().workArea;
  const w = 320, h = 336;
  const cat = new BrowserWindow({
    width: w, height: h, x: Math.round(b.x + (b.width - w) / 2), y: Math.round(b.y + (b.height - h) / 2 - 20),
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, show: false, hasShadow: false, backgroundColor: '#00000000'
  });
  cat.setIgnoreMouseEvents(false);
  cat.loadFile(path.join(__dirname, 'cat.html'));
  cat.once('ready-to-show', () => cat.showInactive());
  setTimeout(() => { if (!cat.isDestroyed()) cat.close(); }, 3200);
});

// ───────────── "Do not disturb" ─────────────
// Windows 11 has no public API for it; the reliable way is to flip the notification-center toggle
// (AutomationId "DoNotDisturbButton") through UI Automation — the same thing the user would click.
const DND_SCRIPT = String.raw`
param([string]$want)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -Name K -Namespace D -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra); [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);'
$A = [System.Windows.Automation.AutomationElement]
$prev = [D.K]::GetForegroundWindow()
Start-Process "ms-actioncenter:"
$btn = $null; $sw = [Diagnostics.Stopwatch]::StartNew()
$idCond = New-Object System.Windows.Automation.PropertyCondition ($A::AutomationIdProperty), "DoNotDisturbButton"
while (-not $btn -and $sw.ElapsedMilliseconds -lt 4000) {
  Start-Sleep -Milliseconds 50
  try {
    $f = $A::FocusedElement
    if ($f.Current.AutomationId -eq 'DoNotDisturbButton') { $btn = $f; break }
    if ((Get-Process -Id $f.Current.ProcessId).ProcessName -eq 'ShellExperienceHost') {
      $w = $f; $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
      while ($true) { $p = $walker.GetParent($w); if (-not $p -or $p -eq $A::RootElement) { break }; $w = $p }
      $btn = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $idCond)
    }
  } catch {}
}
$result = 'fail'
if ($btn) {
  $tp = $btn.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
  $on = $tp.Current.ToggleState -eq 'On'
  if (($want -eq 'on') -eq $on) { $result = 'already' } else { $tp.Toggle(); $result = 'flipped' }
}
Start-Sleep -Milliseconds 150
[D.K]::keybd_event(0x1B, 0, 0, [UIntPtr]::Zero); [D.K]::keybd_event(0x1B, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 120
if ($prev -ne [IntPtr]::Zero) { [void][D.K]::SetForegroundWindow($prev) }
Write-Output $result
`;
let dndQueue = Promise.resolve();
function runDnd(want) {
  const file = path.join(os.tmpdir(), 'deeply-dnd.ps1');
  try { fs.writeFileSync(file, DND_SCRIPT, 'utf8'); } catch { }
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file, want],
      { windowsHide: true, timeout: 15000 }, (err, stdout) => resolve(err ? 'fail' : String(stdout).trim().split(/\s+/).pop() || 'fail'));
  });
}
ipcMain.handle('dnd:set', (_e, want) => {
  const job = dndQueue.then(() => runDnd(want ? 'on' : 'off'));
  dndQueue = job.catch(() => { });
  return job;
});

// ───────────── autostart ─────────────
function loginArgs() { return app.isPackaged ? ['--autostart'] : [path.resolve(__dirname, '..'), '--autostart']; }
ipcMain.handle('autostart:get', () => app.getLoginItemSettings({ args: loginArgs() }).openAtLogin);
ipcMain.handle('autostart:set', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on, args: loginArgs() });
  return app.getLoginItemSettings({ args: loginArgs() }).openAtLogin;
});

// ───────────── main window ─────────────
function createMain() {
  mainWin = new BrowserWindow({
    width: 1120, height: 780, minWidth: 920, minHeight: 660, show: false,
    title: 'Deeply', icon: ICON, backgroundColor: '#0B2019',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0B2019', symbolColor: '#E9FFF7', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false, backgroundThrottling: false }
  });
  mainWin.loadFile(path.join(__dirname, 'index.html'));
  mainWin.once('ready-to-show', () => { if (startHidden) { if (!minimizeToTray) mainWin.minimize(); } else mainWin.show(); });
  mainWin.on('minimize', () => { if (minimizeToTray) mainWin.hide(); });
  mainWin.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    mainWin.webContents.send('app:close-request');   // renderer confirms if a focus session is running
  });
  mainWin.on('closed', () => { mainWin = null; });
}

app.whenReady().then(() => {
  // YouTube refuses embeds without a web referrer; the page itself is a local file
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'] },
    (details, cb) => { details.requestHeaders['Referer'] = 'https://deeply.app/'; cb({ requestHeaders: details.requestHeaders }); });

  createMain();
  tray = new Tray(nativeImage.createFromPath(ICON));
  tray.setToolTip('Deeply');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showMain);

  powerMonitor.on('suspend', () => mainWin?.webContents.send('power', 'suspend'));
  powerMonitor.on('lock-screen', () => mainWin?.webContents.send('power', 'lock'));
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());
