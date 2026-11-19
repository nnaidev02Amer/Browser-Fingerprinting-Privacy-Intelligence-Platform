import { SIGNALS, STABLE_SIGNAL_IDS } from '../config/signalCatalog';
import { DERIVED_ATTRIBUTES, viewState } from './attributes';
import { stableStringify } from './stableStringify';

/** The attributes compared. The derived FingerprintJS value is left out: it is computed from the others. */
export const COMPARABLE_ATTRIBUTES = Object.freeze(STABLE_SIGNAL_IDS.filter((id) => !DERIVED_ATTRIBUTES.includes(id)));

/** "Baseline (repeat 2/3)" and "Baseline" are the same setup: strip the repeat suffix the Laboratory adds. */
export const setupNameOf = (label) => String(label ?? '').replace(/\s*\(repeat \d+\/\d+\)\s*$/, '').trim();

/** Laboratory runs -> observations. Runs with the same name are repeat sessions of the same setup. */
export function observationsFromRuns(runs) {
  return runs.map((r) => ({ configLabel: setupNameOf(r.label), signals: r.signals }));
}

/** Protection test runs -> observations. A1, A2 and A3 are the same setup ("Baseline"); B is the changed setup. */
export function observationsFromProtection(experiment) {
  return (experiment?.runs ?? []).map((r) => ({
    configLabel: /^protect-a[123]$/.test(r.presetId) ? 'Baseline' : setupNameOf(r.label),
    signals: r.signals,
  }));
}

/**
 * QUALITATIVE distinguishability analysis over YOUR labelled observations.
 *
 * Question answered: in this experiment, which attributes could tell your configurations apart, and which
 * stayed constant within a configuration so they could link its sessions?
 *
 * It is MEASURED from your own data and deliberately has no percentages, entropy or "uniqueness": with a
 * handful of your own configurations there is no population, so those figures would be meaningless. The
 * roles below describe THIS experiment only; they say nothing about how rare any value is among other users.
 */
export const ROLE = Object.freeze({
  DISTINGUISHES: 'distinguishes',
  SHARED: 'shared',
  UNSTABLE: 'unstable',
  UNREADABLE: 'unreadable',
  INSUFFICIENT: 'insufficient',
});

export const ROLE_TEXT = Object.freeze({
  [ROLE.DISTINGUISHES]: 'Stable within each configuration, but different between configurations. In this experiment it can tell them apart and link sessions of the same configuration.',
  [ROLE.SHARED]: 'Stable within each configuration and identical across all of them. It links sessions but does not tell these configurations apart.',
  [ROLE.UNSTABLE]: 'Varied between sessions of the same configuration, so exact matching on it is unreliable.',
  [ROLE.UNREADABLE]: 'Not readable in the observations, so it contributes nothing here.',
  [ROLE.INSUFFICIENT]: 'Not enough data yet: record at least two configurations, and at least two sessions of one of them, to judge this attribute.',
});

/** Short display signature for a value: FNV-1a, for display and equality only (not a security hash). */
export function valueSignature(view) {
  const state = viewState(view);
  if (!state.readable) return `(${state.status})`;
  let h = 0x811c9dc5;
  for (const ch of stableStringify(view)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * @param {{configLabel: string, signals: object}[]} observations  labelled observations (sessions)
 */
export function analyzeDistinguishability(observations) {
  const groups = new Map();
  for (const o of observations) {
    const label = (o.configLabel ?? '').trim();
    if (!label) continue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(o);
  }
  const configs = [...groups.entries()].map(([label, list]) => ({ label, sessions: list.length }));
  const multiSession = configs.some((c) => c.sessions >= 2);

  const attributes = COMPARABLE_ATTRIBUTES.map((id) => {
    const perConfig = {};
    let unstable = false;
    let unreadable = true;
    for (const [label, list] of groups) {
      const signatures = list.map((o) => valueSignature(o.signals?.[id]));
      const readable = list.filter((o) => viewState(o.signals?.[id]).readable).length;
      if (readable > 0) unreadable = false;
      const distinct = new Set(signatures);
      perConfig[label] = { signatures: [...distinct], stable: distinct.size === 1 };
      if (distinct.size > 1) unstable = true;
    }
    const representative = [...groups.keys()].map((label) => perConfig[label].signatures[0]);
    const distinguishes = new Set(representative).size > 1;

    let role;
    if (groups.size === 0 || unreadable) role = ROLE.UNREADABLE;
    else if (unstable) role = ROLE.UNSTABLE;
    else if (groups.size < 2 || !multiSession) role = ROLE.INSUFFICIENT;
    else role = distinguishes ? ROLE.DISTINGUISHES : ROLE.SHARED;
    return { id, label: SIGNALS[id].label, role, perConfig };
  });

  // Which attributes separate each pair of configurations (using each configuration's first session).
  const labels = [...groups.keys()];
  const pairs = [];
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const differing = attributes.filter((a) => a.role !== ROLE.UNSTABLE && a.role !== ROLE.UNREADABLE && a.perConfig[labels[i]].signatures[0] !== a.perConfig[labels[j]].signatures[0]).map((a) => a.id);
      pairs.push({ a: labels[i], b: labels[j], differing, indistinguishable: differing.length === 0 });
    }
  }

  const counts = Object.fromEntries(Object.values(ROLE).map((r) => [r, attributes.filter((a) => a.role === r).length]));
  // ---- v2: what is SUFFICIENT to tell the configurations apart (deterministic, small data only)
  const separable = pairs.map((p, i) => ({ i, p })).filter(({ p }) => p.differing.length > 0);
  const covers = (id) => new Set(separable.filter(({ p }) => p.differing.includes(id)).map(({ i }) => i));
  const usable = attributes.filter((a) => a.role !== ROLE.UNSTABLE && a.role !== ROLE.UNREADABLE && covers(a.id).size > 0).map((a) => a.id);

  // Greedy set cover. Ties go to the attribute listed first in the catalog, so the result is reproducible.
  // It is a SMALL separating set, not guaranteed to be the smallest possible.
  const separatingSet = [];
  const covered = new Set();
  while (covered.size < separable.length) {
    let best = null;
    let bestGain = 0;
    for (const id of usable) {
      if (separatingSet.includes(id)) continue;
      const gain = [...covers(id)].filter((i) => !covered.has(i)).length;
      if (gain > bestGain) { best = id; bestGain = gain; }
    }
    if (!best) break;
    separatingSet.push(best);
    for (const i of covers(best)) covered.add(i);
  }

  // Attributes that separated exactly the same pairs are interchangeable in THIS data.
  const byPairs = new Map();
  for (const id of usable) {
    const key = [...covers(id)].sort((a, b) => a - b).join(',');
    if (!byPairs.has(key)) byPairs.set(key, []);
    byPairs.get(key).push(id);
  }
  const interchangeable = [...byPairs.values()].filter((g) => g.length > 1);

  const sufficient = configs.length >= 2 && multiSession;
  return {
    configs,
    attributes,
    pairs,
    counts,
    hasData: configs.length > 0,
    sufficient,
    separatingSet: sufficient ? separatingSet : [],
    interchangeable: sufficient ? interchangeable : [],
    inseparablePairs: sufficient ? pairs.filter((p) => p.indistinguishable).map((p) => [p.a, p.b]) : [],
  };
}
