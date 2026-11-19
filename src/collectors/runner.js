import { CancelledError, TimeoutError, UnsupportedError } from '../utils/errors';
import { withTimeout } from '../utils/timeout';

/**
 * Collector result statuses.
 *  ok          – data collected
 *  unsupported – the browser does not offer the required API
 *  timeout     – the collector did not finish in time
 *  error       – the collector threw unexpectedly
 *  disabled    – not run because the user has not granted (or has revoked) consent
 */
export const STATUS = Object.freeze({
  OK: 'ok',
  UNSUPPORTED: 'unsupported',
  TIMEOUT: 'timeout',
  ERROR: 'error',
  DISABLED: 'disabled',
});

/** Human-readable labels used by the UI. */
export const STATUS_LABEL = Object.freeze({
  ok: 'Collected',
  unsupported: 'Unsupported',
  timeout: 'Timed out',
  error: 'Failed',
  disabled: 'Disabled',
});

export const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Run one collector in isolation. Never rejects and never hangs: every
 * outcome is converted into a `{ id, label, status, ... }` result object.
 */
export async function runCollector(collector, context = {}) {
  const { id, label, timeoutMs = DEFAULT_TIMEOUT_MS, collect } = collector;
  const { signal } = context;
  const startedAt = performance.now();
  const finish = (fields) => ({
    id,
    label,
    durationMs: Math.round(performance.now() - startedAt),
    ...fields,
  });

  // Settles as soon as the consent category is revoked, even if the collector
  // itself ignores the abort signal, so a revoked run never waits on (or keeps)
  // its result.
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    if (!signal) return;
    onAbort = () => reject(new CancelledError());
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  cancelled.catch(() => {}); // avoid an unhandled rejection when the collector wins the race

  try {
    const work = Promise.resolve().then(() => collect(context));
    const data = await withTimeout(signal ? Promise.race([work, cancelled]) : work, timeoutMs, label);
    return finish({ status: STATUS.OK, data });
  } catch (err) {
    if (err instanceof CancelledError) {
      return finish({ status: STATUS.DISABLED, reason: err.message });
    }
    if (err instanceof UnsupportedError) {
      return finish({ status: STATUS.UNSUPPORTED, reason: err.message });
    }
    if (err instanceof TimeoutError) {
      return finish({ status: STATUS.TIMEOUT, reason: err.message });
    }
    return finish({ status: STATUS.ERROR, reason: err?.message || String(err) });
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Run a list of collectors concurrently. Collectors whose `requires` consent
 * is not granted are reported as `skipped` and are NOT executed, so no API
 * call (and no network request) is made without consent.
 *
 * @param {Array} collectors  collector definitions
 * @param {Record<string, boolean>} choices  optional-category choices; a collector
 *   with `requires: '<category>'` runs only if `choices[category] === true`.
 *   Collectors without `requires` are essential and always run.
 * @param {(done: number, total: number, result: object) => void} [onProgress]
 * @param {{signals?: Record<string, AbortSignal>}} [options]  one AbortSignal per consent
 *   category. Aborting a category's signal (consent revoked) cancels that category's
 *   running collectors; an already-aborted signal prevents them from starting at all.
 */
export async function runCollectors(collectors, choices, onProgress, options = {}) {
  const total = collectors.length;
  let done = 0;

  const tasks = collectors.map(async (collector) => {
    const signal = collector.requires ? options.signals?.[collector.requires] : undefined;
    const notGranted = collector.requires && choices?.[collector.requires] !== true;
    const revoked = signal?.aborted === true;
    const result = notGranted || revoked
      ? {
        id: collector.id,
        label: collector.label,
        status: STATUS.DISABLED,
        durationMs: 0,
        reason: revoked ? 'Disabled: consent revoked' : `Disabled: "${collector.requires}" consent not granted`,
      }
      : await runCollector(collector, { signal });
    done += 1;
    onProgress?.(done, total, result);
    return result;
  });

  return Promise.all(tasks);
}
