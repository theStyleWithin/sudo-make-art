'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pin', { image: () => ipcRenderer.invoke('pinpoint:image'), done: dataUrl => ipcRenderer.send('pinpoint:done', dataUrl) });
