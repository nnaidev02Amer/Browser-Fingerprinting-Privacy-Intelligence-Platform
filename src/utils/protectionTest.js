import { ATTR, compareAttributes, describeStatus } from './attributes';
import { describeSessionRelation } from './observation';

/**
 * Protection test: baseline (A1), changed configuration (B), baseline again (A2).
 *
 * The second baseline is the NOISE FLOOR. An attribute that already differs between A1 and A2 varies on its
 * own, so a difference between A1 and B cannot be blamed on the setting. Only attributes that were
 * repeatable between A1 and A2 are attributed to the change.
 *
 * Everything here is MEASURED in one browser on one machine. It reports what changed. It does not say
 * that a change is good for privacy: a changed or randomised value can make a browser more distinctive,
 * and standardised values help only if many other browsers share them, which this project cannot know.
 */
export const OUTCOME = Object.freeze({
  UNAFFECTED: 'unaffected',
  CHANGED: 'changed',
  RANDOMISED: 'randomised',
  UNAVAILABLE: 'unavailable',
  NEWLY_READABLE: 'newly-readable',
  UNAVAILABLE_BOTH: 'unavailable-both',
  UNSTABLE_BASELINE: 'unstable-baseline',
});

export const OUTCOME_TEXT = Object.freeze({
  [OUTCOME.UNAFFECTED]: 'Identical to the baseline. It stays available as a linking attribute.',
  [OUTCOME.CHANGED]: 'Value differs from the baseline although the baseline was repeatable, so the difference is attributed to the change. Exact matching on it would fail.',
  [OUTCOME.RANDOMISED]: 'Repeated reads inside the changed session returned different results, so it cannot support exact matching. This shows alteration between reads, not whether identification is prevented.',
  [OUTCOME.UNAVAILABLE]: 'Not readable (or not supported) in the changed configuration, although it was readable in the baseline.',
  [OUTCOME.NEWLY_READABLE]: 'Became readable in the changed configuration.',
  [OUTCOME.UNAVAILABLE_BOTH]: 'Not readable in either configuration, so it contributes nothing here.',
  [OUTCOME.UNSTABLE_BASELINE]: 'Already differed between the two baselines, so it varies on its own. No conclusion about the setting can be drawn from this attribute.',
});

const VARIES = new Set([ATTR.CHANGED, ATTR.LOST, ATTR.GAINED, ATTR.STATUS_CHANGED]);

function outcomeFor(effect, noise) {
  if (noise && VARIES.has(noise.state)) return OUTCOME.UNSTABLE_BASELINE;
  switch (effect.state) {
    case ATTR.UNCHANGED: return OUTCOME.UNAFFECTED;
    case ATTR.CHANGED: return OUTCOME.CHANGED;
    case ATTR.LOST: return effect.afterStatus === 'randomized' ? OUTCOME.RANDOMISED : OUTCOME.UNAVAILABLE;
    case ATTR.GAINED: return OUTCOME.NEWLY_READABLE;
    default: return OUTCOME.UNAVAILABLE_BOTH;
  }
}

/**
 * @param {{baseline: object, changed: object, repeat?: object|null, repeat2?: object|null}} runs
 *   baseline = A1, changed = B, repeat = A2 (standard), repeat2 = A3 (optional extra baseline).
 *   Each run has `signals`, `hash`, `observation`.
 *
 * NOISE FLOOR. Every baseline run (A1, A2 and, if recorded, A3) is compared with every other baseline run.
 * An attribute that differs between ANY two baselines varies on its own, and is never attributed to the
 * setting. A3 matters because two baselines can agree by chance: an attribute that is identical in A1 and
 * A2 but different in A3 is still caught.
 */
export function analyzeProtection({ baseline, changed, repeat = null, repeat2 = null }) {
  const effects = compareAttributes(baseline.signals, changed.signals);
  const baselines = [baseline, repeat, repeat2].filter(Boolean);
  const noiseRuns = baselines.length - 1;
  const pairs = [];
  for (let i = 0; i < baselines.length; i += 1) {
    for (let j = i + 1; j < baselines.length; j += 1) pairs.push(compareAttributes(baselines[i].signals, baselines[j].signals));
  }
  // For each attribute: the first baseline pair in which it varied, else (if any pair exists) the first pair.
  const noiseFor = (i) => (pairs.length ? pairs.find((p) => VARIES.has(p[i].state))?.[i] ?? pairs[0][i] : null);

  const attributes = effects.map((effect, i) => ({ ...effect, noise: noiseFor(i), outcome: outcomeFor(effect, noiseFor(i)) }));
  const counted = attributes.filter((a) => !a.derived);

  const counts = Object.fromEntries(Object.values(OUTCOME).map((o) => [o, 0]));
  for (const a of counted) counts[a.outcome] += 1;

  const differed = counts[OUTCOME.CHANGED] + counts[OUTCOME.RANDOMISED] + counts[OUTCOME.UNAVAILABLE];
  const residual = counted.filter((a) => a.outcome === OUTCOME.UNAFFECTED).map((a) => a.id);
  const hashChanged = baseline.hash !== null && changed.hash !== null ? baseline.hash !== changed.hash : null;

  const notes = [];
  const b = changed.observation?.readChecks ?? {};
  const a1 = baseline.observation?.readChecks ?? {};
  if (b.webgl === false && a1.webgl !== false) notes.push('WebGL pixel readback differed between two identical draws in the changed session, but not in the baseline (measured). It is not part of the hash.');
  if (a1.webgl === false) notes.push('WebGL pixel readback already differed between identical draws in the baseline (measured).');

  const caveats = [
    'A changed value is not evidence of better privacy. Randomised or unusual values can make a browser more distinctive, and standardised values help only if many other browsers share them, which this project cannot measure.',
    'This is one browser on one machine with one setting changed. It says nothing about other browsers, other settings, or how common any value is among other users.',
    'Only the attributes this application reads are covered. A setting that changes other fingerprint surfaces (headers, network, behaviour) would not show up here.',
  ];
  if (!repeat) caveats.unshift('No second baseline was recorded, so normal variation cannot be separated from the effect of the setting. Treat every difference as provisional.');
  if (noiseRuns === 1) caveats.push('Only one repeat baseline (A2) was recorded. Two runs can agree by chance, so natural variation may be under-estimated. The optional third baseline (A3) tightens this check.');
  if (noiseRuns >= 2) caveats.push('Three baselines (A1, A2, A3) were recorded. An attribute that differed between any two of them is treated as varying on its own. Three runs are still a small sample, so rare variation can be missed.');
  if (counts[OUTCOME.UNSTABLE_BASELINE] > 0) caveats.push(`${counts[OUTCOME.UNSTABLE_BASELINE]} attribute(s) varied between baseline runs, so no conclusion is drawn about them.`);
  if (hashChanged === false) caveats.push('The hash is unchanged: nothing this application reads was affected. That does not show the setting does nothing elsewhere.');
  const relation = describeSessionRelation(baseline.observation, changed.observation);
  if (baseline.observation?.pageLoadId && baseline.observation.pageLoadId === changed.observation?.pageLoadId) {
    caveats.push('The baseline and the changed run came from the same page load. Some settings only take effect after a reload or a new session, so reload the page after changing a setting.');
  }

  const summary = [
    `${counts[OUTCOME.UNAFFECTED]} of ${counted.length} attributes were identical to the baseline${noiseRuns ? '' : ' (no noise floor recorded)'}.`,
    `${differed} attribute(s) differed, were randomised or became unavailable${noiseRuns ? ' beyond normal variation' : ''}.`,
  ];
  if (hashChanged !== null) summary.push(hashChanged ? 'The configuration hash changed.' : 'The configuration hash did not change.');

  return {
    attributes,
    counts,
    residual,
    hashChanged,
    hasNoiseFloor: noiseRuns > 0,
    baselineCount: baselines.length,
    // true if the hash differed between any two baseline runs; null if there is only one baseline or a hash is missing
    hashNoise: noiseRuns > 0 && baselines.every((r) => r.hash !== null) ? new Set(baselines.map((r) => r.hash)).size > 1 : null,
    notes,
    caveats,
    summary,
    relation,
    describeStatus,
  };
}

/** The runs of a protection experiment, picked by their protocol step (presetId). */
export const PROTECTION_STEPS = Object.freeze([
  { id: 'protect-a1', label: 'Baseline (A1)', short: 'A1', instruction: 'Record your browser as it is now, before changing anything.' },
  { id: 'protect-b', label: 'Changed configuration (B)', short: 'B', instruction: 'Change ONE setting yourself (a browser privacy option, an extension, a different browser profile, the time zone...). Reload this page, then record. Describe the change in the label.' },
  { id: 'protect-a2', label: 'Baseline again (A2)', short: 'A2', instruction: 'Undo the change, reload this page, and record again. This second baseline shows how much your browser varies on its own.' },
]);

/** Optional extra baseline. Not required: A-B-A stays the standard method. */
export const OPTIONAL_PROTECTION_STEP = Object.freeze({ id: 'protect-a3', label: 'Optional extra baseline (A3)', short: 'A3', instruction: 'Optional. Reload the page once more WITHOUT changing anything, and record a third baseline. If a value is identical in A1 and A2 by chance but differs here, it is caught as natural variation instead of being blamed on your setting.' });

/** Find the A1 / B / A2 (and optional A3) runs of an experiment (the earliest run of each step is used). */
export function pickProtectionRuns(experiment) {
  const runs = [...(experiment?.runs ?? [])].sort((x, y) => Date.parse(x.savedAt) - Date.parse(y.savedAt));
  const find = (id) => runs.find((r) => r.presetId === id) ?? null;
  return { baseline: find('protect-a1'), changed: find('protect-b'), repeat: find('protect-a2'), repeat2: find('protect-a3') };
}
