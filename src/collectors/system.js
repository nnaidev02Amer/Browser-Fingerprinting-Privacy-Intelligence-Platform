import { UnsupportedError } from '../utils/errors';

/**
 * Volatile collectors. Their values change between visits or sessions
 * (battery level, network quality, permission choices, timing), so they are
 * reported separately and NEVER enter the stable fingerprint hash.
 *
 * Deliberately not collected: WebRTC local IPs (modern browsers mask them with
 * mDNS names), motion/ambient sensors (need permission/gestures and return
 * empty data), and any third-party "network timing" probe.
 */

export const batteryCollector = {
  id: 'battery',
  label: 'Battery',
  requires: 'extended',
  timeoutMs: 2000,
  async collect() {
    if (typeof navigator.getBattery !== 'function') {
      throw new UnsupportedError('Battery Status API is not available (Chromium only)');
    }
    const battery = await navigator.getBattery();
    return {
      levelPercent: Math.round(battery.level * 100),
      charging: battery.charging,
      chargingTimeSeconds: Number.isFinite(battery.chargingTime) ? battery.chargingTime : null,
      dischargingTimeSeconds: Number.isFinite(battery.dischargingTime) ? battery.dischargingTime : null,
    };
  },
};

export const connectionCollector = {
  id: 'connection',
  label: 'Connection quality',
  requires: 'extended',
  timeoutMs: 1000,
  collect() {
    const c = navigator.connection;
    if (!c) throw new UnsupportedError('Network Information API is not available');
    return { effectiveType: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt, saveData: c.saveData };
  },
};

const PERMISSION_NAMES = ['geolocation', 'notifications', 'camera', 'microphone', 'midi', 'persistent-storage'];

export const permissionsCollector = {
  id: 'permissions',
  label: 'Permission states',
  requires: 'extended',
  timeoutMs: 3000,
  async collect() {
    if (!navigator.permissions?.query) throw new UnsupportedError('Permissions API is not available');
    // query() only reads the current state; it never prompts the user.
    const entries = await Promise.all(
      PERMISSION_NAMES.map(async (name) => {
        try {
          return [name, (await navigator.permissions.query({ name })).state];
        } catch {
          return [name, 'unsupported'];
        }
      }),
    );
    return Object.fromEntries(entries);
  },
};

export const mediaDevicesCollector = {
  id: 'mediaDevices',
  label: 'Media device counts',
  requires: 'extended',
  timeoutMs: 3000,
  async collect() {
    if (!navigator.mediaDevices?.enumerateDevices) throw new UnsupportedError('MediaDevices API is not available');
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Only counts per kind: device IDs and labels are persistent identifiers and are not kept.
    const counts = { audioinput: 0, audiooutput: 0, videoinput: 0 };
    for (const d of devices) counts[d.kind] = (counts[d.kind] || 0) + 1;
    return counts;
  },
};

export const automationCollector = {
  id: 'automation',
  label: 'Automation signals',
  requires: 'extended',
  timeoutMs: 1000,
  collect() {
    // Only the two reliable indicators. The old heuristics (missing image src,
    // fractional performance.now(), no window.chrome, ...) flagged normal
    // browsers and have been removed.
    return {
      webdriverFlag: navigator.webdriver === true,
      headlessUserAgent: /HeadlessChrome|PhantomJS/i.test(navigator.userAgent),
    };
  },
};

export const benchmarkCollector = {
  id: 'cpuBenchmark',
  label: 'CPU micro-benchmark',
  requires: 'extended',
  timeoutMs: 2000,
  collect() {
    const start = performance.now();
    let acc = 0;
    for (let i = 0; i < 200000; i += 1) acc += Math.sin(i) * Math.cos(i);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return { durationMs, checksum: Number.isFinite(acc) };
  },
};
