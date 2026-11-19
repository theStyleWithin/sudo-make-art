// Live2D models for Sudo Make VTuber: loads Live2D's Cubism Core (installed by the user, see electron/live2d.js), reads a model
// package (.zip with a .model3.json), moves the model's parameters and draws it with WebGL. Original code for this project.
// The Cubism Core itself is Live2D's proprietary software and is not part of this app; this file only calls its public interface.
// Not included yet: physics (swaying hair and clothes) and Live2D's motion/expression files.
(() => {
'use strict';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let corePromise = null;

// ---------- the runtime (Cubism Core) ----------
function status() { const api = window.sma && window.sma.live2d; return api ? api.status() : Promise.resolve({ installed: false, unsupported: true }); }
function ensureCore() { // injects Live2D's file once it has been installed; resolves to the Core object
  if (window.Live2DCubismCore) return Promise.resolve(window.Live2DCubismCore);
  if (corePromise) return corePromise;
  corePromise = status().then(s => { if (!s.installed) { const e = new Error('The Live2D runtime is not installed.'); e.code = 'NORUNTIME'; throw e; }
    return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'sma-rt://core/live2dcubismcore.min.js'; sc.onload = () => (window.Live2DCubismCore ? res(window.Live2DCubismCore) : rej(new Error('The Live2D runtime did not start.'))); sc.onerror = () => rej(new Error('Could not load the Live2D runtime.')); document.head.append(sc); }); })
    .catch(e => { corePromise = null; throw e; });
  return corePromise;
}

// ---------- loading a model package ----------
async function readPackage(blob) {
  const zipApi = window.SMA_profile && window.SMA_profile.readZip; if (!zipApi) throw new Error('The zip reader is not ready.');
  const files = await zipApi(new Uint8Array(await blob.arrayBuffer())), names = [...files.keys()].filter(n => !n.endsWith('/'));
  const mj = names.find(n => /\.model3\.json$/i.test(n)); if (!mj) throw new Error('This zip has no .model3.json file, so it is not a Live2D model (Cubism 3 or newer).');
  const base = mj.includes('/') ? mj.slice(0, mj.lastIndexOf('/') + 1) : '';
  const get = async rel => { const fn = files.get(base + rel) || files.get(decodeURI(base + rel)); if (!fn) throw new Error('The model file "' + rel + '" is missing from the zip.'); return fn(); };
  const def = JSON.parse(new TextDecoder().decode(await files.get(mj)()));
  const fr = def.FileReferences || {}; if (!fr.Moc) throw new Error('The model file does not name a .moc3 file.');
  return { def, name: mj.split('/').pop().replace(/\.model3\.json$/i, ''), moc: await get(fr.Moc), textures: await Promise.all((fr.Textures || []).map(async t => ({ name: t, data: await get(t) }))) };
}

// ---------- drawing (WebGL) ----------
const VS = 'attribute vec2 aPos;attribute vec2 aUv;uniform vec4 uXf;varying vec2 vUv;void main(){gl_Position=vec4(aPos.x*uXf.x+uXf.z,aPos.y*uXf.y+uXf.w,0.0,1.0);vUv=vec2(aUv.x,1.0-aUv.y);}';
const FS = 'precision mediump float;varying vec2 vUv;uniform sampler2D uTex;uniform sampler2D uMask;uniform float uOp;uniform vec4 uMul;uniform vec4 uScr;uniform int uUseMask;uniform int uInv;uniform vec2 uView;uniform int uMaskPass;' +
  'void main(){vec4 t=texture2D(uTex,vUv);vec3 rgb=t.rgb;float a=t.a;if(uMaskPass==1){gl_FragColor=vec4(0.0,0.0,0.0,a*uOp);return;}' +
  'vec3 un=a>0.0001?rgb/a:rgb;un=un*uMul.rgb;un=un+uScr.rgb-(un*uScr.rgb);rgb=un*a;vec4 c=vec4(rgb,a)*uOp;' +
  'if(uUseMask==1){float m=texture2D(uMask,gl_FragCoord.xy/uView).a;if(uInv==1)m=1.0-m;c*=m;}gl_FragColor=c;}';
class Live2D {
  constructor(core, pkg) {
    this.core = core; const moc = core.Moc.fromArrayBuffer(pkg.moc.buffer.slice(pkg.moc.byteOffset, pkg.moc.byteOffset + pkg.moc.byteLength)); if (!moc) throw new Error('This .moc3 file is not valid, or is newer than the installed Live2D runtime supports.');
    this.moc = moc; this.model = core.Model.fromMoc(moc); if (!this.model) throw new Error('Could not create the model.'); this.name = pkg.name; this.def = pkg.def; this.pkg = pkg;
    const P = this.model.parameters; this.pid = {}; P.ids.forEach((id, i) => { this.pid[id] = i; }); this.t = 0;
    this.gl = null; this.cv = null; this.tex = null;
  }
  has(id) { return this.pid[id] !== undefined; }
  set(id, v) { const i = this.pid[id]; if (i === undefined) return; const P = this.model.parameters; P.values[i] = clamp(v, P.minimumValues[i], P.maximumValues[i]); }
  setNorm(id, v) { const i = this.pid[id]; if (i === undefined) return; const P = this.model.parameters, lo = P.minimumValues[i], hi = P.maximumValues[i]; P.values[i] = clamp(v, lo, hi); } // value in the model's own units
  dflt(id) { const i = this.pid[id]; return i === undefined ? 0 : this.model.parameters.defaultValues[i]; }
  // Rig controls -> the standard Live2D parameter names (any the model does not have are skipped)
  apply(p, dt, cfg) {
    this.t += dt; const m = this.model, P = m.parameters; for (let i = 0; i < P.count; i++) P.values[i] = P.defaultValues[i]; // start from the model's neutral face
    const hy = p.yaw * cfg.head, hp = p.pitch * cfg.head, hr = p.roll * cfg.head;
    this.set('ParamAngleX', clamp(hy, -30, 30)); this.set('ParamAngleY', clamp(-hp, -30, 30)); this.set('ParamAngleZ', clamp(-hr, -30, 30));
    this.set('ParamBodyAngleX', clamp(hy * 0.3, -10, 10)); this.set('ParamBodyAngleZ', clamp(-hr * 0.3, -10, 10));
    this.set('ParamEyeLOpen', 1 - p.bl); this.set('ParamEyeROpen', 1 - p.br);
    const open = Math.max(p.mouth, p.vow.a, p.vow.o * 0.8, p.vow.e * 0.6); this.set('ParamMouthOpenY', open);
    this.set('ParamMouthForm', clamp(p.smile - p.sad * 0.8 + p.vow.i * 0.5 - p.vow.u * 0.6 - p.vow.o * 0.4, -1, 1));
    const brow = clamp(p.browUp - p.browDown, -1, 1); for (const k of ['ParamBrowLY', 'ParamBrowRY']) this.set(k, brow); if (p.browDown > 0.3) { this.set('ParamBrowLAngle', -p.browDown); this.set('ParamBrowRAngle', -p.browDown); }
    this.set('ParamCheek', p.smile > 0.5 ? 1 : 0); this.set('ParamBreath', (Math.sin(this.t * 1.6) + 1) / 2);
    m.update();
  }
  _init(W, H) {
    if (this.gl && this.gl.canvas.width === W && this.gl.canvas.height === H) return true; const first = !this.gl;
    if (first) { this.cv = document.createElement('canvas'); const gl = this.cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true }); if (!gl) throw new Error('3D drawing is not available on this computer.'); this.gl = gl; this._build(gl); }
    this.cv.width = W; this.cv.height = H; const gl = this.gl;
    // the mask picture (same size as the output)
    if (this.mTex) { gl.deleteTexture(this.mTex); gl.deleteFramebuffer(this.mFb); }
    this.mTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.mTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.mFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.mFb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.mTex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return first;
  }
  _build(gl) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(pr));
    this.pr = pr; this.U = {}; for (const u of ['uXf', 'uTex', 'uMask', 'uOp', 'uMul', 'uScr', 'uUseMask', 'uInv', 'uView', 'uMaskPass']) this.U[u] = gl.getUniformLocation(pr, u);
    this.aPos = gl.getAttribLocation(pr, 'aPos'); this.aUv = gl.getAttribLocation(pr, 'aUv'); this.bPos = gl.createBuffer(); this.bUv = gl.createBuffer(); this.bIdx = gl.createBuffer();
    this.tex = this.pkg.textures.map(t => null); this.texData = this.pkg.textures; this.texPromise = null;
  }
  async loadTextures() { // decoded once; uploaded when the drawing context exists
    this.bitmaps = await Promise.all(this.pkg.textures.map(t => createImageBitmap(new Blob([t.data], { type: /\.jpe?g$/i.test(t.name) ? 'image/jpeg' : 'image/png' }), { premultiplyAlpha: 'premultiply' })));
  }
  _upload() { const gl = this.gl; this.bitmaps.forEach((bm, i) => { if (this.tex[i]) return; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bm); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); this.tex[i] = t; }); }
  // st: { zoom, ox, oy, bg }  -> a new canvas W x H with a transparent background
  render(W, H, st) {
    W = Math.max(8, Math.round(W)); H = Math.max(8, Math.round(H)); this._init(W, H); const gl = this.gl, U = this.U, d = this.model.drawables, ci = this.model.canvasinfo; if (!this.bitmaps) return null; this._upload();
    const CW = ci.CanvasWidth, CH = ci.CanvasHeight, ppu = ci.PixelsPerUnit, zoom = (st && st.zoom) || 1, s = H * 0.92 * zoom / CH;   // output pixels per canvas pixel
    const cx = W / 2 - ((st && st.ox) || 0) * CH * s, cy = H / 2 + ((st && st.oy) || 0) * CH * s;
    // canvas pixel (px,py from top-left) -> output pixel -> clip.   px = originX + x*ppu,  py = originY - y*ppu
    const sx = 2 * s * ppu / W, sy = 2 * s * ppu / H, tx = 2 * (cx + s * (ci.OriginX - CW / 2)) / W - 1, ty = 1 - 2 * (cy + s * (ci.OriginY - CH / 2)) / H;
    // x_clip = x*sx + tx ; y_clip = y*sy + ty  (y up in model units)
    const xf = [sx, sy, tx, ty];
    gl.useProgram(this.pr); gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uMask, 1); gl.uniform2f(U.uView, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const n = d.count, order = []; for (let i = 0; i < n; i++) if (d.dynamicFlags[i] & 1) order.push(i); order.sort((a, b) => d.renderOrders[a] - d.renderOrders[b] || a - b);
    const drawDrawable = (i, maskPass) => {
      const pos = d.vertexPositions[i], uv = d.vertexUvs[i], idx = d.indices[i]; if (!idx.length) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(this.aPos); gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bUv); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(this.aUv); gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[d.textureIndices[i]]);
      gl.uniform4fv(U.uXf, xf); gl.uniform1f(U.uOp, d.opacities[i]); gl.uniform1i(U.uMaskPass, maskPass ? 1 : 0);
      const mc = d.multiplyColors, sc = d.screenColors; gl.uniform4f(U.uMul, mc ? mc[i * 4] : 1, mc ? mc[i * 4 + 1] : 1, mc ? mc[i * 4 + 2] : 1, 1); gl.uniform4f(U.uScr, sc ? sc[i * 4] : 0, sc ? sc[i * 4 + 1] : 0, sc ? sc[i * 4 + 2] : 0, 0);
      if (maskPass) gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else { const f = d.constantFlags[i]; if (f & 1) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE); else if (f & 2) gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    };
    let curKey = null;
    for (const i of order) {
      const masked = d.maskCounts[i] > 0; gl.uniform1i(U.uUseMask, 0);
      if (masked) {
        const ms = Array.from(d.masks[i]), key = ms.join(',');
        if (key !== curKey) { // draw this group's mask shapes into the mask picture (kept for the next drawable if it uses the same masks)
          curKey = key; gl.bindFramebuffer(gl.FRAMEBUFFER, this.mFb); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1i(U.uUseMask, 0);
          for (const mi of ms) drawDrawable(mi, true); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); }
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.mTex); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.uUseMask, 1); gl.uniform1i(U.uInv, d.constantFlags[i] & 8 ? 1 : 0);
      }
      drawDrawable(i, false);
    }
    d.resetDynamicFlags();
    const out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d').drawImage(this.cv, 0, 0); return out;
  }
  dispose() { try { this.model.release(); this.moc.release(); } catch (e) {} if (this.gl) { const gl = this.gl; this.tex.forEach(t => t && gl.deleteTexture(t)); } this.gl = null; this.cv = null; }
}
async function load(blob) { const core = await ensureCore(), pkg = await readPackage(blob), m = new Live2D(core, pkg); await m.loadTextures(); return m; }
window.SMA_l2d = { status, ensureCore, load, readPackage };
})();
