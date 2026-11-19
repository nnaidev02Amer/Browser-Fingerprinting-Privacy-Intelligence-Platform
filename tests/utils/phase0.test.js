// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { audioCollector } from '../../src/collectors/audio';
import { webglCollector, readbackCheck } from '../../src/collectors/webgl';
import { STATUS, runCollector } from '../../src/collectors/runner';
import { SESSION_KEY, MARKER_KEY, getSessionEvidence, readSessionEvidence } from '../../src/services/sessionEvidence';
import { createSnapshot, sanitizeSnapshot } from '../../src/services/historyStore';
import { createRun, sanitizeExperiment, createExperiment } from '../../src/services/experimentStore';
import { ATTR, classifyAttribute, compareAttributes, countStates, viewState } from '../../src/utils/attributes';
import { compareSnapshots } from '../../src/utils/compare';
import { buildObservation, describeSessionRelation, readChecksFromReport, sanitizeObservation } from '../../src/utils/observation';
import { buildStableFingerprint } from '../../src/utils/fingerprint';
import { asResults, makeReport, makeSnapshot, rawSignals } from '../helpers/fixtures';
import { MemoryStorage } from '../helpers/memoryStorage';

describe('audio repeat-read check (randomisation detection)', () => {
  const stubAudio = (hashes) => {
    let n = 0;
    class Fake {
      constructor() { this.sampleRate = 44100; this.destination = {}; }
      createOscillator() { return { type: '', frequency: {}, connect: vi.fn(), start: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: vi.fn() }; }
      async startRendering() { const v = hashes[n++ % hashes.length]; return { getChannelData: () => new Float32Array(5000).fill(v) }; }
    }
    window.OfflineAudioContext = Fake;
  };

  it('two identical renders are "consistent" and the hash input is exactly the old shape', async () => {
    stubAudio([0.25]);
    const r = await runCollector(audioCollector);
    expect(r.status).toBe(STATUS.OK);
    expect(r.data.consistent).toBe(true);
    expect(audioCollector.stableView(r.data)).toEqual({ sampleRate: 44100, hash: r.data.hash });
    delete window.OfflineAudioContext;
  });

  it('renders that differ are "inconsistent" and the signal is excluded from the hash', async () => {
    stubAudio([0.25, 0.26]);
    const r = await runCollector(audioCollector);
    expect(r.data.consistent).toBe(false);
    expect(audioCollector.stableView(r.data)).toEqual({ status: 'randomized' });
    delete window.OfflineAudioContext;
  });

  it('legacy data without the flag is treated as consistent (hash unchanged)', () => {
    expect(audioCollector.stableView({ sampleRate: 44100, hash: 'h' })).toEqual({ sampleRate: 44100, hash: 'h' });
  });

  it('a noisy audio signal does not make the hash flap between runs', async () => {
    const mk = (hash) => asResults({ ...rawSignals(), audio: { sampleRate: 44100, hash, consistent: false } });
    const a = await buildStableFingerprint(mk('1'.repeat(64)));
    const b = await buildStableFingerprint(mk('2'.repeat(64)));
    expect(a.hash).toBe(b.hash);
    expect(a.signals.audio).toEqual({ status: 'randomized' });
  });
});

describe('WebGL readback check is informational and never changes the hash', () => {
  it('is excluded from the hash input, so the hash equals the pre-check hash', () => {
    const data = { vendor: 'v', renderer: 'r', extensions: ['a'], readbackCheck: { consistent: false } };
    expect(webglCollector.stableView(data)).toEqual({ vendor: 'v', renderer: 'r', extensions: ['a'] });
    expect(webglCollector.stableView(data)).not.toHaveProperty('readbackCheck');
  });

  it('reports null (unknown) rather than guessing when the check cannot run', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(readbackCheck()).toEqual({ consistent: null });
    vi.restoreAllMocks();
  });

  it('detects differing readbacks and identical readbacks', () => {
    const make = (values) => {
      let n = 0;
      return () => ({
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 3, STATIC_DRAW: 4, FLOAT: 5, TRIANGLE_STRIP: 6, RGBA: 7, UNSIGNED_BYTE: 8,
        createShader: () => ({}), shaderSource: vi.fn(), compileShader: vi.fn(), createProgram: () => ({}), attachShader: vi.fn(), linkProgram: vi.fn(), useProgram: vi.fn(),
        createBuffer: () => ({}), bindBuffer: vi.fn(), bufferData: vi.fn(), getAttribLocation: () => 0, enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(), viewport: vi.fn(), drawArrays: vi.fn(),
        readPixels: (_x, _y, _w, _h, _f, _t, out) => out.fill(values[n++ % values.length]),
        getExtension: () => ({ loseContext: vi.fn() }),
      });
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(make([5, 5]));
    expect(readbackCheck()).toEqual({ consistent: true });
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(make([5, 6]));
    expect(readbackCheck()).toEqual({ consistent: false });
    vi.restoreAllMocks();
  });
});

describe('attribute-level comparison: stable / changed / lost / gained / unavailable', () => {
  it('classifies every state', () => {
    const ok = { hash: 'a' };
    expect(classifyAttribute(ok, { hash: 'a' })).toBe(ATTR.UNCHANGED);
    expect(classifyAttribute(ok, { hash: 'b' })).toBe(ATTR.CHANGED);
    expect(classifyAttribute(ok, { status: 'unsupported' })).toBe(ATTR.LOST);
    expect(classifyAttribute(ok, { status: 'randomized' })).toBe(ATTR.LOST);
    expect(classifyAttribute({ status: 'unsupported' }, ok)).toBe(ATTR.GAINED);
    expect(classifyAttribute({ status: 'unsupported' }, { status: 'unsupported' })).toBe(ATTR.UNAVAILABLE);
    expect(classifyAttribute({ status: 'unsupported' }, { status: 'error' })).toBe(ATTR.STATUS_CHANGED);
    expect(classifyAttribute(undefined, ok)).toBe(ATTR.GAINED);
  });

  it('only a lone `status` key means "not readable" (a real value that has a status field is readable)', () => {
    expect(viewState({ status: 'unsupported' }).readable).toBe(false);
    expect(viewState({ status: 'x', other: 1 }).readable).toBe(true);
    expect(viewState(['Arial']).readable).toBe(true);
    expect(viewState(undefined)).toEqual({ readable: false, status: 'missing' });
  });

  it('counts WebGL as ONE attribute (not ~28 paths) and excludes the derived composite from counts', async () => {
    const a = (await makeSnapshot(0)).signals;
    const b = (await makeSnapshot(1, { mutate: (d) => { d.webgl.renderer = 'Other'; d.webgl.extensions = ['B']; d.fingerprintjs.visitorId = 'z'; } })).signals;
    const attrs = compareAttributes(a, b);
    expect(attrs).toHaveLength(10);
    expect(attrs.find((x) => x.id === 'webgl').state).toBe(ATTR.CHANGED);
    expect(attrs.find((x) => x.id === 'fingerprintjs')).toMatchObject({ state: ATTR.CHANGED, derived: true });
    const counts = countStates(attrs);
    expect(counts[ATTR.CHANGED]).toBe(1); // webgl only; the composite is not double counted
    expect(counts[ATTR.UNCHANGED]).toBe(8);
  });

  it('explains tracking implications as possibilities, never as guarantees or privacy verdicts', async () => {
    const a = (await makeSnapshot(0)).signals;
    const b = (await makeSnapshot(1, { mutate: (d) => { delete d.audio; d.canvas.consistent = false; d.hardware.cpuLogicalCores = 4; } })).signals;
    const text = compareAttributes(a, b).map((x) => x.implication).join(' ');
    expect(text).toMatch(/stays usable as a linking attribute/);
    expect(text).toMatch(/could still link/);
    expect(text).toMatch(/does not by itself show better privacy/);
    expect(text).not.toMatch(/\b(protects|safe|secure|anonymous|untrackable)\b/i);
  });

  it('distinguishes "became unsupported" and "became randomised" from a changed value', async () => {
    const a = (await makeSnapshot(0)).signals;
    const b = (await makeSnapshot(1, { mutate: (d) => { d.canvas.consistent = false; delete d.audio; } })).signals;
    const byId = Object.fromEntries(compareAttributes(a, b).map((x) => [x.id, x]));
    expect(byId.canvas).toMatchObject({ state: ATTR.LOST, afterStatus: 'randomized' });
    expect(byId.audio.state).toBe(ATTR.LOST);
    expect(byId.audio.afterStatus).not.toBe('ok');
  });
});

describe('hash-version guard', () => {
  it('does not call hashes identical when they were built from different input definitions', async () => {
    const a = { ...(await makeSnapshot(0)), hashInputVersion: 'fp-v1' };
    const b = { ...(await makeSnapshot(1)), hashInputVersion: 'fp-v2' };
    const cmp = compareSnapshots(a, b);
    expect(a.hash).toBe(b.hash);
    expect(cmp.versionMismatch).toBe(true);
    expect(cmp.sameHash).toBe(false);
  });

  it('same version: comparable as before', async () => {
    const cmp = compareSnapshots(await makeSnapshot(0), await makeSnapshot(1));
    expect(cmp.versionMismatch).toBe(false);
    expect(cmp.sameHash).toBe(true);
  });
});

describe('session evidence', () => {
  it('flags a first use: new browser session and no marker; then writes both markers', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const e = readSessionEvidence(local, session, new Date('2025-01-01T00:00:00Z'));
    expect(e).toMatchObject({ newBrowserSession: true, storageMarkerPresent: false });
    expect(e.browserSessionId).toBeTruthy();
    expect(session.getItem(SESSION_KEY)).toBe(e.browserSessionId);
    expect(JSON.parse(local.getItem(MARKER_KEY)).createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('a later page load in the same tab: same session, marker present', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const first = readSessionEvidence(local, session);
    const second = readSessionEvidence(local, session);
    expect(second).toMatchObject({ newBrowserSession: false, storageMarkerPresent: true, browserSessionId: first.browserSessionId });
  });

  it('after the site data is cleared the marker is reported absent (evidence, not proof)', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    readSessionEvidence(local, session);
    local.clear();
    expect(readSessionEvidence(local, session).storageMarkerPresent).toBe(false);
  });

  it('is cached per page load and storage, so recording twice keeps "present at load" meaning', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const first = getSessionEvidence(local, session);
    const again = getSessionEvidence(local, session);
    expect(again).toBe(first);
    expect(again.storageMarkerPresent).toBe(false); // not rewritten to "true" by the first recording
  });

  it('survives blocked storage with unknown (null) flags and no exception', () => {
    const blocked = new MemoryStorage();
    blocked.failWrites = 'security';
    blocked.failReads = true;
    expect(readSessionEvidence(blocked, blocked)).toMatchObject({ newBrowserSession: null, storageMarkerPresent: null });
    expect(readSessionEvidence(null, null)).toMatchObject({ newBrowserSession: null, storageMarkerPresent: null });
  });

  it('writes nothing until asked (never on import)', () => {
    const local = new MemoryStorage();
    expect(local.length).toBe(0);
  });
});

describe('observation: whitelisted, with no fingerprint values', () => {
  it('records the repeat-read results and session flags only', async () => {
    const report = await makeReport({ mutate: (d) => { d.canvas.consistent = false; d.audio.consistent = true; d.webgl.readbackCheck = { consistent: null }; } });
    expect(readChecksFromReport(report)).toEqual({ canvas: false, audio: true, webgl: null });
    const o = buildObservation(report, { pageLoadId: 'p1', browserSessionId: 's1', newBrowserSession: true, storageMarkerPresent: false });
    expect(o).toEqual({ pageLoadId: 'p1', browserSessionId: 's1', newBrowserSession: true, storageMarkerPresent: false, readChecks: { canvas: false, audio: true, webgl: null } });
  });

  it('drops unknown or oversized fields from untrusted input', () => {
    const o = sanitizeObservation({ pageLoadId: 'x'.repeat(200), ip: '203.0.113.9', hash: 'abc', readChecks: { canvas: 'yes', audio: true, extra: 1 } });
    expect(o.pageLoadId).toBeNull();
    expect(JSON.stringify(o)).not.toContain('203.0.113.9');
    expect(o.readChecks).toEqual({ canvas: null, audio: true, webgl: null });
  });

  it('is stored with snapshots and experiment runs, and sanitised on load', async () => {
    const report = await makeReport();
    const obs = { pageLoadId: 'p', browserSessionId: 's', newBrowserSession: false, storageMarkerPresent: true };
    const snap = createSnapshot(report, new Date(), obs);
    expect(snap.observation).toMatchObject({ pageLoadId: 'p', storageMarkerPresent: true });
    expect(sanitizeSnapshot({ ...snap, observation: { ...snap.observation, ip: '203.0.113.9' } }).observation).not.toHaveProperty('ip');
    const run = createRun(report, { label: 'x' }, new Date(), { width: 1, height: 1 }, obs);
    expect(run.observation.browserSessionId).toBe('s');
    const exp = sanitizeExperiment({ ...createExperiment('E', new Date(), 'protection'), runs: [run] });
    expect(exp.protocol).toBe('protection');
    expect(exp.runs[0].observation.pageLoadId).toBe('p');
    expect(sanitizeExperiment({ ...createExperiment('E'), protocol: 'evil' }).protocol).toBe('general');
  });

  it('describes the relation between two observations without claiming proof', () => {
    const a = { pageLoadId: 'p1', browserSessionId: 's1', storageMarkerPresent: true };
    expect(describeSessionRelation(a, { ...a })).toMatch(/same page load/);
    expect(describeSessionRelation(a, { pageLoadId: 'p2', browserSessionId: 's2', storageMarkerPresent: false })).toMatch(/different tab sessions.*absent at the later load.*not proof/);
    expect(describeSessionRelation(null, a)).toMatch(/not available/);
  });
});
