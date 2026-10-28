// Encodes one frame to JPEG off the main thread, so several frames can be encoded at once during a fast export.
onmessage = async e => {
  const { bmp, w, h, q, n } = e.data;
  const oc = new OffscreenCanvas(w, h); oc.getContext('bitmaprenderer').transferFromImageBitmap(bmp);
  const buf = await (await oc.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer();
  postMessage({ n, buf }, [buf]);
};
