'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The only native capability exposed to the page: convert a recorded WebM to MP4 locally.
contextBridge.exposeInMainWorld('sma', {
  toMp4: arrayBuffer => ipcRenderer.invoke('video:to-mp4', arrayBuffer),
});
