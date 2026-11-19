import { UnsupportedError } from '../utils/errors';
import { sha256HexOfBytes } from '../utils/hash';
import { withTimeout } from '../utils/timeout';
import { CANVAS_SIZE, drawScene } from './canvasScene';

const WORKER_TIMEOUT_MS = 2000;

function renderOnMainThread() {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new UnsupportedError('Canvas 2D context is unavailable');
  drawScene(ctx);
  return ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
}

/**
 * Render the same scene in a Web Worker. This is a secondary, best-effort
 * signal: a failure or timeout is reported as a status, never thrown, so it
 * can never block or break the main canvas fingerprint.
 */
async function renderInWorker() {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return { status: 'unsupported', reason: 'Worker or OffscreenCanvas not available' };
  }

  let worker;
  try {
    worker = new Worker(new URL('./canvasWorker.js', import.meta.url), { type: 'module' });
    const message = await withTimeout(
      new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message || 'Worker failed to run'));
        worker.postMessage({});
      }),
      WORKER_TIMEOUT_MS,
      'Canvas worker',
    );
    if (message.error) return { status: 'unsupported', reason: message.error };
    return { status: 'ok', hash: await sha256HexOfBytes(message.pixels) };
  } catch (err) {
    return { status: err.name === 'TimeoutError' ? 'timeout' : 'error', reason: err.message };
  } finally {
    worker?.terminate(); // always release the worker
  }
}

export const canvasCollector = {
  id: 'canvas',
  label: 'Canvas',
  timeoutMs: 5000,
  async collect() {
    // Render twice: privacy-focused browsers add random noise to canvas reads,
    // which would make the hash differ on every run.
    const first = await sha256HexOfBytes(renderOnMainThread());
    const second = await sha256HexOfBytes(renderOnMainThread());
    const worker = await renderInWorker();

    return {
      hash: first,
      consistent: first === second,
      worker,
    };
  },
  // A randomised canvas must not feed the stable hash, or the hash would
  // change on every visit. The worker result is informational only.
  stableView: (data) => (data.consistent ? { hash: data.hash } : { status: 'randomized' }),
};
