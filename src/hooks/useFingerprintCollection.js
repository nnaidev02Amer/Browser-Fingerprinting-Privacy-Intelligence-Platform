import { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_COLLECTORS } from '../collectors';
import { runCollectors } from '../collectors/runner';
import { OPTIONAL_IDS } from '../config/consentCategories';
import { buildReport, redactRevokedCategory } from '../utils/fingerprint';

const IDLE = { status: 'idle', progress: { done: 0, total: ALL_COLLECTORS.length }, report: null, error: null };

const newControllers = () => Object.fromEntries(OPTIONAL_IDS.map((id) => [id, new AbortController()]));
const abortAll = (controllers) => Object.values(controllers ?? {}).forEach((c) => c.abort());

/**
 * Runs every collector (concurrently, each isolated and time-limited) and
 * builds the report. Collectors whose consent category is not granted are
 * reported as `disabled` and are NOT executed, so no API call and no network
 * request is made for them.
 *
 * Revocation while a run is in progress (`redact(category)`):
 *  - the category's AbortController is aborted: its collectors are cancelled,
 *    a pending request is aborted, and the run does not wait for it;
 *  - the category is remembered for the rest of the run, so even if consent is
 *    granted again before the run ends, nothing collected under the revoked
 *    consent is kept or published;
 *  - behavioural data is not read once that category is revoked.
 * A request that has already left the browser cannot be recalled; its response
 * is discarded.
 */
export function useFingerprintCollection() {
  const [state, setState] = useState(IDLE);
  const runIdRef = useRef(0);
  const controllersRef = useRef(null); // category -> AbortController, for the current run
  const revokedRef = useRef(new Set()); // categories revoked during the current run

  // Ignore results that arrive after unmount, and stop anything still running.
  useEffect(() => () => {
    runIdRef.current += 1;
    abortAll(controllersRef.current);
  }, []);

  /**
   * @param {() => Record<string, boolean>} getChoices  returns the CURRENT choices
   * @param {() => object} getBehavioral  returns a behavioural summary (only used if consented)
   */
  const collect = useCallback(async (getChoices, getBehavioral) => {
    const runId = ++runIdRef.current;
    const isCurrent = () => runId === runIdRef.current;

    abortAll(controllersRef.current); // a superseded run must not keep requests alive
    const controllers = newControllers();
    controllersRef.current = controllers;
    revokedRef.current = new Set();

    const choicesAtStart = { ...getChoices() };
    const stillConsented = (id) => choicesAtStart[id] === true && getChoices()[id] === true && !revokedRef.current.has(id);

    setState({ ...IDLE, status: 'collecting' });
    try {
      const signals = Object.fromEntries(Object.entries(controllers).map(([id, c]) => [id, c.signal]));
      const results = await runCollectors(
        ALL_COLLECTORS,
        choicesAtStart,
        (done, total) => {
          if (isCurrent()) setState((s) => ({ ...s, progress: { done, total } }));
        },
        { signals },
      );

      const behavioral = stillConsented('behavioral') ? getBehavioral() : null;
      let report = await buildReport(results, { behavioral, choices: choicesAtStart });

      // Anything revoked at any point during the run (even if re-granted since) is removed before publishing.
      for (const id of OPTIONAL_IDS) {
        if (choicesAtStart[id] === true && !stillConsented(id)) report = redactRevokedCategory(report, id);
      }

      if (!isCurrent()) return null; // superseded or unmounted: this run's result is not published
      setState({ status: 'done', progress: { done: results.length, total: results.length }, report, error: null });
      return report; // lets callers (the Laboratory) use the finished report of exactly this run
    } catch (err) {
      if (isCurrent()) setState({ ...IDLE, status: 'error', error: err?.message || 'Unexpected error while collecting data.' });
      return null;
    }
  }, []);

  /** Consent for `categoryId` was revoked: cancel its work and remove its data from the result on screen. */
  const redact = useCallback((categoryId) => {
    revokedRef.current.add(categoryId);
    controllersRef.current?.[categoryId]?.abort();
    setState((s) => (s.report ? { ...s, report: redactRevokedCategory(s.report, categoryId) } : s));
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    abortAll(controllersRef.current);
    setState(IDLE);
  }, []);

  return { ...state, collect, redact, reset };
}
