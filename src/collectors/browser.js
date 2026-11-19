import { withTimeout } from '../utils/timeout';

const GREASE_BRAND = /not.?a.?brand|not\)a;brand|^$/i;
const HIGH_ENTROPY_HINTS = ['platform', 'platformVersion', 'architecture', 'bitness', 'model', 'fullVersionList'];

// ---------------------------------------------------------------- UA parsing

/** Browser name + version from the classic User-Agent string. Order matters. */
export function parseBrowserFromUA(ua) {
  const rules = [
    ['Edge', /\bEdgA?\/([\d.]+)/],
    ['Opera', /\bOPR\/([\d.]+)/],
    ['Samsung Internet', /\bSamsungBrowser\/([\d.]+)/],
    ['Firefox', /\b(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /\b(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /\bVersion\/([\d.]+).*\bSafari\//],
  ];
  for (const [name, re] of rules) {
    const m = ua.match(re);
    if (m) return { name, version: m[1], majorVersion: m[1].split('.')[0] };
  }
  return { name: 'Unknown', version: null, majorVersion: null };
}

/** Operating system name + version from the classic User-Agent string. */
export function parseOsFromUA(ua) {
  let m;
  if ((m = ua.match(/Windows NT ([\d.]+)/))) {
    // The UA reports "10.0" for both Windows 10 and 11, so it cannot tell them apart.
    return { name: 'Windows', version: m[1] === '10.0' ? '10 or 11' : m[1] };
  }
  if ((m = ua.match(/Android ([\d.]+)/))) return { name: 'Android', version: m[1] };
  if ((m = ua.match(/(?:iPhone|iPad|iPod).*? OS ([\d_]+)/))) return { name: 'iOS', version: m[1].replace(/_/g, '.') };
  if ((m = ua.match(/Mac OS X ([\d_.]+)/))) return { name: 'macOS', version: m[1].replace(/_/g, '.') };
  if (/CrOS/.test(ua)) return { name: 'ChromeOS', version: null };
  if (/Linux/.test(ua)) return { name: 'Linux', version: null };
  return { name: 'Unknown', version: null };
}

// ----------------------------------------------------- Client Hints parsing

function browserFromBrands(list) {
  const real = (list || []).filter((b) => !GREASE_BRAND.test(b.brand));
  // "Chromium" is the engine; prefer the specific product brand (Edge, Opera, ...).
  const pick = real.find((b) => b.brand !== 'Chromium') || real[0];
  if (!pick) return null;
  const name = pick.brand.replace(/^Microsoft Edge$/, 'Edge').replace(/^Google Chrome$/, 'Chrome');
  return { name, version: pick.version, majorVersion: String(pick.version).split('.')[0] };
}

function osFromHints(platform, platformVersion) {
  const name = platform || 'Unknown';
  let version = platformVersion || null;
  // For Windows, platformVersion 13+ means Windows 11 (UA-CH is the only reliable way to tell).
  if (platform === 'Windows' && platformVersion) {
    version = parseInt(platformVersion.split('.')[0], 10) >= 13 ? '11' : '10';
  }
  return { name, version };
}

function deviceType(ua, mobileHint) {
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (mobileHint ?? /Mobi|iPhone|Android.*Mobile/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

// ---------------------------------------------------------------- collector

export const browserCollector = {
  id: 'browser',
  label: 'Browser & OS',
  timeoutMs: 2000,
  async collect() {
    const ua = navigator.userAgent;
    const fallback = { browser: parseBrowserFromUA(ua), os: parseOsFromUA(ua) };
    const uaData = navigator.userAgentData;

    if (!uaData) {
      return {
        source: 'userAgent',
        ...fallback,
        deviceType: deviceType(ua),
        architecture: null,
        bitness: null,
        model: null,
        userAgent: ua,
      };
    }

    // High-entropy hints can reject or be slow; fall back to the low-entropy
    // fields (and finally the UA string) instead of failing the collector.
    let hints = {};
    try {
      hints = await withTimeout(uaData.getHighEntropyValues(HIGH_ENTROPY_HINTS), 1500, 'Client Hints');
    } catch {
      /* low-entropy data below is still usable */
    }

    const browser = browserFromBrands(hints.fullVersionList) || browserFromBrands(uaData.brands) || fallback.browser;
    const os = uaData.platform ? osFromHints(hints.platform || uaData.platform, hints.platformVersion) : fallback.os;

    return {
      source: hints.platform ? 'userAgentData' : 'userAgentData (low entropy)',
      browser,
      os,
      deviceType: deviceType(ua, uaData.mobile),
      architecture: hints.architecture || null,
      bitness: hints.bitness || null,
      model: hints.model || null,
      userAgent: ua,
    };
  },
  // Only identity that is stable across browser updates: product and OS names
  // and device class. Exact versions change on every update, and architecture
  // exists only when high-entropy hints resolve, so both are excluded.
  stableView: (data) => ({
    browser: data.browser.name,
    os: data.os.name,
    deviceType: data.deviceType,
  }),
};
