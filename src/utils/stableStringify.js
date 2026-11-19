/**
 * Deterministic JSON serialisation: object keys are sorted recursively, so two
 * structurally equal values always produce the same string (and the same hash)
 * regardless of key insertion order.
 *
 * - `undefined` properties are dropped (like JSON.stringify).
 * - Non-finite numbers (NaN, ±Infinity) become strings instead of silently
 *   turning into `null`.
 * - Typed arrays are serialised as plain arrays.
 */
export function stableStringify(value) {
  return JSON.stringify(normalise(value));
}

function normalise(value) {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value, normalise);
  if (Array.isArray(value)) return value.map(normalise);

  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) out[key] = normalise(value[key]);
  }
  return out;
}
