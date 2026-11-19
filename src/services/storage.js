/**
 * Thin, failure-tolerant wrapper around localStorage. Storage can be missing
 * (privacy mode, blocked cookies), full, or hold corrupted data; none of that
 * may break the app. All functions accept a storage object so tests can inject
 * an in-memory one.
 */

/** @returns {Storage|null} localStorage, or null when blocked/unavailable. */
export function getDefaultStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = '__fpp_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null; // access denied (SecurityError) or storage disabled
  }
}

/** Result codes for failed writes. */
export const WRITE_ERROR = Object.freeze({ UNAVAILABLE: 'unavailable', QUOTA: 'quota', OTHER: 'other' });

function isQuotaError(err) {
  return (
    err?.name === 'QuotaExceededError'
    || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err?.code === 22
    || err?.code === 1014
  );
}

/**
 * @returns {{ok: true, value: any} | {ok: false, reason: 'missing'|'corrupted'|'unavailable'}}
 */
export function readJson(storage, key) {
  if (!storage) return { ok: false, reason: 'unavailable' };
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (raw === null) return { ok: false, reason: 'missing' };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: 'corrupted' };
  }
}

/** @returns {{ok: true} | {ok: false, reason: string}} */
export function writeJson(storage, key, value) {
  if (!storage) return { ok: false, reason: WRITE_ERROR.UNAVAILABLE };
  try {
    storage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: isQuotaError(err) ? WRITE_ERROR.QUOTA : WRITE_ERROR.OTHER };
  }
}

export function removeKey(storage, key) {
  try {
    storage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
