import { sanitizeObservation } from '../utils/observation';
import { getDefaultStorage, readJson, removeKey, writeJson } from './storage';

export const HISTORY_KEY = 'fpp.history.v1';
export const SNAPSHOT_VERSION = 1;
export const MAX_SNAPSHOTS = 25;
const MAX_SNAPSHOT_BYTES = 50 * 1024; // sanity bound when loading untrusted storage

/** Failure reasons returned to the UI. */
export const HISTORY_ERROR = Object.freeze({
  LIMIT: 'limit',
  QUOTA: 'quota',
  UNAVAILABLE: 'unavailable',
  OTHER: 'other',
});

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Short human-readable description of the environment, from non-sensitive fields only. */
function summarise(details) {
  const browser = details?.browser;
  const screen = details?.screen;
  const hardware = details?.hardware;
  return {
    browser: browser?.browser ? [browser.browser.name, browser.browser.version].filter(Boolean).join(' ') : null,
    os: browser?.os ? [browser.os.name, browser.os.version].filter(Boolean).join(' ') : null,
    deviceType: browser?.deviceType ?? null,
    screen: screen?.width ? `${screen.width}×${screen.height}` : null,
    cpuCores: hardware?.cpuLogicalCores ?? null,
    gpu: details?.webgl?.renderer ?? null,
  };
}

/**
 * Build a snapshot from a report.
 *
 * PRIVACY: this is a strict whitelist. Only the stable signals that were fed
 * into the hash, plus a small environment summary, are kept. IP address,
 * geolocation, behavioural data, battery, permissions, media devices and the
 * raw User-Agent string are never copied, whatever the report contains.
 */
export function createSnapshot(report, now = new Date(), observation = null) {
  const fp = report.stableFingerprint;
  return {
    version: SNAPSHOT_VERSION,
    id: newId(),
    savedAt: now.toISOString(),
    hash: fp.hash ?? null,
    hashInputVersion: fp.hashInputVersion,
    incomplete: Boolean(fp.incomplete),
    signals: fp.signals,
    summary: summarise(report.details),
    observation: sanitizeObservation(observation),
  };
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const orNull = (v) => (typeof v === 'string' || typeof v === 'number' ? v : null);

/** Re-build a snapshot from stored data, keeping only known fields; null if invalid. */
export function sanitizeSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.savedAt !== 'string' || Number.isNaN(Date.parse(raw.savedAt))) return null;
  if (!isPlainObject(raw.signals)) return null;
  if (raw.hash !== null && !(typeof raw.hash === 'string' && /^[0-9a-f]{64}$/.test(raw.hash))) return null;

  const summary = isPlainObject(raw.summary) ? raw.summary : {};
  const clean = {
    version: SNAPSHOT_VERSION,
    id: raw.id,
    savedAt: raw.savedAt,
    hash: raw.hash,
    hashInputVersion: typeof raw.hashInputVersion === 'string' ? raw.hashInputVersion : 'unknown',
    incomplete: raw.incomplete === true,
    signals: raw.signals,
    observation: sanitizeObservation(raw.observation),
    summary: {
      browser: orNull(summary.browser),
      os: orNull(summary.os),
      deviceType: orNull(summary.deviceType),
      screen: orNull(summary.screen),
      cpuCores: orNull(summary.cpuCores),
      gpu: orNull(summary.gpu),
    },
  };
  return JSON.stringify(clean).length <= MAX_SNAPSHOT_BYTES ? clean : null;
}

/**
 * @returns {{snapshots: object[], status: 'ok'|'empty'|'corrupted'|'unavailable', dropped: number}}
 * Snapshots are returned newest first. Invalid entries are dropped and counted.
 */
export function loadHistory(storage = getDefaultStorage()) {
  const result = readJson(storage, HISTORY_KEY);
  if (!result.ok) {
    if (result.reason === 'missing') return { snapshots: [], status: 'empty', dropped: 0 };
    return { snapshots: [], status: result.reason, dropped: 0 };
  }
  const list = Array.isArray(result.value?.snapshots) ? result.value.snapshots : null;
  if (!list) return { snapshots: [], status: 'corrupted', dropped: 0 };

  const snapshots = list.map(sanitizeSnapshot).filter(Boolean);
  snapshots.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  return { snapshots, status: snapshots.length ? 'ok' : 'empty', dropped: list.length - snapshots.length };
}

function persist(snapshots, storage) {
  const res = writeJson(storage, HISTORY_KEY, { version: SNAPSHOT_VERSION, snapshots });
  if (res.ok) return { ok: true };
  const map = { unavailable: HISTORY_ERROR.UNAVAILABLE, quota: HISTORY_ERROR.QUOTA };
  return { ok: false, reason: map[res.reason] ?? HISTORY_ERROR.OTHER };
}

/** @returns {{ok: true, snapshots: object[]} | {ok: false, reason: string, snapshots: object[]}} */
export function addSnapshot(snapshots, snapshot, storage = getDefaultStorage()) {
  if (snapshots.length >= MAX_SNAPSHOTS) return { ok: false, reason: HISTORY_ERROR.LIMIT, snapshots };
  const next = [snapshot, ...snapshots];
  const res = persist(next, storage);
  return res.ok ? { ok: true, snapshots: next } : { ...res, snapshots };
}

export function removeSnapshot(snapshots, id, storage = getDefaultStorage()) {
  const next = snapshots.filter((s) => s.id !== id);
  const res = persist(next, storage);
  return res.ok ? { ok: true, snapshots: next } : { ...res, snapshots };
}

/** Delete the whole history key (also recovers from corrupted data). */
export function clearHistory(storage = getDefaultStorage()) {
  removeKey(storage, HISTORY_KEY);
  return { ok: true, snapshots: [] };
}
