import { getDefaultStorage } from './storage';

/**
 * Weak, honest evidence about WHEN an observation was collected, so cross-session experiments are not based
 * only on what the user says they did. These flags are evidence, not proof:
 *
 *  - pageLoadId            random per page load, kept in memory only
 *  - browserSessionId      random id kept in sessionStorage (per tab; gone when the tab/browser session ends)
 *  - newBrowserSession     true if no browserSessionId existed when this page load first recorded
 *  - storageMarkerPresent  false if the localStorage marker did not exist: first use, or site data was cleared
 *
 * Limits: private windows, several tabs, blocked storage and manual edits all affect these flags. They are
 * only written when the user records an observation (never on page load), contain no fingerprint data, and
 * are deleted with the site data.
 */
export const SESSION_KEY = 'fpp.session.v1'; // sessionStorage
export const MARKER_KEY = 'fpp.marker.v1'; // localStorage

const newId = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const pageLoadId = newId();

export function getSessionStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Compute the flags from the given storages (pure apart from writing the two markers). */
export function readSessionEvidence(local, session, now = new Date()) {
  let browserSessionId = null;
  let newBrowserSession = null;
  try {
    const existing = session?.getItem(SESSION_KEY) ?? null;
    if (existing) {
      browserSessionId = existing;
      newBrowserSession = false;
    } else if (session) {
      browserSessionId = newId();
      session.setItem(SESSION_KEY, browserSessionId);
      newBrowserSession = true;
    }
  } catch {
    browserSessionId = null;
    newBrowserSession = null;
  }

  let storageMarkerPresent = null;
  try {
    if (local) {
      storageMarkerPresent = local.getItem(MARKER_KEY) !== null;
      if (!storageMarkerPresent) local.setItem(MARKER_KEY, JSON.stringify({ createdAt: now.toISOString() }));
    }
  } catch {
    storageMarkerPresent = null;
  }

  return { pageLoadId, browserSessionId, newBrowserSession, storageMarkerPresent };
}

// One evidence object per page load and storage: later recordings in the same page load reuse it, so
// "was the marker present" keeps meaning "at the start of this page load", not "after the first recording".
const cache = new WeakMap();
const NO_STORAGE = {};

/** Evidence for the current page load. `local` may be injected (tests); defaults to localStorage. */
export function getSessionEvidence(local = getDefaultStorage(), session = getSessionStorage()) {
  const key = local ?? NO_STORAGE;
  if (!cache.has(key)) cache.set(key, readSessionEvidence(local, session));
  return cache.get(key);
}
