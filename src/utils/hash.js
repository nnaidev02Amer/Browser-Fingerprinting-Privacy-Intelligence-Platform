import { HashUnavailableError } from './errors';
import { stableStringify } from './stableStringify';

/** True when native Web Crypto SHA-256 can be used (secure contexts only). */
export function isHashSupported() {
  return typeof globalThis.crypto?.subtle?.digest === 'function';
}

/**
 * SHA-256 of a string, as lowercase hex, using native Web Crypto.
 * Always async: callers must `await` it.
 * @throws {HashUnavailableError} when crypto.subtle is unavailable.
 */
export async function sha256Hex(text) {
  if (!isHashSupported()) throw new HashUnavailableError();
  const bytes = new TextEncoder().encode(text);
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

/** SHA-256 of raw bytes (ArrayBuffer or typed array), as lowercase hex. */
export async function sha256HexOfBytes(bytes) {
  if (!isHashSupported()) throw new HashUnavailableError();
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

/** SHA-256 of the canonical (key-sorted) JSON form of any value. */
export function sha256OfValue(value) {
  return sha256Hex(stableStringify(value));
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}
