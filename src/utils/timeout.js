import { TimeoutError } from './errors';

/**
 * Race a promise against a timer. The timer is always cleared, and the
 * returned promise rejects with a TimeoutError if `ms` elapses first.
 *
 * Note: a timeout cannot cancel the underlying work; callers that own a
 * resource (a Worker, an AudioContext, ...) must release it themselves.
 */
export function withTimeout(promise, ms, label = 'Operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
