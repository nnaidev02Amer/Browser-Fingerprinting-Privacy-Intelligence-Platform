import { buildReport } from '../../src/utils/fingerprint';
import { createSnapshot } from '../../src/services/historyStore';

/** Realistic raw collector outputs (same shape the real collectors return). */
export const rawSignals = () => ({
  fingerprintjs: { visitorId: 'abc123', libraryVersion: '4.6.2', confidenceScore: 0.5, componentStatus: {} },
  browser: { source: 'userAgentData', browser: { name: 'Chrome', version: '126.0.1', majorVersion: '126' }, os: { name: 'Windows', version: '11' }, deviceType: 'Desktop', architecture: 'x86', bitness: '64', model: '', userAgent: 'UA' },
  screen: { width: 1920, height: 1080, colorDepth: 24, pixelDepth: 24, availWidth: 1920, availHeight: 1040, devicePixelRatio: 1, orientation: 'landscape-primary' },
  hardware: { cpuLogicalCores: 8, deviceMemoryGB: 8, deviceMemorySupported: true },
  touch: { maxTouchPoints: 0, touchEventSupported: false, pointerEventSupported: true, coarsePointer: false, hoverCapable: true },
  locale: { timeZone: 'Asia/Kolkata', locale: 'en-US', language: 'en-US', languages: ['en-US', 'en'], utcOffsetMinutes: 330 },
  canvas: { hash: 'c'.repeat(64), consistent: true, worker: { status: 'ok', hash: 'd'.repeat(64) } },
  webgl: { vendor: 'Google', renderer: 'ANGLE (Test GPU)', unmaskedInfoAvailable: true, shaderPrecision: { vertex: { highFloat: { rangeMin: 127, rangeMax: 127, precision: 23 } } }, extensions: ['A'], parameters: {} },
  audio: { sampleRate: 44100, hash: 'e'.repeat(64), sampleSum: 123.456 },
  fonts: { tested: 41, installed: ['Arial', 'Verdana'] },
});

export const asResults = (data) => Object.entries(data).map(([id, d]) => ({ id, label: id, status: 'ok', data: d, durationMs: 1 }));
export const okResult = (id, data) => ({ id, label: id, status: 'ok', data, durationMs: 1 });

export const ALL_OFF = { extended: false, publicIp: false, geolocation: false, behavioral: false };

/** Build a full report from fixture signals. `mutate(data)` edits the raw signals first. */
export async function makeReport({ choices = {}, extra = [], mutate } = {}) {
  const data = rawSignals();
  mutate?.(data);
  return buildReport([...asResults(data), ...extra], { choices: { ...ALL_OFF, ...choices } });
}

/** A history-style snapshot at a fixed time offset (ms from 2025-01-01). */
export async function makeSnapshot(offsetMs, options) {
  return createSnapshot(await makeReport(options), new Date(Date.UTC(2025, 0, 1) + offsetMs));
}
