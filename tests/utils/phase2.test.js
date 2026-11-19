// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NAV, navSections } from '../../src/config/navigation';
import { OPTIONAL_PROTECTION_STEP, OUTCOME, PROTECTION_STEPS, analyzeProtection, pickProtectionRuns } from '../../src/utils/protectionTest';
import { makeReport } from '../helpers/fixtures';

const run = async (mutate) => { const fp = (await makeReport({ mutate })).stableFingerprint; return { signals: fp.signals, hash: fp.hash, observation: null }; };
const outcomeOf = (r, id) => r.attributes.find((a) => a.id === id).outcome;

describe('optional A3 baseline', () => {
  it('A-B-A stays the standard method: A3 is a separate optional step, not one of the required steps', () => {
    expect(PROTECTION_STEPS.map((s) => s.id)).toEqual(['protect-a1', 'protect-b', 'protect-a2']);
    expect(OPTIONAL_PROTECTION_STEP.id).toBe('protect-a3');
    expect(OPTIONAL_PROTECTION_STEP.instruction).toMatch(/Optional/);
  });

  it('results without A3 are exactly as before (A-B-A unchanged)', async () => {
    const r = analyzeProtection({ baseline: await run(), changed: await run((d) => { d.hardware.cpuLogicalCores = 4; }), repeat: await run() });
    expect(outcomeOf(r, 'hardware')).toBe(OUTCOME.CHANGED);
    expect(r.baselineCount).toBe(2);
    expect(r.caveats.join(' ')).toMatch(/Only one repeat baseline \(A2\)/);
  });

  it('catches natural variation that A1 and A2 happened to agree on: NOT attributed to the setting', async () => {
    const a1 = await run();
    const a2 = await run(); // agrees with A1 by chance
    const a3 = await run((d) => { d.canvas.hash = '7'.repeat(64); }); // but the attribute really varies
    const b = await run((d) => { d.canvas.hash = '8'.repeat(64); });
    const withoutA3 = analyzeProtection({ baseline: a1, changed: b, repeat: a2 });
    const withA3 = analyzeProtection({ baseline: a1, changed: b, repeat: a2, repeat2: a3 });
    expect(outcomeOf(withoutA3, 'canvas')).toBe(OUTCOME.CHANGED); // A-B-A alone would blame the setting
    expect(outcomeOf(withA3, 'canvas')).toBe(OUTCOME.UNSTABLE_BASELINE); // A3 prevents that
    expect(withA3.baselineCount).toBe(3);
    expect(withA3.hashNoise).toBe(true);
  });

  it('variation between A2 and A3 only (A1 matches both) is also treated as noise', async () => {
    const a1 = await run();
    const a2 = await run((d) => { d.fonts.installed = ['Arial']; });
    const a3 = await run((d) => { d.fonts.installed = ['Arial', 'Georgia']; });
    const r = analyzeProtection({ baseline: a1, changed: await run((d) => { d.fonts.installed = []; }), repeat: a2, repeat2: a3 });
    expect(outcomeOf(r, 'fonts')).toBe(OUTCOME.UNSTABLE_BASELINE);
  });

  it('an attribute stable across all three baselines and different in B is still attributed to the setting', async () => {
    const r = analyzeProtection({ baseline: await run(), changed: await run((d) => { d.hardware.cpuLogicalCores = 2; }), repeat: await run(), repeat2: await run() });
    expect(outcomeOf(r, 'hardware')).toBe(OUTCOME.CHANGED);
    expect(outcomeOf(r, 'screen')).toBe(OUTCOME.UNAFFECTED);
    expect(r.hashNoise).toBe(false);
    expect(r.caveats.join(' ')).toMatch(/Three baselines/);
    expect(r.caveats.join(' ')).toMatch(/small sample/);
  });

  it('never attributes ANY baseline-varying attribute to the setting, across all attributes', async () => {
    const a1 = await run();
    const a2 = await run();
    const a3 = await run((d) => { d.hardware.cpuLogicalCores = 1; d.locale.timeZone = 'x'; d.touch.maxTouchPoints = 9; d.screen.width = 1; });
    const b = await run((d) => { d.hardware.cpuLogicalCores = 2; d.locale.timeZone = 'y'; d.touch.maxTouchPoints = 8; d.screen.width = 2; });
    const r = analyzeProtection({ baseline: a1, changed: b, repeat: a2, repeat2: a3 });
    for (const id of ['hardware', 'locale', 'touch', 'screen']) expect(outcomeOf(r, id)).toBe(OUTCOME.UNSTABLE_BASELINE);
    expect(r.counts[OUTCOME.CHANGED]).toBe(0);
  });

  it('picks the A3 run when present, and is null when absent', () => {
    const mk = (presetId, t) => ({ presetId, savedAt: `2025-01-0${t}T00:00:00Z`, signals: {}, hash: null });
    expect(pickProtectionRuns({ runs: [mk('protect-a1', 1), mk('protect-a3', 4)] }).repeat2.presetId).toBe('protect-a3');
    expect(pickProtectionRuns({ runs: [mk('protect-a1', 1)] }).repeat2).toBeNull();
  });
});

describe('navigation grouping', () => {
  it('keeps the flat order, and groups exactly Laboratory and Protection test under "Experiments"', () => {
    const sections = navSections();
    expect(sections.flatMap((s) => s.items.map((i) => i.label))).toEqual(NAV.map((n) => n.label)); // nothing lost or reordered
    const experiments = sections.filter((s) => s.group === 'experiments');
    expect(experiments).toHaveLength(1);
    expect(experiments[0].label).toBe('Experiments');
    expect(experiments[0].items.map((i) => i.label)).toEqual(['Laboratory', 'Protection test']);
    expect(sections.filter((s) => !s.group).flatMap((s) => s.items.map((i) => i.label))).toEqual(
      ['Overview', 'Fingerprint', 'Privacy risks', 'History', 'Reports', 'Privacy & consent'],
    );
  });
});
