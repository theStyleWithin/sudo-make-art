'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The only native capabilities exposed to the page: fast video export, projects, and the local AI engine bridge.
const on = (channel, cb) => { const h = (e, d) => cb(d); ipcRenderer.on(channel, h); return () => ipcRenderer.removeListener(channel, h); };
contextBridge.exposeInMainWorld('sma', {
  exportVideo: {
    start: p => ipcRenderer.invoke('vexport:start', p),
    frame: (id, jpeg) => ipcRenderer.invoke('vexport:frame', id, jpeg),
    finish: id => ipcRenderer.invoke('vexport:finish', id),
    cancel: id => ipcRenderer.invoke('vexport:cancel', id),
    srcChunk: (id, key, offset, data) => ipcRenderer.invoke('vexport:src-chunk', id, key, offset, data),
    extract: (id, p) => ipcRenderer.invoke('vexport:extract', id, p),
    readFrame: (id, clipKey, k) => ipcRenderer.invoke('vexport:read-frame', id, clipKey, k),
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    get: id => ipcRenderer.invoke('projects:get', id),
    put: rec => ipcRenderer.invoke('projects:put', rec),
    del: id => ipcRenderer.invoke('projects:del', id),
    folder: () => ipcRenderer.invoke('projects:folder'),
  },
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
