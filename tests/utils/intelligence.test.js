import { describe, expect, it } from 'vitest';
import { ALL_COLLECTORS, STABLE_COLLECTORS } from '../../src/collectors';
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  CONTEXT_FIELDS,
  EXPERIMENT_PRESETS,
  EXPOSURE_CLASSES,
  SIGNALS,
  STABLE_SIGNAL_IDS,
  categoryOfPath,
} from '../../src/config/signalCatalog';
import { OPTIONAL_CATEGORIES } from '../../src/config/consentCategories';
import { SOURCES } from '../../src/config/sources';
import { differing, summariseByCategory } from '../../src/utils/categorySummary';
import { compareSignals } from '../../src/utils/compare';
import { buildComposition } from '../../src/utils/composition';
import { analyzeExposure } from '../../src/utils/privacyAnalysis';
import { makeReport, okResult } from '../helpers/fixtures';

describe('signal catalog stays in sync with the real collectors', () => {
  it('describes every collector that exists, and nothing that does not', () => {
    const collectorIds = ALL_COLLECTORS.map((c) => c.id).sort();
    expect(Object.keys(SIGNALS).sort()).toEqual(collectorIds);
  });

  it('marks exactly the collectors that feed the hash as stable (documentation cannot drift from behaviour)', () => {
    expect([...STABLE_SIGNAL_IDS].sort()).toEqual(STABLE_COLLECTORS.map((c) => c.id).sort());
  });

  it('every entry is complete and uses a known category and exposure class', () => {
    for (const [id, s] of Object.entries(SIGNALS)) {
      expect(CATEGORY_BY_ID[s.category], `${id} category`).toBeDefined();
      expect(EXPOSURE_CLASSES[s.exposureClass], `${id} exposure class`).toBeDefined();
      expect(s.label?.length, `${id}.label`).toBeGreaterThan(2);
      for (const field of ['exposes', 'identifies']) expect(s[field]?.length, `${id}.${field}`).toBeGreaterThan(10);
      expect(Array.isArray(s.changesWhen) && s.changesWhen.length > 0, `${id}.changesWhen`).toBe(true);
      if (s.stable) { expect(s.hashed?.length, `${id}.hashed`).toBeGreaterThan(5); expect(s.excluded?.length, `${id}.excluded`).toBeGreaterThan(5); }
    }
  });

  it('contains no numeric scores, entropy values or percentages in its explanations', () => {
    const text = JSON.stringify([SIGNALS, EXPOSURE_CLASSES, EXPERIMENT_PRESETS, CONTEXT_FIELDS]);
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%/);
    expect(text).not.toMatch(/\bentropy\b.*\d|\d.*\bbits? of entropy\b/i);
  });

  it('optional signals (never hashed) are the ones behind optional consent categories or marked variable', () => {
    for (const id of ['publicIp', 'geolocation', 'connection', 'battery', 'permissions', 'mediaDevices', 'automation', 'cpuBenchmark']) expect(SIGNALS[id].stable).toBe(false);
    expect(OPTIONAL_CATEGORIES.length).toBe(4);
  });

  it('presets only watch signals that exist', () => {
    for (const p of EXPERIMENT_PRESETS) for (const id of p.watch) expect(SIGNALS[id], `${p.id} watches ${id}`).toBeDefined();
    expect(EXPERIMENT_PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(['baseline', 'timezone', 'language', 'display', 'setting']));
  });

  it('maps diff paths to categories (first segment = collector id)', () => {
    expect(categoryOfPath('screen.long')).toBe('display');
    expect(categoryOfPath('canvas.hash')).toBe('rendering');
    expect(categoryOfPath('fonts')).toBe('rendering');
    expect(categoryOfPath('locale.timeZone')).toBe('locale');
    expect(categoryOfPath('webgl.renderer')).toBe('graphics');
    expect(categoryOfPath('unknown.thing')).toBe('composite');
  });
});

describe('buildComposition', () => {
  it('lists every signal once, split into stable and variable', async () => {
    const c = buildComposition(await makeReport());
    expect(c.signals).toHaveLength(Object.keys(SIGNALS).length);
    expect(c.totals.stableSignals).toBe(10);
    expect(c.totals.stableCollected).toBe(10);
    expect(c.signals.filter((s) => s.inHash)).toHaveLength(10);
    expect(c.signals.filter((s) => !s.stable).every((s) => !s.inHash)).toBe(true);
  });

  it('reports unavailable stable signals honestly (not in hash) and disabled optional ones', async () => {
    const report = await makeReport({ mutate: (d) => { delete d.audio; delete d.webgl; } });
    const c = buildComposition(report);
    const byId = Object.fromEntries(c.signals.map((s) => [s.id, s]));
    expect(byId.audio.inHash).toBe(false);
    expect(byId.audio.status).not.toBe('ok');
    expect(byId.publicIp.status).toBe('disabled');
    expect(c.totals.stableCollected).toBe(8);
  });

  it('groups by category with consistent counts', async () => {
    const c = buildComposition(await makeReport());
    for (const g of c.groups) {
      expect(g.total).toBe(g.signals.length);
      expect(g.inHash).toBeLessThanOrEqual(g.stableTotal);
    }
    expect(c.groups.find((g) => g.category.id === 'rendering').signals.map((s) => s.id)).toEqual(['canvas', 'audio', 'fonts']);
  });

  it('handles "no report yet"', () => {
    const c = buildComposition(null);
    expect(c.signals.every((s) => s.status === 'disabled' && !s.inHash)).toBe(true);
  });
});

describe('analyzeExposure', () => {
  it('returns null when nothing has been collected', () => {
    expect(analyzeExposure(null)).toBeNull();
  });

  it('describes only signals that were actually collected', async () => {
    const report = await makeReport({ mutate: (d) => { delete d.fonts; } });
    const a = analyzeExposure(report);
    expect(a.signals.map((s) => s.id)).not.toContain('fonts');
    expect(a.signals.map((s) => s.id)).toContain('canvas');
    expect(a.collectedCount).toBe(a.signals.length);
    expect(a.counts.shared + a.counts.narrows + a.counts.reveals).toBe(a.collectedCount);
  });

  it('produces no numeric score, entropy or risk percentage', async () => {
    const a = analyzeExposure(await makeReport());
    expect(Object.keys(a)).not.toEqual(expect.arrayContaining(['score', 'risk', 'entropy']));
    expect(JSON.stringify(a)).not.toMatch(/\d+(\.\d+)?\s*%/);
  });

  it('derives observations from the real data, each tagged as observed', async () => {
    const a = analyzeExposure(await makeReport());
    const text = a.observations.map((o) => o.text).join(' ');
    expect(text).toMatch(/ANGLE \(Test GPU\)/);
    expect(text).toMatch(/2 of 41 tested fonts/);
    expect(text).toMatch(/Asia\/Kolkata/);
    expect(a.observations.every((o) => o.evidence.includes('observed'))).toBe(true);
  });

  it('reports repeat-read noise as a measured fact without claiming protection or naming who did it', async () => {
    const report = await makeReport({ mutate: (d) => { d.canvas.consistent = false; d.audio.consistent = false; d.webgl.unmaskedInfoAvailable = false; d.webgl.readbackCheck = { consistent: false }; d.hardware.deviceMemorySupported = false; } });
    const a = analyzeExposure(report);
    const protective = a.observations.filter((o) => o.tone === 'protective').map((o) => o.text).join(' ');
    expect(protective).toMatch(/Canvas output differed between two identical reads/);
    expect(protective).toMatch(/Audio output differed between two identical reads/);
    expect(protective).toMatch(/WebGL pixel readback differed/);
    expect(protective).toMatch(/cannot tell which software did it/);
    expect(protective).not.toMatch(/\bprotecting\b|\bprotected\b/i);
    expect(protective).toMatch(/cannot tell whether the alteration prevents identification/); // the disclaimer, never a claim
    expect(a.observations.map((o) => o.text).join(' ')).toMatch(/did not expose device memory/);
  });

  it('every recommendation states why it applies, its limit, its evidence and real sources', async () => {
    const a = analyzeExposure(await makeReport());
    expect(a.recommendations.map((r) => r.id)).toEqual(expect.arrayContaining(['scope', 'measure', 'state']));
    expect(a.recommendations.map((r) => r.id)).not.toContain('network'); // network consent not given
    for (const r of a.recommendations) {
      for (const f of ['title', 'because', 'why', 'tradeoff']) expect(r[f].length, `${r.id}.${f}`).toBeGreaterThan(10);
      expect(r.evidence.length, `${r.id} evidence`).toBeGreaterThan(0);
      if (r.evidence.includes('documented')) expect(r.sources.length, `${r.id} documented => sources`).toBeGreaterThan(0);
      for (const id of r.sources) expect(SOURCES[id], `${r.id} source ${id}`).toBeDefined();
    }
    const withNetwork = analyzeExposure(await makeReport({ choices: { publicIp: true }, extra: [okResult('publicIp', { ip: '203.0.113.9' })] }));
    expect(withNetwork.recommendations.map((r) => r.id)).toContain('network');
  });

  it('contains no unverified product claims (Firefox, Tor, Brave behaviour was removed)', async () => {
    const a = analyzeExposure(await makeReport());
    const advice = JSON.stringify([a.recommendations, a.observations]);
    expect(advice).not.toMatch(/Tor Browser|Firefox|Brave|resistFingerprinting|randomises canvas|standardises many values/i);
    expect(a.unverifiedNote).toMatch(/Firefox and Tor Browser were removed/);
  });

  it('documented mechanisms quote their source, say what is NOT said, and state whether they were tested here', async () => {
    const a = analyzeExposure(await makeReport());
    expect(a.mechanisms.length).toBeGreaterThanOrEqual(4);
    for (const m of a.mechanisms) {
      expect(SOURCES[m.source].quotes.length, m.id).toBeGreaterThan(0);
      expect(SOURCES[m.source].url, m.id).toMatch(/^https:\/\//);
      expect(m.notSaid.length, m.id).toBeGreaterThan(20);
      expect(m.testedHere, m.id).toMatch(/^(No|Partly)/);
    }
    expect(a.mechanisms.find((m) => m.id === 'edge-tracking-prevention').testedHere).toMatch(/^No/);
    expect(a.mechanisms.find((m) => m.id === 'brave-fingerprinting').testedHere).toMatch(/^No/);
  });

  it('shows exactly which optional collectors were enabled and which third parties were contacted', async () => {
    const report = await makeReport({ choices: { publicIp: true, extended: true }, extra: [okResult('publicIp', { ip: '203.0.113.9' })] });
    const a = analyzeExposure(report);
    const enabled = Object.fromEntries(a.optional.map((o) => [o.id, o.enabled]));
    expect(enabled).toEqual({ extended: true, publicIp: true, geolocation: false, behavioral: false });
    expect(a.thirdParties.map((t) => t.host)).toEqual(['api.ipify.org']);
  });

  it('never includes the IP address or any collected network value in the analysis text', async () => {
    const report = await makeReport({ choices: { publicIp: true }, extra: [okResult('publicIp', { ip: '203.0.113.9' })] });
    expect(JSON.stringify(analyzeExposure(report))).not.toContain('203.0.113.9');
  });
});

describe('category summary of a comparison', () => {
  it('summarises a comparison by category', () => {
    const { rows } = compareSignals({ screen: { long: 1, short: 2 }, fonts: ['a'] }, { screen: { long: 9, short: 2 }, fonts: ['a', 'b'], canvas: { hash: 'x' } });
    const by = summariseByCategory(rows);
    expect(by.display).toEqual({ changed: 1, added: 0, removed: 0, unchanged: 1 });
    expect(by.rendering).toEqual({ changed: 1, added: 1, removed: 0, unchanged: 0 });
    expect(differing(by.rendering)).toBe(2);
  });

  it('every category used by the catalog is defined', () => {
    for (const c of CATEGORIES) expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
