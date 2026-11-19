/**
 * Typed errors used by the collectors so the runner can report a meaningful
 * status ("unsupported", "timeout", "error") instead of a generic failure.
 */

/** Thrown by a collector when the browser does not offer the API it needs. */
export class UnsupportedError extends Error {
  constructor(reason = 'Not supported by this browser') {
    super(reason);
    this.name = 'UnsupportedError';
  }
}

/** Thrown when an asynchronous operation does not finish in time. */
export class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label} did not finish within ${ms} ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = ms;
  }
}

/** Thrown when a collector is cancelled because its consent category was revoked. */
export class CancelledError extends Error {
  constructor(reason = 'Cancelled: consent revoked') {
    super(reason);
    this.name = 'CancelledError';
  }
}

/** Thrown when Web Crypto (crypto.subtle) is unavailable, e.g. insecure context. */
export class HashUnavailableError extends Error {
  constructor(
    reason = 'Web Crypto (crypto.subtle) is unavailable. It requires a secure context: use https:// or http://localhost.',
  ) {
    super(reason);
    this.name = 'HashUnavailableError';
  }
}
