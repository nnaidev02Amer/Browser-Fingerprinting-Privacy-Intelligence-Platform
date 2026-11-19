import { SIGNALS, STABLE_SIGNAL_IDS } from '../config/signalCatalog';
import { stableStringify } from './stableStringify';

/**
 * Attribute-level comparison. An "attribute" is one collector's stable contribution (browser, screen,
 * canvas...). Comparing per attribute avoids the skew of per-path comparison, where one attribute with many
 * fields (WebGL) would count dozens of times.
 *
 * Everything here is MEASURED from two real collections: no estimates and no population assumptions.
 */

/** States of one attribute between an earlier and a later observation. */
export const ATTR = Object.freeze({
  UNCHANGED: 'unchanged',
  CHANGED: 'changed',
  LOST: 'lost', // readable before, not readable/stable now (unsupported, failed, randomised...)
  GAINED: 'gained', // not readable before, readable now
  UNAVAILABLE: 'unavailable', // not readable in either, for the same reason
  STATUS_CHANGED: 'status-changed', // not readable in either, for different reasons
});

/** The attribute that is derived from other attributes: reported, but never counted as independent. */
export const DERIVED_ATTRIBUTES = Object.freeze(['fingerprintjs']);

const STATUS_WORDS = {
  unsupported: 'unsupported by this browser',
  error: 'failed to collect',
  timeout: 'timed out',
  disabled: 'not collected',
  randomized: 'randomised (different results on repeated reads)',
  missing: 'absent',
};
export const describeStatus = (status) => STATUS_WORDS[status] ?? status;

/**
 * Read the state of one attribute's stable view. A collector that did not succeed contributes
 * `{ status }` only, so an object whose only key is `status` is "not readable".
 * @returns {{readable: boolean, status: string}}
 */
export function viewState(view) {
  if (view === undefined) return { readable: false, status: 'missing' };
  const keys = view !== null && typeof view === 'object' && !Array.isArray(view) ? Object.keys(view) : [];
  if (keys.length === 1 && keys[0] === 'status' && typeof view.status === 'string') return { readable: false, status: view.status };
  return { readable: true, status: 'ok' };
}

/** What a given state means for tracking, in plain language. Phrased as possibilities, never as guarantees. */
export function implication(state, id, { beforeStatus, afterStatus } = {}) {
  const label = SIGNALS[id]?.label ?? id;
  switch (state) {
    case ATTR.UNCHANGED:
      return `${label} was identical in both observations, so it stays usable as a linking attribute between them.`;
    case ATTR.CHANGED:
      return `${label} differs, so matching on this attribute exactly would fail. A matcher that tolerates a few changes could still link the two observations through the attributes that did not change.`;
    case ATTR.LOST:
      return `${label} is no longer readable as a stable value (${describeStatus(afterStatus)}), so it cannot support exact matching in the later observation. That does not by itself show better privacy: the other attributes may still link the observations.`;
    case ATTR.GAINED:
      return `${label} became readable (it was ${describeStatus(beforeStatus)} before), so it can now add to matching.`;
    case ATTR.UNAVAILABLE:
      return `${label} was not readable in either observation (${describeStatus(afterStatus)}), so it contributes nothing to matching here.`;
    default:
      return `${label} was not readable in either observation, for different reasons (${describeStatus(beforeStatus)} before, ${describeStatus(afterStatus)} now).`;
  }
}

/** Classify one attribute given its stable view in two observations. */
export function classifyAttribute(before, after) {
  const b = viewState(before);
  const a = viewState(after);
  if (b.readable && a.readable) return stableStringify(before) === stableStringify(after) ? ATTR.UNCHANGED : ATTR.CHANGED;
  if (b.readable && !a.readable) return ATTR.LOST;
  if (!b.readable && a.readable) return ATTR.GAINED;
  return b.status === a.status ? ATTR.UNAVAILABLE : ATTR.STATUS_CHANGED;
}

/**
 * Compare two observations attribute by attribute.
 * @param {object} older  stable signals of the earlier observation
 * @param {object} newer  stable signals of the later observation
 */
export function compareAttributes(older, newer, ids = STABLE_SIGNAL_IDS) {
  return ids.map((id) => {
    const state = classifyAttribute(older?.[id], newer?.[id]);
    const beforeStatus = viewState(older?.[id]).status;
    const afterStatus = viewState(newer?.[id]).status;
    return {
      id,
      label: SIGNALS[id].label,
      category: SIGNALS[id].category,
      derived: DERIVED_ATTRIBUTES.includes(id),
      state,
      before: older?.[id],
      after: newer?.[id],
      beforeStatus,
      afterStatus,
      implication: implication(state, id, { beforeStatus, afterStatus }),
    };
  });
}

/** Counts per state, excluding the derived (composite) attribute so it is not double counted. */
export function countStates(attributes) {
  const counts = Object.fromEntries(Object.values(ATTR).map((s) => [s, 0]));
  for (const a of attributes) if (!a.derived) counts[a.state] += 1;
  return counts;
}
