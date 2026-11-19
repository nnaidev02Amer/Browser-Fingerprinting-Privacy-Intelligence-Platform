import { useCallback, useEffect, useState } from 'react';
import { getSessionEvidence } from '../services/sessionEvidence';
import { buildObservation } from '../utils/observation';
import {
  EXPERIMENTS_KEY,
  addExperiment,
  addRun,
  clearExperiments,
  createExperiment,
  createRun,
  loadExperiments,
  removeExperiment,
  removeRun,
} from '../services/experimentStore';

/**
 * Laboratory experiments (localStorage only; never uploaded). Every write starts from what is stored right
 * now, so several open tabs cannot overwrite each other. Failures are returned as codes, never thrown.
 *
 * @param {Storage|null} [storage] injectable for tests
 */
export function useExperiments(storage) {
  const [state, setState] = useState(() => loadExperiments(storage));
  const [error, setError] = useState(null);

  const latest = useCallback(() => {
    const fresh = loadExperiments(storage);
    return fresh.status === 'ok' || fresh.status === 'empty' ? fresh.experiments : state.experiments;
  }, [storage, state.experiments]);

  useEffect(() => {
    const onStorage = ({ key: storageKey }) => {
      if (storageKey === null || storageKey === EXPERIMENTS_KEY) setState(loadExperiments(storage));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storage]);

  const apply = useCallback((result) => {
    setError(result.ok ? null : result.reason);
    if (result.ok) setState({ experiments: result.experiments, status: result.experiments.length ? 'ok' : 'empty', dropped: 0 });
    return { ok: result.ok, reason: result.reason ?? null };
  }, []);

  /** Creates an experiment and returns `{ ok, reason, id }`. */
  const create = useCallback((name, protocol = 'general') => {
    const experiment = createExperiment(name, new Date(), protocol);
    const outcome = apply(addExperiment(latest(), experiment, storage));
    return { ...outcome, id: outcome.ok ? experiment.id : null };
  }, [apply, latest, storage]);

  const record = useCallback(
    (experimentId, report, { label, presetId }) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const observation = buildObservation(report, getSessionEvidence(storage));
      return apply(addRun(latest(), experimentId, createRun(report, { label, presetId }, new Date(), viewport, observation), storage));
    },
    [apply, latest, storage],
  );

  const deleteRun = useCallback((experimentId, runId) => apply(removeRun(latest(), experimentId, runId, storage)), [apply, latest, storage]);
  const deleteExperiment = useCallback((experimentId) => apply(removeExperiment(latest(), experimentId, storage)), [apply, latest, storage]);
  const clearAll = useCallback(() => {
    clearExperiments(storage);
    setError(null);
    setState({ experiments: [], status: 'empty', dropped: 0 });
  }, [storage]);

  return { experiments: state.experiments, status: state.status, dropped: state.dropped, error, create, record, deleteRun, deleteExperiment, clearAll };
}
