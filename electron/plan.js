'use strict';
// Decides where and how to run a model, based on the hardware. Pure function so it can be tested without a GPU.
// The goal on a mid-range PC (e.g. RTX 2060, 6 GB): never fail just because VRAM is short. Keep compute on the GPU and park
// the weights in system RAM; with no usable GPU at all, run on the CPU using system RAM.

const MB = 1048576;

function planRun(hw, { modelBytes, width, height, engines, frames }) {
  const modelMB = modelBytes / MB;
  let activationMB = (width * height) / (512 * 512) * (modelMB > 4000 ? 2400 : 1200); // rough working memory
  if (frames > 1) activationMB *= Math.max(2, frames / 4); // video keeps many frames in memory at once
  const needMB = modelMB * 1.15 + activationMB;
  const notes = [];
  if (frames > 1) notes.push('Video generation is heavy: on a mid-range GPU expect many minutes for a few seconds of footage.');
  let mode, flags = ['--vae-tiling'];

  const gpu = hw.gpu;
  if (gpu && gpu.vramFree >= needMB + 400) {
    mode = 'gpu';
    notes.push(`${gpu.name}: model fits in VRAM (${Math.round(needMB)} of ${gpu.vramFree} MB free).`);
  } else if (gpu && gpu.vramFree >= 2500) {
    mode = 'gpu-offload';
    flags.push('--offload-to-cpu', '--clip-on-cpu');
    notes.push(`${gpu.name}: ${gpu.vramFree} MB VRAM free, which is not enough to hold this ${Math.round(modelMB)} MB model plus its working memory. Weights are kept in system RAM and the GPU does the compute. Slower, but it runs.`);
  } else {
    mode = 'cpu';
    notes.push(gpu ? `Only ${gpu.vramFree} MB VRAM free, so running on the CPU using system RAM.` : 'No supported GPU found, so running on the CPU using system RAM. Expect minutes per image.');
  }

  const ramNeedMB = modelMB * 1.2 + 2000;
  if (mode !== 'gpu' && hw.ramFree < ramNeedMB) notes.push(`Warning: about ${Math.round(ramNeedMB)} MB of free RAM is wanted, ${hw.ramFree} MB is free. Close other programs or use a smaller/quantized model.`);

  // pick an engine build that can actually do this
  const e = engines || {};
  let engine = null;
  if (mode === 'gpu' || mode === 'gpu-offload') engine = e.cuda || e.vulkan || null;
  if (!engine && mode !== 'cpu' && e.cpu) { engine = e.cpu; mode = 'cpu'; notes.push('No GPU engine set, using the CPU engine.'); }
  if (!engine && mode === 'cpu') engine = e.cpu || null;
  if (!engine) notes.push(mode === 'cpu' ? 'Set a CPU engine (Settings → Engines) to run without a GPU.' : 'Set a CUDA or Vulkan engine (Settings → Engines).');

  return { mode, engine, flags, threads: Math.max(1, hw.cores - 1), needMB: Math.round(needMB), notes };
}

module.exports = { planRun };
