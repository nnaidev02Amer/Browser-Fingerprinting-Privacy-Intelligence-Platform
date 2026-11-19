import { OPTIONAL_IDS } from '../config/consentCategories';
import { getDefaultStorage, readJson, removeKey, writeJson } from './storage';

export const CONSENT_KEY = 'fpp.consent.v1';
export const CONSENT_VERSION = 1;

/** Nothing optional is granted until the user chooses. */
export function defaultConsent() {
  return {
    acknowledged: false, // has the user reviewed the privacy choices at least once?
    updatedAt: null,
    choices: Object.fromEntries(OPTIONAL_IDS.map((id) => [id, false])),
  };
}

/**
 * Validate stored data. Unknown categories are ignored and any value that is
 * not literally `true` counts as "not granted", so malformed or tampered data
 * can only ever result in LESS collection, never more.
 */
export function sanitizeConsent(value) {
  const base = defaultConsent();
  if (!value || typeof value !== 'object' || value.version !== CONSENT_VERSION) return base;
  const stored = value.choices && typeof value.choices === 'object' ? value.choices : {};
  for (const id of OPTIONAL_IDS) base.choices[id] = stored[id] === true;
  base.acknowledged = value.acknowledged === true;
  base.updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : null;
  return base;
}

/** @returns {{consent: object, status: 'loaded'|'default'|'corrupted'|'unavailable'}} */
export function loadConsent(storage = getDefaultStorage()) {
  const result = readJson(storage, CONSENT_KEY);
  if (result.ok) return { consent: sanitizeConsent(result.value), status: 'loaded' };
  return { consent: defaultConsent(), status: result.reason === 'missing' ? 'default' : result.reason };
}

/** @returns {{ok: boolean, reason?: string}} */
export function saveConsent(consent, storage = getDefaultStorage()) {
  return writeJson(storage, CONSENT_KEY, { version: CONSENT_VERSION, ...consent });
}

export function clearConsent(storage = getDefaultStorage()) {
  return removeKey(storage, CONSENT_KEY);
}
