import { describe, expect, it } from 'vitest';
import {
  HISTORY_ERROR,
  HISTORY_KEY,
  MAX_SNAPSHOTS,
  addSnapshot,
  clearHistory,
  createSnapshot,
  loadHistory,
  removeSnapshot,
  sanitizeSnapshot,
} from '../../src/services/historyStore';
import { MemoryStorage } from '../helpers/memoryStorage';

const HASH = 'a'.repeat(64);
const makeReport = (overrides = {}) => ({
  stableFingerprint: {
    hash: HASH,
    hashInputVersion: 'fp-v1',
    incomplete: false,
    signals: { screen: { long: 1920, short: 1080, colorDepth: 24 }, fonts: ['Arial'] },
  },
  details: {
    browser: { browser: { name: 'Chrome', version: '126.0.1' }, os: { name: 'Windows', version: '11' }, deviceType: 'Desktop', userAgent: 'RAW-UA-STRING' },
    screen: { width: 1920, height: 1080 },
    hardware: { cpuLogicalCores: 8 },
    webgl: { renderer: 'ANGLE' },
  },
  volatile: {
    publicIp: { ip: '203.0.113.77' },
    geolocation: { city: 'Testville', latitude: 12.34, longitude: 56.78 },
    battery: { levelPercent: 42 },
    permissions: { camera: 'granted' },
    mediaDevices: { videoinput: 1 },
    behavioral: { keyboard: { timings: [{ t: 1, dwellMs: 2, flightMs: 3 }] }, mouse: { path: [{ x: 1, y: 2 }] } },
  },
  meta: { sessionId: 'SESSION-ID-XYZ', generatedAt: '2025-01-01T00:00:00.000Z' },
  ...overrides,
});
const snap = (offsetMs = 0, overrides = {}) =>
  createSnapshot({ ...makeReport(), ...overrides }, new Date(Date.UTC(2025, 0, 1) + offsetMs));

describe('createSnapshot: privacy whitelist', () => {
  it('saves the stable signals, hash and a timestamp', () => {
    const s = snap(0);
    expect(s).toMatchObject({ hash: HASH, hashInputVersion: 'fp-v1', savedAt: '2025-01-01T00:00:00.000Z', signals: { screen: { long: 1920 } } });
    expect(s.summary).toMatchObject({ browser: 'Chrome 126.0.1', os: 'Windows 11', screen: '1920×1080', cpuCores: 8, gpu: 'ANGLE' });
  });

  it.each([
    ['public IP address', '203.0.113.77'],
    ['geolocation city', 'Testville'],
    ['geolocation coordinates', '12.34'],
    ['battery level', 'levelPercent'],
    ['permission states', 'camera'],
    ['media devices', 'videoinput'],
    ['behavioural keyboard timings', 'dwellMs'],
    ['behavioural mouse path', 'path'],
    ['raw User-Agent string', 'RAW-UA-STRING'],
    ['session id', 'SESSION-ID-XYZ'],
  ])('NEVER stores %s', (_name, needle) => {
    expect(JSON.stringify(snap(0))).not.toContain(needle);
  });

  it('keeps no raw key or text fields', () => {
    const json = JSON.stringify(snap(0));
    for (const forbidden of ['"key"', '"keyCode"', '"code"', 'typed', 'inputData']) expect(json).not.toContain(forbidden);
  });
});

describe('loading history', () => {
  it('empty storage -> empty list, status "empty"', () => {
    expect(loadHistory(new MemoryStorage())).toEqual({ snapshots: [], status: 'empty', dropped: 0 });
  });

  it('round-trips saved snapshots, newest first', () => {
    const storage = new MemoryStorage();
    let list = [];
    for (const offset of [0, 2000, 1000]) list = addSnapshot(list, snap(offset), storage).snapshots;
    const loaded = loadHistory(storage);
    expect(loaded.status).toBe('ok');
    expect(loaded.snapshots.map((s) => s.savedAt)).toEqual([
      '2025-01-01T00:00:02.000Z', '2025-01-01T00:00:01.000Z', '2025-01-01T00:00:00.000Z',
    ]);
  });

  it('corrupted JSON -> empty list, status "corrupted" (never throws)', () => {
    expect(loadHistory(new MemoryStorage({ [HISTORY_KEY]: '{{{' }))).toMatchObject({ snapshots: [], status: 'corrupted' });
  });

  it('valid JSON with the wrong shape -> "corrupted"', () => {
    expect(loadHistory(new MemoryStorage({ [HISTORY_KEY]: JSON.stringify({ snapshots: 'nope' }) })).status).toBe('corrupted');
    expect(loadHistory(new MemoryStorage({ [HISTORY_KEY]: JSON.stringify([1, 2]) })).status).toBe('corrupted');
  });

  it('keeps valid snapshots and counts the invalid ones it dropped', () => {
    const good = snap(0);
    const stored = { snapshots: [good, { id: 'bad' }, null, { ...good, id: 'x', hash: 'not-a-hash' }, { ...good, id: 'y', savedAt: 'garbage' }] };
    const loaded = loadHistory(new MemoryStorage({ [HISTORY_KEY]: JSON.stringify(stored) }));
    expect(loaded.snapshots).toHaveLength(1);
    expect(loaded.dropped).toBe(4);
  });

  it('unavailable storage -> empty list, status "unavailable"', () => {
    expect(loadHistory(null)).toMatchObject({ snapshots: [], status: 'unavailable' });
  });

  it('strips unexpected fields from stored snapshots (tampered or foreign data cannot smuggle IP/behavioural data in)', () => {
    const tampered = { ...snap(0), publicIp: '203.0.113.5', behavioral: { keys: 'abc' }, summary: { browser: 'X', evil: 'y' } };
    const clean = sanitizeSnapshot(tampered);
    expect(clean).not.toHaveProperty('publicIp');
    expect(clean).not.toHaveProperty('behavioral');
    expect(clean.summary).not.toHaveProperty('evil');
  });

  it('drops absurdly large snapshots', () => {
    const huge = { ...snap(0), signals: { blob: 'x'.repeat(60 * 1024) } };
    expect(sanitizeSnapshot(huge)).toBeNull();
  });

  it('accepts a snapshot saved without a hash (SHA-256 unavailable)', () => {
    expect(sanitizeSnapshot({ ...snap(0), hash: null })).toMatchObject({ hash: null });
  });
});

describe('adding, removing and clearing', () => {
  it('removes a single snapshot', () => {
    const storage = new MemoryStorage();
    const a = snap(0);
    const b = snap(1000);
    let list = addSnapshot([], a, storage).snapshots;
    list = addSnapshot(list, b, storage).snapshots;
    const result = removeSnapshot(list, a.id, storage);
    expect(result.snapshots.map((s) => s.id)).toEqual([b.id]);
    expect(loadHistory(storage).snapshots.map((s) => s.id)).toEqual([b.id]);
  });

  it('clears everything, including corrupted data', () => {
    const storage = new MemoryStorage({ [HISTORY_KEY]: '{{{' });
    expect(clearHistory(storage).snapshots).toEqual([]);
    expect(loadHistory(storage).status).toBe('empty');
  });

  it(`refuses a new snapshot past the ${MAX_SNAPSHOTS}-snapshot limit and keeps existing ones`, () => {
    const storage = new MemoryStorage();
    let list = [];
    for (let i = 0; i < MAX_SNAPSHOTS; i += 1) list = addSnapshot(list, snap(i * 1000), storage).snapshots;
    const result = addSnapshot(list, snap(999999), storage);
    expect(result).toMatchObject({ ok: false, reason: HISTORY_ERROR.LIMIT });
    expect(result.snapshots).toHaveLength(MAX_SNAPSHOTS);
  });

  it('reports a full browser storage as "quota" and leaves the list untouched', () => {
    const storage = new MemoryStorage();
    const existing = addSnapshot([], snap(0), storage).snapshots;
    storage.failWrites = 'quota';
    const result = addSnapshot(existing, snap(1000), storage);
    expect(result).toMatchObject({ ok: false, reason: HISTORY_ERROR.QUOTA });
    expect(result.snapshots).toEqual(existing);
  });

  it('reports unavailable storage on save', () => {
    expect(addSnapshot([], snap(0), null)).toMatchObject({ ok: false, reason: HISTORY_ERROR.UNAVAILABLE });
  });

  it('a snapshot of a hash-less (insecure context) report is allowed', () => {
    const report = makeReport();
    report.stableFingerprint.hash = null;
    expect(createSnapshot(report).hash).toBeNull();
  });
});
