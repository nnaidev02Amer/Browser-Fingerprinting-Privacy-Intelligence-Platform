import { describe, expect, it } from 'vitest';
import { HashUnavailableError, TimeoutError } from '../../src/utils/errors';
import { isHashSupported, sha256Hex, sha256OfValue } from '../../src/utils/hash';
import { stableStringify } from '../../src/utils/stableStringify';
import { withTimeout } from '../../src/utils/timeout';

describe('stableStringify', () => {
  it('does not depend on key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      stableStringify({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }),
    );
  });

  it('keeps non-finite numbers visible instead of turning them into null', () => {
    expect(stableStringify({ x: -Infinity })).toBe('{"x":"-Infinity"}');
    expect(stableStringify({ x: NaN })).toBe('{"x":"NaN"}');
  });

  it('serialises typed arrays as arrays (not as objects of indices)', () => {
    expect(stableStringify({ a: new Float32Array([1, 2]) })).toBe('{"a":[1,2]}');
  });

  it('drops undefined properties', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('SHA-256 (Web Crypto)', () => {
  it('matches the known test vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('resolves to a string, never a pending Promise (regression: un-awaited hash serialised as {})', async () => {
    const hash = await sha256OfValue({ a: 1 });
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify({ hash })).toBe(`{"hash":"${hash}"}`);
  });

  it('reports a typed error in an insecure context (no crypto.subtle)', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(isHashSupported()).toBe(false);
      await expect(sha256Hex('x')).rejects.toBeInstanceOf(HashUnavailableError);
      await expect(sha256Hex('x')).rejects.toThrow(/secure context/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});

describe('withTimeout', () => {
  it('rejects a promise that never settles', async () => {
    await expect(withTimeout(new Promise(() => {}), 30, 'Hang')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('passes through a value that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 500)).resolves.toBe(7);
  });
});
