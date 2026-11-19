// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SIGNALS } from '../../src/config/signalCatalog';
import { COMPARABLE_ATTRIBUTES, analyzeDistinguishability, ROLE, valueSignature } from '../../src/utils/distinguishability';
import { OUTCOME, PROTECTION_STEPS, analyzeProtection, pickProtectionRuns } from '../../src/utils/protectionTest';
import { makeReport, rawSignals } from '../helpers/fixtures';
import { MemoryStorage } from '../helpers/memoryStorage';

/** A stable-signal object built from fixtures, optionally mutated. */
const sig = async (mutate) => (await makeReport({ mutate })).stableFingerprint;
const run = async (mutate, extra = {}) => { const fp = await sig(mutate); return { signals: fp.signals, hash: fp.hash, observation: null, ...extra }; };

describe('protection test (A-B-A)', () => {
  it('attributes a difference to the setting only when the baseline was repeatable', async () => {
    const a1 = await run();
    const a2 = await run();
    const b = await run((d) => { d.hardware.cpuLogicalCores = 4; d.fonts.installed = ['Arial']; });
    const r = analyzeProtection({ baseline: a1, changed: b, repeat: a2 });
    const byId = Object.fromEntries(r.attributes.map((a) => [a.id, a]));
    expect(byId.hardware.outcome).toBe(OUTCOME.CHANGED);
    expect(byId.fonts.outcome).toBe(OUTCOME.CHANGED);
    expect(byId.screen.outcome).toBe(OUTCOME.UNAFFECTED);
    expect(r.hasNoiseFloor).toBe(true);
    expect(r.hashChanged).toBe(true);
    expect(r.hashNoise).toBe(false);
    expect(r.residual).toEqual(expect.arrayContaining(['screen', 'locale', 'touch']));
    expect(r.residual).not.toContain('hardware');
  });

  it('REFUSES to blame the setting for an attribute that already varied between the two baselines', async () => {
    const a1 = await run();
    const a2 = await run((d) => { d.canvas.hash = '9'.repeat(64); }); // canvas varies on its own
    const b = await run((d) => { d.canvas.hash = '8'.repeat(64); });
    const canvas = analyzeProtection({ baseline: a1, changed: b, repeat: a2 }).attributes.find((a) => a.id === 'canvas');
    expect(canvas.outcome).toBe(OUTCOME.UNSTABLE_BASELINE);
  });

  it('classifies randomised and unavailable attributes separately, and never calls them "protected"', async () => {
    const a1 = await run();
    const b = await run((d) => { d.canvas.consistent = false; delete d.audio; });
    const r = analyzeProtection({ baseline: a1, changed: b, repeat: await run() });
    const byId = Object.fromEntries(r.attributes.map((a) => [a.id, a]));
    expect(byId.canvas.outcome).toBe(OUTCOME.RANDOMISED);
    expect(byId.audio.outcome).toBe(OUTCOME.UNAVAILABLE);
    const all = JSON.stringify([r.summary, r.caveats, r.attributes.map((a) => a.implication)]);
    expect(all).not.toMatch(/\bprotected\b|\bprotects\b|\bsafe\b|anonymous|untrackable/i);
    expect(r.caveats.join(' ')).toMatch(/not evidence of better privacy/);
  });

  it('without a second baseline, says plainly that variation cannot be separated from the effect', async () => {
    const r = analyzeProtection({ baseline: await run(), changed: await run((d) => { d.hardware.cpuLogicalCores = 2; }) });
    expect(r.hasNoiseFloor).toBe(false);
    expect(r.hashNoise).toBeNull();
    expect(r.caveats[0]).toMatch(/No second baseline/);
    expect(r.summary[0]).toMatch(/no noise floor recorded/);
  });

  it('an unchanged hash is reported without claiming the setting does nothing', async () => {
    const r = analyzeProtection({ baseline: await run(), changed: await run(), repeat: await run() });
    expect(r.hashChanged).toBe(false);
    expect(r.counts[OUTCOME.UNAFFECTED]).toBe(9); // the derived composite is not counted
    expect(r.caveats.join(' ')).toMatch(/does not show the setting does nothing elsewhere/);
  });

  it('does not count the derived composite as an independent attribute', async () => {
    const r = analyzeProtection({ baseline: await run(), changed: await run((d) => { d.fingerprintjs.visitorId = 'z'; }), repeat: await run() });
    expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(9);
    expect(r.attributes.find((a) => a.id === 'fingerprintjs').derived).toBe(true);
  });

  it('surfaces WebGL readback noise as informational evidence', async () => {
    const a = await run(null, { observation: { readChecks: { canvas: true, audio: true, webgl: true } } });
    const b = await run(null, { observation: { readChecks: { canvas: true, audio: true, webgl: false } } });
    expect(analyzeProtection({ baseline: a, changed: b }).notes.join(' ')).toMatch(/WebGL pixel readback differed/);
  });

  it('warns when both runs came from the same page load (some settings need a reload)', async () => {
    const obs = { pageLoadId: 'p', browserSessionId: 's', readChecks: {} };
    const r = analyzeProtection({ baseline: await run(null, { observation: obs }), changed: await run(null, { observation: obs }) });
    expect(r.caveats.join(' ')).toMatch(/same page load/);
  });

  it('picks the A1 / B / A2 runs of an experiment by protocol step', () => {
    const mk = (presetId, savedAt) => ({ presetId, savedAt, signals: {}, hash: null });
    const picked = pickProtectionRuns({ runs: [mk('protect-b', '2025-01-02T00:00:00Z'), mk('protect-a1', '2025-01-01T00:00:00Z'), mk('protect-a2', '2025-01-03T00:00:00Z'), mk('general', '2025-01-04T00:00:00Z')] });
    expect([picked.baseline?.presetId, picked.changed?.presetId, picked.repeat?.presetId]).toEqual(['protect-a1', 'protect-b', 'protect-a2']);
    expect(PROTECTION_STEPS.map((s) => s.id)).toEqual(['protect-a1', 'protect-b', 'protect-a2']);
    expect(pickProtectionRuns(null)).toEqual({ baseline: null, changed: null, repeat: null, repeat2: null });
  });
});

describe('qualitative distinguishability (no percentages, no entropy)', () => {
  const obs = async (configLabel, mutate) => ({ configLabel, signals: (await sig(mutate)).signals });

  it('says "insufficient" until there are two configurations and a repeated session', async () => {
    const r = analyzeDistinguishability([await obs('Chrome')]);
    expect(r.attributes.every((a) => a.role === ROLE.INSUFFICIENT)).toBe(true);
    const two = analyzeDistinguishability([await obs('Chrome'), await obs('Edge')]);
    expect(two.attributes.every((a) => a.role === ROLE.INSUFFICIENT)).toBe(true); // no repeated session yet
  });

  it('separates attributes that distinguish configurations from those that are shared', async () => {
    const r = analyzeDistinguishability([
      await obs('Chrome'), await obs('Chrome'),
      await obs('Edge', (d) => { d.browser.browser.name = 'Edge'; d.webgl.renderer = 'Other GPU'; }),
    ]);
    const role = Object.fromEntries(r.attributes.map((a) => [a.id, a.role]));
    expect(role.browser).toBe(ROLE.DISTINGUISHES);
    expect(role.webgl).toBe(ROLE.DISTINGUISHES);
    expect(role.screen).toBe(ROLE.SHARED);
    expect(role.locale).toBe(ROLE.SHARED);
    expect(r.counts[ROLE.DISTINGUISHES]).toBe(2);
    expect(r.pairs).toEqual([expect.objectContaining({ a: 'Chrome', b: 'Edge', differing: ['browser', 'webgl'], indistinguishable: false })]);
  });

  it('flags an attribute that varied within one configuration as unstable', async () => {
    const r = analyzeDistinguishability([
      await obs('Chrome', (d) => { d.canvas.hash = '1'.repeat(64); }),
      await obs('Chrome', (d) => { d.canvas.hash = '2'.repeat(64); }),
      await obs('Edge'),
    ]);
    expect(r.attributes.find((a) => a.id === 'canvas').role).toBe(ROLE.UNSTABLE);
    expect(r.pairs[0].differing).not.toContain('canvas'); // unstable attributes are not used to separate
  });

  it('reports configurations that these attributes cannot tell apart', async () => {
    const r = analyzeDistinguishability([await obs('A'), await obs('A'), await obs('B')]);
    expect(r.pairs[0]).toMatchObject({ indistinguishable: true, differing: [] });
  });

  it('treats attributes unreadable everywhere as "unreadable", not as stable', async () => {
    const r = analyzeDistinguishability([await obs('A', (d) => { delete d.audio; }), await obs('A', (d) => { delete d.audio; }), await obs('B', (d) => { delete d.audio; })]);
    expect(r.attributes.find((a) => a.id === 'audio').role).toBe(ROLE.UNREADABLE);
  });

  it('ignores unlabelled observations and handles no data', async () => {
    expect(analyzeDistinguishability([]).hasData).toBe(false);
    expect(analyzeDistinguishability([await obs('')]).hasData).toBe(false);
  });

  it('output contains no percentage, entropy, score or uniqueness figure', async () => {
    const r = analyzeDistinguishability([await obs('A'), await obs('A'), await obs('B', (d) => { d.hardware.cpuLogicalCores = 2; })]);
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%|entropy|uniqueness|\bscore\b|\brisk\b/i);
  });

  it('value signatures are deterministic, short, and distinguish values and unreadable states', () => {
    expect(valueSignature({ a: 1, b: 2 })).toBe(valueSignature({ b: 2, a: 1 }));
    expect(valueSignature({ a: 1 })).not.toBe(valueSignature({ a: 2 }));
    expect(valueSignature({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
    expect(valueSignature({ status: 'unsupported' })).toBe('(unsupported)');
    expect(valueSignature(undefined)).toBe('(missing)');
  });

  it('covers exactly the attributes the catalog says are independent', () => {
    expect(new Set(COMPARABLE_ATTRIBUTES)).toEqual(new Set(Object.keys(SIGNALS).filter((id) => SIGNALS[id].stable && id !== 'fingerprintjs')));
    expect(rawSignals()).toHaveProperty('fonts');
  });
});
