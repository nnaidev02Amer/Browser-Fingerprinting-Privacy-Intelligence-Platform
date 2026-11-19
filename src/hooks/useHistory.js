import { useCallback, useEffect, useState } from 'react';
import { getSessionEvidence } from '../services/sessionEvidence';
import { buildObservation } from '../utils/observation';
import {
  HISTORY_KEY,
  addSnapshot,
  clearHistory,
  createSnapshot,
  loadHistory,
  removeSnapshot,
} from '../services/historyStore';

/**
 * Local fingerprint history (localStorage only; never uploaded).
 * Failures (storage full, blocked, limit reached) are returned as `error`
 * codes for the UI to explain; they never throw.
 *
 * Every write starts from what is in storage right now, not from this tab's
 * possibly stale copy, so two open tabs cannot overwrite each other's snapshots.
 *
 * @param {Storage|null} [storage] injectable for tests
 */
export function useHistory(storage) {
  const [state, setState] = useState(() => loadHistory(storage));
  const [error, setError] = useState(null);

  /** Latest snapshots from storage; falls back to this tab's copy if storage cannot be read. */
  const latest = useCallback(() => {
    const fresh = loadHistory(storage);
    return fresh.status === 'ok' || fresh.status === 'empty' ? fresh.snapshots : state.snapshots;
  }, [storage, state.snapshots]);

  // History changed in another tab: refresh the list.
  useEffect(() => {
    const onStorage = ({ key: storageKey }) => {
      if (storageKey === null || storageKey === HISTORY_KEY) setState(loadHistory(storage));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storage]);

  const save = useCallback(
    (report) => {
      const observation = buildObservation(report, getSessionEvidence(storage));
      const result = addSnapshot(latest(), createSnapshot(report, new Date(), observation), storage);
      setError(result.ok ? null : result.reason);
      if (result.ok) setState({ snapshots: result.snapshots, status: 'ok', dropped: 0 });
      return { ok: result.ok, reason: result.reason ?? null }; // reason returned directly: state updates are async
    },
    [latest, storage],
  );

  const remove = useCallback(
    (id) => {
      const result = removeSnapshot(latest(), id, storage);
      setError(result.ok ? null : result.reason);
      if (result.ok) setState((s) => ({ ...s, snapshots: result.snapshots, status: result.snapshots.length ? 'ok' : 'empty' }));
    },
    [latest, storage],
  );

  const clear = useCallback(() => {
    clearHistory(storage);
    setError(null);
    setState({ snapshots: [], status: 'empty', dropped: 0 });
  }, [storage]);

  return { snapshots: state.snapshots, status: state.status, dropped: state.dropped, error, save, remove, clear };
}
