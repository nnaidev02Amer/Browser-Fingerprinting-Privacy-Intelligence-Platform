import { CATEGORIES, SIGNALS, STABLE_SIGNAL_IDS, VARIABLE_SIGNAL_IDS } from '../config/signalCatalog';
import { selectCollector } from './reportView';

/**
 * Describe what a fingerprint is made of, using only what was actually collected in the report.
 * @returns {{signals: object[], groups: object[], totals: object}}
 */
export function buildComposition(report) {
  const signals = [...STABLE_SIGNAL_IDS, ...VARIABLE_SIGNAL_IDS].map((id) => {
    const meta = SIGNALS[id];
    const outcome = report ? selectCollector(report, id) : { status: 'disabled', reason: null };
    return {
      id,
      label: meta.label,
      category: meta.category,
      stable: meta.stable,
      status: outcome.status,
      reason: outcome.reason,
      inHash: meta.stable && outcome.status === 'ok',
    };
  });

  const groups = CATEGORIES.map((category) => {
    const members = signals.filter((s) => s.category === category.id);
    return {
      category,
      signals: members,
      total: members.length,
      collected: members.filter((s) => s.status === 'ok').length,
      inHash: members.filter((s) => s.inHash).length,
      stableTotal: members.filter((s) => s.stable).length,
    };
  }).filter((g) => g.total > 0);

  const stable = signals.filter((s) => s.stable);
  return {
    signals,
    groups,
    totals: {
      stableSignals: stable.length,
      stableCollected: stable.filter((s) => s.status === 'ok').length,
      variableSignals: signals.length - stable.length,
      variableCollected: signals.filter((s) => !s.stable && s.status === 'ok').length,
    },
  };
}
