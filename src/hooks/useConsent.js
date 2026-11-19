import { useCallback, useEffect, useState } from 'react';
import { OPTIONAL_IDS } from '../config/consentCategories';
import { CONSENT_KEY, loadConsent, saveConsent } from '../services/consentStore';

/**
 * Consent state, persisted in localStorage.
 *
 * - Every optional category defaults to OFF.
 * - Changes are saved immediately; revoking takes effect on the next render,
 *   so nothing in that category runs afterwards.
 * - If storage is unavailable the choices still work for this page view; they
 *   just are not remembered (`storageStatus` / `saveError` tell the UI).
 *
 * @param {Storage|null} [storage] injectable for tests; defaults to localStorage
 */
export function useConsent(storage) {
  const [state, setState] = useState(() => ({ ...loadConsent(storage), dirty: false }));
  const [saveError, setSaveError] = useState(null);

  // Persist after any user-driven change (never on first load).
  useEffect(() => {
    if (!state.dirty) return;
    const result = saveConsent(state.consent, storage);
    setSaveError(result.ok ? null : result.reason);
  }, [state, storage]);

  // Consent changed in ANOTHER tab of this site (including a revocation or a cleared
  // storage): adopt it here, so a revocation made anywhere takes effect everywhere.
  useEffect(() => {
    const onStorage = ({ key: storageKey }) => {
      if (storageKey !== null && storageKey !== CONSENT_KEY) return; // (a storage entry name, not a keyboard key)
      setState({ ...loadConsent(storage), dirty: false }); // dirty:false, so we do not write it back
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storage]);

  const update = useCallback((patch) => {
    setState((prev) => ({
      ...prev,
      dirty: true,
      consent: { ...prev.consent, updatedAt: new Date().toISOString(), ...patch(prev.consent) },
    }));
  }, []);

  const setChoice = useCallback(
    (id, value) => {
      if (!OPTIONAL_IDS.includes(id)) return;
      update((c) => ({ choices: { ...c.choices, [id]: value === true } }));
    },
    [update],
  );

  /** Mark the privacy choices as reviewed (ends the first-run screen). */
  const acknowledge = useCallback(() => update(() => ({ acknowledged: true })), [update]);

  /** Revoke every optional category at once. */
  const revokeAll = useCallback(
    () => update(() => ({ choices: Object.fromEntries(OPTIONAL_IDS.map((id) => [id, false])) })),
    [update],
  );

  return {
    choices: state.consent.choices,
    acknowledged: state.consent.acknowledged,
    updatedAt: state.consent.updatedAt,
    storageStatus: state.status,
    saveError,
    setChoice,
    acknowledge,
    revokeAll,
  };
}
