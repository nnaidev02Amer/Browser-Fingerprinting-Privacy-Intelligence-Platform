import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATUS, runCollector, runCollectors } from '../../src/collectors/runner';
import { IPAPI_URL, IPIFY_URL, lookupGeolocation, lookupPublicIp } from '../../src/services/ipGeo';
import { CancelledError } from '../../src/utils/errors';

afterEach(() => vi.unstubAllGlobals());

describe('runner: cancellation by consent category', () => {
  const gated = (requires, collect) => ({ id: requires, label: requires, requires, timeoutMs: 5000, collect });

  it('passes the category signal to the collector', async () => {
    const seen = [];
    const controller = new AbortController();
    await runCollectors([gated('publicIp', ({ signal }) => { seen.push(signal); return 1; })], { publicIp: true }, undefined, { signals: { publicIp: controller.signal } });
    expect(seen[0]).toBe(controller.signal);
  });

  it('does not even start a collector whose signal is already aborted, even if choices say true', async () => {
    const collect = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const [r] = await runCollectors([gated('publicIp', collect)], { publicIp: true }, undefined, { signals: { publicIp: controller.signal } });
    expect(collect).not.toHaveBeenCalled();
    expect(r.status).toBe(STATUS.DISABLED);
    expect(r.reason).toMatch(/revoked/);
  });

  it('settles promptly as "disabled" when aborted mid-run, even if the collector ignores the signal', async () => {
    const controller = new AbortController();
    const hung = gated('publicIp', () => new Promise(() => {})); // never settles, ignores the signal
    const running = runCollector(hung, { signal: controller.signal });
    controller.abort();
    const r = await running;
    expect(r.status).toBe(STATUS.DISABLED);
    expect(r.reason).toMatch(/revoked/);
  });

  it('discards a result that arrives after the abort', async () => {
    const controller = new AbortController();
    let resolve;
    const late = gated('publicIp', () => new Promise((r) => { resolve = r; }));
    const running = runCollector(late, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 0)); // let the collector actually start (and capture `resolve`)
    controller.abort();
    resolve({ ip: 'SECRET' });
    const r = await running;
    expect(r.data).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });

  it("aborting one category's signal does not affect another category", async () => {
    const a = new AbortController();
    const b = new AbortController();
    a.abort();
    const results = await runCollectors(
      [gated('publicIp', () => 'ip'), gated('geolocation', () => 'geo')],
      { publicIp: true, geolocation: true },
      undefined,
      { signals: { publicIp: a.signal, geolocation: b.signal } },
    );
    expect(results.map((r) => r.status)).toEqual([STATUS.DISABLED, STATUS.OK]);
  });

  it('essential collectors ignore category signals', async () => {
    const [r] = await runCollectors([{ id: 'e', label: 'e', collect: () => 'ok' }], {}, undefined, { signals: { publicIp: AbortSignal.abort() } });
    expect(r.status).toBe(STATUS.OK);
  });
});

describe('ipGeo: cancellation', () => {
  const hangingFetch = () => vi.fn((_url, { signal }) => new Promise((_res, rej) => {
    signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));

  it.each([
    ['public IP', lookupPublicIp, IPIFY_URL],
    ['geolocation', lookupGeolocation, IPAPI_URL],
  ])('%s: makes NO request when consent was already revoked', async (_n, lookup) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(lookup({ signal: AbortSignal.abort() })).rejects.toBeInstanceOf(CancelledError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['public IP', lookupPublicIp, IPIFY_URL],
    ['geolocation', lookupGeolocation, IPAPI_URL],
  ])('%s: aborts the in-flight request on revocation and reports cancellation, not a timeout', async (_n, lookup, url) => {
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const pending = lookup({ signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(url);
    controller.abort();
    const err = await pending.catch((e) => e);
    expect(err).toBeInstanceOf(CancelledError);
    expect(err.message).not.toMatch(/timed out/);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
