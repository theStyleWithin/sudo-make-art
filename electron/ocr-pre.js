'use strict';
// Loaded with --require in the reader process (and its worker thread) so tesseract.js takes its plain Node path
// instead of its Electron path, which expects a browser window.
try { Object.defineProperty(process.versions, 'electron', { value: undefined, configurable: true }); } catch (e) {}
