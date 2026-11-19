import { STABLE_SIGNAL_IDS } from '../config/signalCatalog';
import { DERIVED_ATTRIBUTES, viewState } from './attributes';
import { valueSignature } from './distinguishability';

/**
 * Repeatability of each attribute across your baseline runs, as COUNTS ("identical in k of m runs").
 * It is a count of your own runs, not a percentage and not a probability. With fewer than two baseline runs
 * the answer is "not tested", never "stable".
 *
 * @param {{signals: object}[]} baselineRuns  the runs that are meant to be identical (A1, A2, optional A3)
 */
export function baselineStability(baselineRuns) {
  const m = baselineRuns.length;
  return STABLE_SIGNAL_IDS.filter((id) => !DERIVED_ATTRIBUTES.includes(id)).map((id) => {
    if (m < 2) return { id, runs: m, identical: null, status: 'not-tested' };
    const readable = baselineRuns.filter((r) => viewState(r.signals?.[id]).readable);
    if (readable.length === 0) return { id, runs: m, identical: 0, status: 'unreadable' };
    const groups = new Map();
    for (const r of readable) groups.set(valueSignature(r.signals[id]), (groups.get(valueSignature(r.signals[id])) ?? 0) + 1);
    const identical = Math.max(...groups.values());
    const allIdentical = identical === m && readable.length === m;
    return { id, runs: m, identical, status: allIdentical ? 'identical' : 'varied' };
  });
}
