import { describe, expect, it } from 'vitest';
import {
  EXPERIMENT_ERROR,
  EXPERIMENTS_KEY,
  MAX_EXPERIMENTS,
  MAX_LABEL,
  MAX_NAME,
  MAX_RUNS,
  addExperiment,
  addRun,
  captureContext,
  cleanText,
  clearExperiments,
  createExperiment,
  createRun,
  loadExperiments,
  removeExperiment,
  removeRun,
  sanitizeExperiment,
} from '../../src/services/experimentStore';
import { analyzeExperiment, diffContext, explainPath } from '../../src/utils/experiments';
import { makeReport, okResult } from '../helpers/fixtures';
import { MemoryStorage } from '../helpers/memoryStorage';

const VIEWPORT = { width: 1280, height: 720 };
const at = (ms) => new Date(Date.UTC(2025, 0, 1) + ms);
const run = async (ms, label, presetId, options) => createRun(await makeReport(options), { label, presetId }, at(ms), VIEWPORT);

describe('experiment storage: privacy and robustness', () => {
  it('cleans names and labels: control characters, whitespace and length', () => {
    expect(cleanText('  a\u0000b\n\tc  ', 10)).toBe('a b c');
    expect(cleanText('x'.repeat(200), MAX_NAME)).toHaveLength(MAX_NAME);
    expect(cleanText(null, 5)).toBe('');
  });

  it('a run keeps only whitelisted data: no IP, location, behaviour, battery, permissions or session id', async () => {
    const report = await makeReport({ choices: { publicIp: true, geolocation: true, extended: true, behavioral: true }, extra: [
      okResult('publicIp', { ip: '203.0.113.9' }), okResult('geolocation', { city: 'Testville' }), okResult('battery', { levelPercent: 42 }), okResult('permissions', { camera: 'granted' }),
    ] });
    report.volatile.behavioral = { keyboard: { timings: [{ t: 1, dwellMs: 2 }] } };
    const json = JSON.stringify(createRun(report, { label: 'x' }, at(0), VIEWPORT));
    for (const needle of ['203.0.113.9', 'Testville', 'levelPercent', 'camera', 'keyboard', report.meta.sessionId, 'RAW-UA', 'userAgent']) expect(json).not.toContain(needle);
  });

  it('captures the variable context that is NOT hashed', async () => {
    const r = await run(0, 'Baseline', 'baseline');
    expect(r.context).toEqual({ devicePixelRatio: 1, viewport: '1280×720', availableArea: '1920×1040', orientation: 'landscape-primary', utcOffsetMinutes: 330, languages: ['en-US', 'en'] });
    expect(captureContext(null)).toMatchObject({ devicePixelRatio: null, viewport: null, languages: [] });
  });

  it('round-trips, newest experiment first, runs oldest first', async () => {
    const storage = new MemoryStorage();
    let list = [];
    const older = createExperiment('First', at(0));
    const newer = createExperiment('Second', at(5000));
    list = addExperiment(list, older, storage).experiments;
    list = addExperiment(list, newer, storage).experiments;
    list = addRun(list, older.id, await run(2000, 'B', 'timezone'), storage).experiments;
    addRun(list, older.id, await run(1000, 'A', 'baseline'), storage); // added out of order on purpose
    const loaded = loadExperiments(storage);
    expect(loaded.status).toBe('ok');
    expect(loaded.experiments.map((e) => e.name)).toEqual(['Second', 'First']);
    expect(loaded.experiments[1].runs.map((r) => r.label)).toEqual(['A', 'B']);
  });

  it('enforces experiment and run limits without losing existing data', async () => {
    const storage = new MemoryStorage();
    let list = [];
    for (let i = 0; i < MAX_EXPERIMENTS; i += 1) list = addExperiment(list, createExperiment(`E${i}`, at(i)), storage).experiments;
    expect(addExperiment(list, createExperiment('over'), storage)).toMatchObject({ ok: false, reason: EXPERIMENT_ERROR.LIMIT });

    const target = list[0];
    let current = list;
    for (let i = 0; i < MAX_RUNS; i += 1) current = addRun(current, target.id, await run(i, `r${i}`, 'custom'), storage).experiments;
    const over = addRun(current, target.id, await run(99, 'over', 'custom'), storage);
    expect(over).toMatchObject({ ok: false, reason: EXPERIMENT_ERROR.RUN_LIMIT });
    expect(over.experiments.find((e) => e.id === target.id).runs).toHaveLength(MAX_RUNS);
  });

  it('reports a missing experiment, full storage and unavailable storage instead of throwing', async () => {
    const storage = new MemoryStorage();
    const exp = createExperiment('E');
    expect(addRun([], 'nope', await run(0, 'x'), storage)).toMatchObject({ ok: false, reason: EXPERIMENT_ERROR.NOT_FOUND });
    storage.failWrites = 'quota';
    expect(addExperiment([], exp, storage)).toMatchObject({ ok: false, reason: EXPERIMENT_ERROR.QUOTA });
    expect(addExperiment([], exp, null)).toMatchObject({ ok: false, reason: EXPERIMENT_ERROR.UNAVAILABLE });
  });

  it('removes a run, an experiment, and everything', async () => {
    const storage = new MemoryStorage();
    const exp = createExperiment('E');
    let list = addExperiment([], exp, storage).experiments;
    const r1 = await run(0, 'a');
    list = addRun(list, exp.id, r1, storage).experiments;
    expect(removeRun(list, exp.id, r1.id, storage).experiments[0].runs).toEqual([]);
    expect(removeExperiment(list, exp.id, storage).experiments).toEqual([]);
    clearExperiments(storage);
    expect(storage.getItem(EXPERIMENTS_KEY)).toBeNull();
  });

  it('survives corrupted and malformed storage', async () => {
    expect(loadExperiments(new MemoryStorage({ [EXPERIMENTS_KEY]: '{{{' })).status).toBe('corrupted');
    expect(loadExperiments(new MemoryStorage({ [EXPERIMENTS_KEY]: JSON.stringify({ experiments: 'x' }) })).status).toBe('corrupted');
    expect(loadExperiments(null).status).toBe('unavailable');
    expect(loadExperiments(new MemoryStorage()).status).toBe('empty');

    const good = { ...createExperiment('Good', at(0)), runs: [await run(0, 'ok')] };
    const stored = { experiments: [good, { id: 'bad' }, null, { ...good, id: 'x', createdAt: 'garbage' }] };
    const loaded = loadExperiments(new MemoryStorage({ [EXPERIMENTS_KEY]: JSON.stringify(stored) }));
    expect(loaded.experiments).toHaveLength(1);
    expect(loaded.dropped).toBe(3);
  });

  it('strips unexpected fields and re-cleans text when loading tampered data', async () => {
    const exp = { ...createExperiment('Safe', at(0)), runs: [{ ...(await run(0, 'ok')), publicIp: '203.0.113.9', label: '<img src=x onerror=alert(1)>'.repeat(5) }], extra: 'x' };
    const clean = sanitizeExperiment(exp);
    expect(JSON.stringify(clean)).not.toContain('203.0.113.9');
    expect(clean).not.toHaveProperty('extra');
    expect(clean.runs[0].label.length).toBeLessThanOrEqual(MAX_LABEL);
  });
});

describe('experiment analysis', () => {
  it('returns null with no runs', () => {
    expect(analyzeExperiment(null)).toBeNull();
    expect(analyzeExperiment({ runs: [] })).toBeNull();
  });

  it('a single baseline run has nothing to compare', async () => {
    const a = analyzeExperiment({ name: 'E', runs: [await run(0, 'Baseline', 'baseline')] });
    expect(a.runs).toHaveLength(1);
    expect(a.repeatable).toBeNull();
    expect(a.summary[0]).toMatch(/1 run recorded, with 1 distinct/);
  });

  it('repeatable runs share one hash group and are reported as repeatable', async () => {
    const a = analyzeExperiment({ name: 'E', runs: [await run(0, 'Baseline', 'baseline'), await run(1, 'Repeat 2', 'baseline'), await run(2, 'Repeat 3', 'baseline')] });
    expect(a.distinctHashes).toBe(1);
    expect(a.repeatable).toBe(true);
    expect(a.runs.every((r) => r.hashGroup === 0)).toBe(true);
    expect(a.summary.join(' ')).toMatch(/repeatable/);
  });

  it('a time-zone change is attributed to the right signals, with reasons, and the hypothesis is confirmed', async () => {
    const tz = { mutate: (d) => { d.locale.timeZone = 'America/New_York'; d.locale.utcOffsetMinutes = -300; d.fingerprintjs.visitorId = 'changed'; } };
    const a = analyzeExperiment({ name: 'E', runs: [await run(0, 'Baseline', 'baseline'), await run(1, 'TZ', 'timezone', tz)] });
    const r = a.runs[1];
    expect(r.comparison.sameHash).toBe(false);
    expect(r.comparison.changedPaths.sort()).toEqual(['fingerprintjs.visitorId', 'locale.timeZone']);
    expect(r.comparison.explanations.map((e) => e.id).sort()).toEqual(['fingerprintjs', 'locale']);
    expect(r.comparison.explanations.find((e) => e.id === 'locale').causes.join(' ')).toMatch(/time zone/);
    expect(r.comparison.explanations.find((e) => e.id === 'fingerprintjs').note).toMatch(/composite/);
    expect(r.assessment.tone).toBe('confirmed');
    expect(a.distinctHashes).toBe(2);
    expect(a.repeatable).toBe(false);
  });

  it('a zoom change moves variable context but NOT the hash, and says why', async () => {
    const zoom = { mutate: (d) => { d.screen.devicePixelRatio = 1.5; d.screen.availHeight = 900; } };
    const a = analyzeExperiment({ name: 'E', runs: [await run(0, 'Baseline', 'baseline'), createRun(await makeReport(zoom), { label: 'Zoom 150%', presetId: 'display' }, at(1), { width: 853, height: 480 })] });
    const r = a.runs[1];
    expect(r.comparison.sameHash).toBe(true);
    expect(r.comparison.contextChanges.map((c) => c.key).sort()).toEqual(['availableArea', 'devicePixelRatio', 'viewport']);
    expect(r.comparison.contextChanges.find((c) => c.key === 'devicePixelRatio')).toMatchObject({ before: '1', after: '1.5' });
    expect(r.assessment.tone).toBe('confirmed');
    expect(r.assessment.text).toMatch(/hash did not change/);
    expect(a.summary.join(' ')).toMatch(/kept the same hash/);
  });

  it('display change that moves ONLY the FingerprintJS composite is reported honestly (found in real Chrome testing)', async () => {
    // Real finding: a pixel-ratio change left this app's screen signal alone but changed FingerprintJS's identifier.
    const zoom = { mutate: (d) => { d.screen.devicePixelRatio = 1.5; d.fingerprintjs.visitorId = 'changed-by-scaling'; } };
    const a = analyzeExperiment({ name: 'E', runs: [await run(0, 'Baseline', 'baseline'), await run(1, 'Zoom', 'display', zoom)] });
    const r = a.runs[1];
    expect(r.comparison.sameHash).toBe(false);
    expect(r.comparison.changedPaths).toEqual(['fingerprintjs.visitorId']);
    expect(r.comparison.contextChanges.map((c) => c.key)).toContain('devicePixelRatio');
    expect(r.assessment.tone).toBe('differs');
    expect(r.assessment.text).toMatch(/only through the FingerprintJS composite/);
    expect(r.assessment.text).toMatch(/own screen signal did not change/);
  });

  it('display change that alters a stable screen signal is attributed to the screen', async () => {
    const a = analyzeExperiment({ name: 'E', runs: [await run(0, 'Baseline', 'baseline'), await run(1, 'Resolution', 'display', { mutate: (d) => { d.screen.width = 1366; d.screen.height = 768; } })] });
    expect(a.runs[1].assessment.tone).toBe('differs');
    expect(a.runs[1].assessment.text).toMatch(/stable screen signal/);
  });

  it('never promises that a display change leaves the hash unchanged', async () => {
    const { EXPERIMENT_PRESETS, CONTEXT_FIELDS } = await import('../../src/config/signalCatalog');
    const display = EXPERIMENT_PRESETS.find((p) => p.id === 'display');
    expect(display.hypothesis).toMatch(/may or may not change/);
    expect(display.watch).toContain('fingerprintjs');
    expect(CONTEXT_FIELDS.devicePixelRatio.why).toMatch(/FingerprintJS composite may still react/);
  });

  it('says so when a watched signal did not change (never claims success)', async () => {
    const a = analyzeExperiment({ name: 'E', runs: [await run(0, 'Baseline', 'baseline'), await run(1, 'Language', 'language')] });
    expect(a.runs[1].assessment.tone).toBe('none');
    expect(a.runs[1].assessment.text).toMatch(/None of the watched signals changed/);
  });

  it('a signal that became unavailable shows up as a difference', async () => {
    const a = analyzeExperiment({ name: 'E', runs: [await run(0, 'Baseline', 'baseline'), await run(1, 'Hidden', 'setting', { mutate: (d) => { delete d.audio; } })] });
    expect(a.runs[1].comparison.changedPaths.some((p) => p.startsWith('audio'))).toBe(true);
    expect(a.runs[1].comparison.sameHash).toBe(false);
  });

  it('diffContext and explainPath handle empty/unknown input', () => {
    expect(diffContext({}, {})).toEqual([]);
    expect(diffContext(undefined, undefined)).toEqual([]);
    expect(explainPath('mystery.value')).toMatchObject({ id: 'mystery', causes: [] });
  });
});
