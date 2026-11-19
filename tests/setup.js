// Shared test setup.
//
// jsdom replaces Node's Web Crypto and TextEncoder with versions whose typed
// arrays are from a different realm, which makes `crypto.subtle.digest` reject
// them. Restore Node's own implementations so hashing behaves as in a browser
// secure context.
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
globalThis.TextEncoder = TextEncoder;
