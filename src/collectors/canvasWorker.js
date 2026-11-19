// Web Worker: renders the canvas scene off the main thread with OffscreenCanvas
// and returns the raw pixel buffer. Bundled by Vite via
// `new Worker(new URL('./canvasWorker.js', import.meta.url), { type: 'module' })`.
import { CANVAS_SIZE, drawScene } from './canvasScene';

self.onmessage = () => {
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      self.postMessage({ error: 'OffscreenCanvas is not available in workers' });
      return;
    }
    const ctx = new OffscreenCanvas(CANVAS_SIZE, CANVAS_SIZE).getContext('2d');
    if (!ctx) {
      self.postMessage({ error: 'OffscreenCanvas 2D context unavailable' });
      return;
    }
    drawScene(ctx);
    const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    self.postMessage({ pixels: data.buffer }, [data.buffer]);
  } catch (err) {
    self.postMessage({ error: err?.message || String(err) });
  }
};
