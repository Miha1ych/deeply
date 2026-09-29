'use strict';
// Preload for the hidden YouTube player window: events go to the main process
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bridge', { post: o => ipcRenderer.send('music:event', o) });
