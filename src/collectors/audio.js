import { UnsupportedError } from '../utils/errors';
import { sha256Hex } from '../utils/hash';

const SAMPLE_RATE = 44100;
const LENGTH = 5000;

/** Render the test signal once into a memory buffer (never routed to the speakers). */
async function renderOnce(OfflineCtx) {
  const context = new OfflineCtx(1, LENGTH, SAMPLE_RATE);

  const oscillator = context.createOscillator();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 10000;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -50;
  compressor.knee.value = 40;
  compressor.ratio.value = 12;
  compressor.attack.value = 0;
  compressor.release.value = 0.25;

  oscillator.connect(compressor);
  compressor.connect(context.destination);
  oscillator.start(0);

  const rendered = await context.startRendering(); // resolves when done; bounded by the runner timeout
  const samples = rendered.getChannelData(0).slice(4500); // processed tail of the buffer

  let sum = 0;
  for (const s of samples) sum += Math.abs(s);
  // Round-trip through text so the hash input is plain, deterministic data.
  return { sampleRate: context.sampleRate, hash: await sha256Hex(Array.from(samples).join(',')), sampleSum: sum };
}

/**
 * Audio fingerprint using an OfflineAudioContext. The signal is rendered into a memory buffer and never
 * routed to the speakers, so nothing is audible and no user gesture / autoplay permission is needed.
 *
 * It is rendered TWICE. A browser that adds noise to audio output (a fingerprinting protection) returns
 * different results for identical input, which would make the hash change on every run. Like the canvas,
 * an inconsistent audio signal is therefore reported as "randomized" and left out of the hash. For a
 * normal browser the two renders agree and the hash input is exactly what it was before this check.
 */
export const audioCollector = {
  id: 'audio',
  label: 'Audio',
  timeoutMs: 8000,
  async collect() {
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) throw new UnsupportedError('OfflineAudioContext is not available');

    const first = await renderOnce(OfflineCtx);
    const second = await renderOnce(OfflineCtx);
    return { ...first, consistent: first.hash === second.hash };
  },
  // `consistent` is undefined for data produced before this check existed: treat that as consistent.
  stableView: (data) => (data.consistent === false ? { status: 'randomized' } : { sampleRate: data.sampleRate, hash: data.hash }),
};
