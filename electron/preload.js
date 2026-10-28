'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The only native capabilities exposed to the page: WebM -> MP4 conversion, and the local AI engine bridge.
const on = (channel, cb) => { const h = (e, d) => cb(d); ipcRenderer.on(channel, h); return () => ipcRenderer.removeListener(channel, h); };
contextBridge.exposeInMainWorld('sma', {
  toMp4: arrayBuffer => ipcRenderer.invoke('video:to-mp4', arrayBuffer),
  ai: {
    hardware: () => ipcRenderer.invoke('ai:hardware'),
    settings: () => ipcRenderer.invoke('ai:settings'),
    models: () => ipcRenderer.invoke('ai:models'),
    openModels: () => ipcRenderer.invoke('ai:open-models'),
    chooseEngine: kind => ipcRenderer.invoke('ai:choose-engine', kind),
    clearEngine: kind => ipcRenderer.invoke('ai:clear-engine', kind),
    plan: params => ipcRenderer.invoke('ai:plan', params),
    generate: params => ipcRenderer.invoke('ai:generate', params),
    cancel: id => ipcRenderer.invoke('ai:cancel', id),
    onStarted: cb => on('ai:started', cb),
    onProgress: cb => on('ai:progress', cb),
  },
});
