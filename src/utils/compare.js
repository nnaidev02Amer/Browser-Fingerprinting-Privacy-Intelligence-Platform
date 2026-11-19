import { stableStringify } from './stableStringify';

export const DIFF = Object.freeze({
  CHANGED: 'changed',
  UNCHANGED: 'unchanged',
  ADDED: 'added',
  REMOVED: 'removed',
});

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Flatten nested signals into `path -> value`. Objects are walked; arrays and
 * primitives are leaves (so a font list is compared as one value, not as
 * positions that shift when one font is added).
 */
export function flattenSignals(value, prefix = '', out = {}) {
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) flattenSignals(value[key], prefix ? `${prefix}.${key}` : key, out);
  } else if (prefix) {
    out[prefix] = value;
  }
  return out;
}

function arrayDelta(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;
  const prev = new Set(before.map(String));
  const next = new Set(after.map(String));
  return {
    addedItems: after.filter((v) => !prev.has(String(v))),
    removedItems: before.filter((v) => !next.has(String(v))),
  };
}

/**
 * Compare two sets of stable signals.
 * @param {object} older  signals of the earlier snapshot
 * @param {object} newer  signals of the later snapshot
 * @returns {{rows: object[], counts: Record<string, number>}}
 *   `added` = signal present only in `newer`; `removed` = present only in `older`.
 */
export function compareSignals(older, newer) {
  const a = flattenSignals(older);
  const b = flattenSignals(newer);
  const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

  const rows = paths.map((path) => {
    const inA = path in a;
    const inB = path in b;
    if (inA && !inB) return { path, status: DIFF.REMOVED, before: a[path], after: undefined };
    if (!inA && inB) return { path, status: DIFF.ADDED, before: undefined, after: b[path] };
    const same = stableStringify(a[path]) === stableStringify(b[path]);
    return {
      path,
      status: same ? DIFF.UNCHANGED : DIFF.CHANGED,
      before: a[path],
      after: b[path],
      ...(same ? {} : arrayDelta(a[path], b[path])),
    };
  });

  const counts = { [DIFF.CHANGED]: 0, [DIFF.UNCHANGED]: 0, [DIFF.ADDED]: 0, [DIFF.REMOVED]: 0 };
  for (const row of rows) counts[row.status] += 1;
  return { rows, counts };
}

/** Compare two snapshots; the earlier one is always treated as "before". */
export function compareSnapshots(first, second) {
  const [older, newer] = Date.parse(first.savedAt) <= Date.parse(second.savedAt) ? [first, second] : [second, first];
  // Hashes are only comparable when they were built from the same input definition.
  const versionMismatch = (older.hashInputVersion ?? null) !== (newer.hashInputVersion ?? null);
  return {
    older,
    newer,
    versionMismatch,
    sameHash: !versionMismatch && older.hash !== null && older.hash === newer.hash,
    ...compareSignals(older.signals, newer.signals),
  };
}
