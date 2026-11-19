// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserCollector, parseBrowserFromUA, parseOsFromUA } from '../../src/collectors/browser';

const UAS = {
  chromeWin: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', ['Chrome', '126'], ['Windows', '10 or 11']],
  edgeWin: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.81', ['Edge', '126'], ['Windows', '10 or 11']],
  firefoxLinux: ['Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', ['Firefox', '127'], ['Linux', null]],
  safariMac: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', ['Safari', '17'], ['macOS', '10.15.7']],
  safariIos: ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', ['Safari', '17'], ['iOS', '17.5']],
  chromeAndroid: ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', ['Chrome', '126'], ['Android', '14']],
  operaWin: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0', ['Opera', '111'], ['Windows', '10 or 11']],
};

describe('User-Agent fallback parsing', () => {
  it.each(Object.entries(UAS))('%s', (_name, [ua, [browser, major], [os, osVersion]]) => {
    const b = parseBrowserFromUA(ua);
    const o = parseOsFromUA(ua);
    expect([b.name, b.majorVersion, o.name, o.version]).toEqual([browser, major, os, osVersion]);
  });

  it('returns "Unknown" rather than throwing for unrecognised strings', () => {
    expect(parseBrowserFromUA('weird/1.0').name).toBe('Unknown');
    expect(parseOsFromUA('weird/1.0').name).toBe('Unknown');
  });
});

describe('browserCollector: Client Hints with fallback', () => {
  const setUserAgentData = (value) => Object.defineProperty(navigator, 'userAgentData', { value, configurable: true });

  afterEach(() => {
    delete navigator.userAgentData;
    vi.restoreAllMocks();
  });

  it('falls back to the User-Agent string when Client Hints are absent', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UAS.firefoxLinux[0]);
    const data = await browserCollector.collect();
    expect(data.source).toBe('userAgent');
    expect(data.browser.name).toBe('Firefox');
    expect(data.os.name).toBe('Linux');
  });

  it('uses Client Hints, ignoring GREASE brands and preferring the product over Chromium', async () => {
    setUserAgentData({
      brands: [{ brand: 'Not)A;Brand', version: '99' }, { brand: 'Chromium', version: '126' }, { brand: 'Microsoft Edge', version: '126' }],
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: async () => ({
        platform: 'Windows', platformVersion: '15.0.0', architecture: 'x86', bitness: '64', model: '',
        fullVersionList: [{ brand: 'Not)A;Brand', version: '99.0.0.0' }, { brand: 'Chromium', version: '126.0.1.1' }, { brand: 'Microsoft Edge', version: '126.0.1.1' }],
      }),
    });
    const data = await browserCollector.collect();
    expect(data.source).toBe('userAgentData');
    expect(data.browser).toMatchObject({ name: 'Edge', majorVersion: '126' });
    expect(data.os).toEqual({ name: 'Windows', version: '11' }); // platformVersion 15 => Windows 11
    expect(data.architecture).toBe('x86');
  });

  it('degrades to low-entropy hints when high-entropy values reject', async () => {
    setUserAgentData({
      brands: [{ brand: 'Google Chrome', version: '126' }],
      mobile: true,
      platform: 'Android',
      getHighEntropyValues: () => Promise.reject(new Error('blocked')),
    });
    const data = await browserCollector.collect();
    expect(data.source).toBe('userAgentData (low entropy)');
    expect(data.browser.name).toBe('Chrome');
    expect(data.deviceType).toBe('Mobile');
  });
});
