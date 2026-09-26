'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deeply', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: json => ipcRenderer.invoke('data:save', json),
  pickBackground: () => ipcRenderer.invoke('bg:pick'),
  clearBackground: () => ipcRenderer.invoke('bg:clear'),
  setChrome: colors => ipcRenderer.send('chrome:colors', colors),
  setWindowSettings: s => ipcRenderer.send('win:settings', s),
  setMaterial: m => ipcRenderer.send('win:material', m),
  quit: () => ipcRenderer.send('win:quit'),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  trayState: s => ipcRenderer.send('tray:state', s),
  showMini: pos => ipcRenderer.send('mini:show', pos),
  miniState: s => ipcRenderer.send('mini:state', s),
  miniResize: h => ipcRenderer.send('mini:resize', h),
  miniCmd: (cmd, arg) => ipcRenderer.send('mini:cmd', cmd, arg),
  showCat: () => ipcRenderer.send('cat:show'),
  setDnd: on => ipcRenderer.invoke('dnd:set', on),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: on => ipcRenderer.invoke('autostart:set', on),
  musicInit: () => ipcRenderer.send('music:init'),
  musicRun: (fn, ...args) => ipcRenderer.send('music:run', fn, args),
  env: name => process.env[name] || '',
  on: (channel, fn) => {
    const allowed = ['cmd', 'state', 'power', 'mini:moved', 'app:close-request', 'music'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, ...args) => fn(...args));
  }
});
