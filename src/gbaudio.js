// Game Boy sound for exported games (placeholder until the music driver is added).
(() => {
'use strict';
const stubs = `
AudioInit:
 ret
MusicTick:
 ret
SfxFlush:
 xor a
 ld [v_ev],a
 ret
`;
const api = { stubs, build: () => null };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.SMA_gbaudio = api;
})();
