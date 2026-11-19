'use strict';
// The reader process: runs tesseract.js (Apache-2.0) with the bundled English data. Talks to electron/ocr.js over IPC.
const { createWorker } = require('tesseract.js');
let worker = null;
async function get(langPath) { if (!worker) worker = await createWorker('eng', 1, { langPath, cacheMethod: 'none', gzip: true, logger: () => {} }); return worker; }
process.on('message', async m => {
  if (!m || typeof m.id !== 'number') return;
  try { const w = await get(m.langPath), r = await w.recognize(Buffer.from(m.png, 'base64')); process.send({ id: m.id, text: r.data.text, confidence: r.data.confidence }); }
  catch (e) { process.send({ id: m.id, error: String(e && e.message || e) }); }
});
process.on('disconnect', () => process.exit(0));
