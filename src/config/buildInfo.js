/* global __APP_VERSION__, __FPJS_VERSION__ */
/**
 * Versions recorded in exports so a result states what produced it. They are injected at build time from
 * package.json and the installed FingerprintJS package (see vite.config.js). Plain Node (the bundle
 * verifier) has no injection, so the values fall back to "unknown" rather than guessing.
 */
export const APP_NAME = 'Browser Fingerprinting & Privacy Intelligence Platform';
export const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'unknown' : __APP_VERSION__;
export const FINGERPRINTJS_VERSION = typeof __FPJS_VERSION__ === 'undefined' ? 'unknown' : __FPJS_VERSION__;
