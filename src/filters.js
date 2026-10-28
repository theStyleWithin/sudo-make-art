// Photo filters shared by design images (SVG filters) and video clips (canvas filters).
(() => {
'use strict';
const DEFAULTS = { brightness: 1, contrast: 1, saturate: 1, hue: 0, blur: 0, gray: 0, sepia: 0, invert: 0 };
const PRESETS = {
  'None': {},
  'Black & white': { gray: 1, contrast: 1.1 },
  'Noir': { gray: 1, contrast: 1.5, brightness: 0.9 },
  'Vintage': { sepia: 0.6, contrast: 0.9, saturate: 0.85, brightness: 1.05 },
  'Warm': { sepia: 0.25, saturate: 1.2, hue: -8, brightness: 1.03 },
  'Cool': { hue: 12, saturate: 1.1, brightness: 1.0, contrast: 1.05 },
  'Vivid': { saturate: 1.6, contrast: 1.15 },
  'Faded': { contrast: 0.8, saturate: 0.8, brightness: 1.12 },
  'Dream': { blur: 1.5, brightness: 1.1, saturate: 1.2 },
};
const full = fl => ({ ...DEFAULTS, ...(fl || {}) });
const isDefault = fl => { const f = full(fl); return Object.keys(DEFAULTS).every(k => Math.abs(f[k] - DEFAULTS[k]) < 1e-6); };
// canvas 2D `ctx.filter` string (blur is in pixels of the target canvas)
const css = (fl, blurScale = 1) => { if (isDefault(fl)) return 'none'; const f = full(fl);
  return `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate}) hue-rotate(${f.hue}deg) grayscale(${f.gray}) sepia(${f.sepia}) invert(${f.invert}) blur(${f.blur * blurScale}px)`; };
window.SMA_FILTERS = { DEFAULTS, PRESETS, full, isDefault, css };
})();
