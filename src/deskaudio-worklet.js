// Plays raw 48 kHz stereo (16-bit) sent from the main process, for Sudo Make Live's desktop audio. A small buffer smooths
// out the delivery, and it is trimmed if it ever gets long so the sound does not fall behind the picture.
class SmaDesk extends AudioWorkletProcessor {
  constructor() { super(); this.L = new Float32Array(48000); this.R = new Float32Array(48000); this.r = 0; this.w = 0; this.n = 0;
    this.port.onmessage = e => { const s = new Int16Array(e.data), frames = s.length >> 1, cap = this.L.length;
      for (let i = 0; i < frames; i++) { if (this.n >= cap) { this.r = (this.r + 1) % cap; this.n--; } this.L[this.w] = s[i * 2] / 32768; this.R[this.w] = s[i * 2 + 1] / 32768; this.w = (this.w + 1) % cap; this.n++; }
      if (this.n > 24000) { const drop = this.n - 9600; this.r = (this.r + drop) % cap; this.n -= drop; } }; }
  process(_in, out) { const L = out[0][0], R = out[0][1] || out[0][0], cap = this.L.length; for (let i = 0; i < L.length; i++) { if (this.n > 0) { L[i] = this.L[this.r]; R[i] = this.R[this.r]; this.r = (this.r + 1) % cap; this.n--; } else { L[i] = 0; R[i] = 0; } } return true; }
}
registerProcessor('sma-desk', SmaDesk);
