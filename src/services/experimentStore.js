import { sanitizeObservation } from '../utils/observation';
import { getDefaultStorage, readJson, removeKey, writeJson } from './storage';

/**
 * Laboratory experiments, stored only in this browser's localStorage.
 *
 * An experiment is a user-named series of runs. Each run keeps the same whitelisted data as a history
 * snapshot (stable signals and a non-sensitive summary) plus a few VARIABLE context values (zoom, window
 * size, UTC offset...) so changes that do not affect the hash can be observed. IP address, location,
 * behavioural data, battery and permissions are never stored. Names and labels are the only free text the
 * user can enter; they are length-limited, stripped of control characters and escaped wherever shown.
 */
export const EXPERIMENTS_KEY = 'fpp.experiments.v1';
export const EXPERIMENT_VERSION = 1;
export const MAX_EXPERIMENTS = 10;
export const MAX_RUNS = 12;
export const MAX_NAME = 60;
export const MAX_LABEL = 40;
const MAX_EXPERIMENT_BYTES = 400 * 1024;

export const EXPERIMENT_ERROR = Object.freeze({
  LIMIT: 'limit',
  RUN_LIMIT: 'runLimit',
  QUOTA: 'quota',
  UNAVAILABLE: 'unavailable',
  NOT_FOUND: 'notFound',
  INVALID: 'invalid',
  OTHER: 'other',
});

const newId = (prefix) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' ? v.slice(0, 60) : null);

/** Collapse whitespace, drop control characters, trim and limit length. */
export function cleanText(value, max) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Variable, non-sensitive context captured next to a run (none of it is hashed). */
export function captureContext(report, viewport = { width: null, height: null }) {
  const screen = report?.details?.screen ?? {};
  const locale = report?.details?.locale ?? {};
  return {
    devicePixelRatio: num(screen.devicePixelRatio),
    viewport: num(viewport.width) && num(viewport.height) ? `${viewport.width}×${viewport.height}` : null,
    availableArea: num(screen.availWidth) && num(screen.availHeight) ? `${screen.availWidth}×${screen.availHeight}` : null,
    orientation: str(screen.orientation),
    utcOffsetMinutes: num(locale.utcOffsetMinutes),
    languages: Array.isArray(locale.languages) ? locale.languages.filter((l) => typeof l === 'string').slice(0, 8).map((l) => l.slice(0, 20)) : [],
  };
}

function sanitizeContext(raw) {
  const c = isPlainObject(raw) ? raw : {};
  return {
    devicePixelRatio: num(c.devicePixelRatio),
    viewport: str(c.viewport),
    availableArea: str(c.availableArea),
    orientation: str(c.orientation),
    utcOffsetMinutes: num(c.utcOffsetMinutes),
    languages: Array.isArray(c.languages) ? c.languages.filter((l) => typeof l === 'string').slice(0, 8).map((l) => l.slice(0, 20)) : [],
  };
}

/** Whitelisted run built from a report. */
export function createRun(report, { label, presetId = 'custom' }, now = new Date(), viewport, observation = null) {
  const fp = report.stableFingerprint;
  const browser = report.details?.browser;
  return {
    id: newId('run'),
    label: cleanText(label, MAX_LABEL) || 'Run',
    presetId: cleanText(presetId, 20) || 'custom',
    savedAt: now.toISOString(),
    hash: fp.hash ?? null,
    hashInputVersion: fp.hashInputVersion,
    incomplete: Boolean(fp.incomplete),
    signals: fp.signals,
    summary: {
      browser: browser?.browser ? [browser.browser.name, browser.browser.version].filter(Boolean).join(' ') : null,
      os: browser?.os ? [browser.os.name, browser.os.version].filter(Boolean).join(' ') : null,
    },
    context: captureContext(report, viewport),
    observation: sanitizeObservation(observation),
  };
}

/** `protocol`: 'general' (free-form Laboratory experiment) or 'protection' (baseline / changed / baseline test). */
export const PROTOCOLS = Object.freeze(['general', 'protection']);
export const cleanProtocol = (p) => (PROTOCOLS.includes(p) ? p : 'general');

export function createExperiment(name, now = new Date(), protocol = 'general') {
  return { version: EXPERIMENT_VERSION, id: newId('exp'), name: cleanText(name, MAX_NAME) || 'Untitled experiment', protocol: cleanProtocol(protocol), createdAt: now.toISOString(), runs: [] };
}

function sanitizeRun(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.savedAt !== 'string' || Number.isNaN(Date.parse(raw.savedAt))) return null;
  if (!isPlainObject(raw.signals)) return null;
  if (raw.hash !== null && !(typeof raw.hash === 'string' && /^[0-9a-f]{64}$/.test(raw.hash))) return null;
  const summary = isPlainObject(raw.summary) ? raw.summary : {};
  return {
    id: raw.id,
    label: cleanText(raw.label, MAX_LABEL) || 'Run',
    presetId: cleanText(raw.presetId, 20) || 'custom',
    savedAt: raw.savedAt,
    hash: raw.hash,
    hashInputVersion: typeof raw.hashInputVersion === 'string' ? raw.hashInputVersion.slice(0, 20) : 'unknown',
    incomplete: raw.incomplete === true,
    signals: raw.signals,
    summary: { browser: str(summary.browser), os: str(summary.os) },
    context: sanitizeContext(raw.context),
    observation: sanitizeObservation(raw.observation),
  };
}

/** Rebuild an experiment from stored data keeping only known fields; null if invalid. */
export function sanitizeExperiment(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.createdAt !== 'string' || Number.isNaN(Date.parse(raw.createdAt))) return null;
  const runs = (Array.isArray(raw.runs) ? raw.runs : []).map(sanitizeRun).filter(Boolean).slice(0, MAX_RUNS);
  const clean = {
    version: EXPERIMENT_VERSION,
    id: raw.id,
    name: cleanText(raw.name, MAX_NAME) || 'Untitled experiment',
    protocol: cleanProtocol(raw.protocol),
    createdAt: raw.createdAt,
    runs: runs.sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt)),
  };
  return JSON.stringify(clean).length <= MAX_EXPERIMENT_BYTES ? clean : null;
}

/** @returns {{experiments: object[], status: 'ok'|'empty'|'corrupted'|'unavailable', dropped: number}} newest first */
export function loadExperiments(storage = getDefaultStorage()) {
  const result = readJson(storage, EXPERIMENTS_KEY);
  if (!result.ok) {
    return { experiments: [], status: result.reason === 'missing' ? 'empty' : result.reason, dropped: 0 };
  }
  const list = Array.isArray(result.value?.experiments) ? result.value.experiments : null;
  if (!list) return { experiments: [], status: 'corrupted', dropped: 0 };
  const experiments = list.map(sanitizeExperiment).filter(Boolean).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { experiments, status: experiments.length ? 'ok' : 'empty', dropped: list.length - experiments.length };
}

function persist(experiments, storage) {
  const res = writeJson(storage, EXPERIMENTS_KEY, { version: EXPERIMENT_VERSION, experiments });
  if (res.ok) return { ok: true };
  return { ok: false, reason: { unavailable: EXPERIMENT_ERROR.UNAVAILABLE, quota: EXPERIMENT_ERROR.QUOTA }[res.reason] ?? EXPERIMENT_ERROR.OTHER };
}

const commit = (previous, next, storage) => {
  const res = persist(next, storage);
  return res.ok ? { ok: true, experiments: next } : { ...res, experiments: previous };
};

export function addExperiment(experiments, experiment, storage = getDefaultStorage()) {
  if (experiments.length >= MAX_EXPERIMENTS) return { ok: false, reason: EXPERIMENT_ERROR.LIMIT, experiments };
  return commit(experiments, [experiment, ...experiments], storage);
}

export function addRun(experiments, experimentId, run, storage = getDefaultStorage()) {
  const target = experiments.find((e) => e.id === experimentId);
  if (!target) return { ok: false, reason: EXPERIMENT_ERROR.NOT_FOUND, experiments };
  if (target.runs.length >= MAX_RUNS) return { ok: false, reason: EXPERIMENT_ERROR.RUN_LIMIT, experiments };
  const next = experiments.map((e) => (e.id === experimentId ? { ...e, runs: [...e.runs, run] } : e));
  return commit(experiments, next, storage);
}

export function removeRun(experiments, experimentId, runId, storage = getDefaultStorage()) {
  const next = experiments.map((e) => (e.id === experimentId ? { ...e, runs: e.runs.filter((r) => r.id !== runId) } : e));
  return commit(experiments, next, storage);
}

export function removeExperiment(experiments, experimentId, storage = getDefaultStorage()) {
  return commit(experiments, experiments.filter((e) => e.id !== experimentId), storage);
}

export function clearExperiments(storage = getDefaultStorage()) {
  removeKey(storage, EXPERIMENTS_KEY);
  return { ok: true, experiments: [] };
}
