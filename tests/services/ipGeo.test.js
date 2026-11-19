import { afterEach, describe, expect, it, vi } from 'vitest';
import { geolocationCollector, publicIpCollector } from '../../src/collectors/network';
import { runCollectors } from '../../src/collectors/runner';
import { IPAPI_URL, IPIFY_URL, lookupGeolocation, lookupPublicIp } from '../../src/services/ipGeo';

const jsonResponse = (body, init = {}) => ({ ok: true, status: 200, json: async () => body, ...init });

afterEach(() => vi.unstubAllGlobals());

describe('lookupPublicIp (ipify)', () => {
  it('contacts exactly ipify with a plain, credential-free GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ip: '203.0.113.9' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupPublicIp()).resolves.toEqual({ ip: '203.0.113.9', provider: 'api.ipify.org' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(IPIFY_URL);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(init.body).toBeUndefined();
  });

  it('fails clearly on HTTP errors and malformed bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 503 })));
    await expect(lookupPublicIp()).rejects.toThrow(/HTTP 503/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ nope: 1 })));
    await expect(lookupPublicIp()).rejects.toThrow(/no address/);
  });
});

describe('lookupGeolocation (ipapi)', () => {
  it('contacts exactly ipapi, never ipify, and drops the IP field from its answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ip: '203.0.113.9', city: 'Testville', country_name: 'Testland', org: 'ISP', latitude: 1, longitude: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    const geo = await lookupGeolocation();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(IPAPI_URL);
    expect(geo).toMatchObject({ city: 'Testville', country: 'Testland', provider: 'ipapi.co' });
    expect(JSON.stringify(geo)).not.toContain('203.0.113.9');
  });

  it('surfaces ipapi in-band errors (rate limits arrive as HTTP 200 with error:true)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: true, reason: 'RateLimited' })));
    await expect(lookupGeolocation()).rejects.toThrow('RateLimited');
  });

  it('times out instead of hanging when the service never answers', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))));
      const pending = expect(lookupGeolocation()).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(5001);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('separate consent for IP and geolocation', () => {
  it('with neither consent, no request is made at all', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await runCollectors([publicIpCollector, geolocationCollector], { publicIp: false, geolocation: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('IP consent alone contacts only ipify', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ip: '203.0.113.9' }));
    vi.stubGlobal('fetch', fetchMock);
    await runCollectors([publicIpCollector, geolocationCollector], { publicIp: true, geolocation: false });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([IPIFY_URL]);
  });

  it('geolocation consent alone contacts only ipapi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ city: 'X' }));
    vi.stubGlobal('fetch', fetchMock);
    await runCollectors([publicIpCollector, geolocationCollector], { publicIp: false, geolocation: true });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([IPAPI_URL]);
  });

  it('a network failure becomes a "error" status, not an exception or a hang', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const [ip, geo] = await runCollectors([publicIpCollector, geolocationCollector], { publicIp: true, geolocation: true });
    expect([ip.status, geo.status]).toEqual(['error', 'error']);
  });
});
