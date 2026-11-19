import { UnsupportedError } from '../utils/errors';

/** Screen, hardware, touch and locale collectors (all synchronous, no permissions). */

export const screenCollector = {
  id: 'screen',
  label: 'Screen',
  timeoutMs: 1000,
  collect() {
    const s = window.screen;
    if (!s) throw new UnsupportedError('window.screen is unavailable');
    return {
      width: s.width,
      height: s.height,
      colorDepth: s.colorDepth,
      pixelDepth: s.pixelDepth,
      // The values below change with zoom, window state or rotation.
      availWidth: s.availWidth,
      availHeight: s.availHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      orientation: s.orientation?.type ?? null,
    };
  },
  // min/max so rotating a phone does not change the hash.
  stableView: (data) => ({
    long: Math.max(data.width, data.height),
    short: Math.min(data.width, data.height),
    colorDepth: data.colorDepth,
  }),
};

export const hardwareCollector = {
  id: 'hardware',
  label: 'Hardware',
  timeoutMs: 1000,
  collect() {
    if (navigator.hardwareConcurrency === undefined && navigator.deviceMemory === undefined) {
      throw new UnsupportedError('Neither hardwareConcurrency nor deviceMemory is exposed');
    }
    return {
      cpuLogicalCores: navigator.hardwareConcurrency ?? null,
      // deviceMemory is Chromium-only, and capped/rounded by the browser (GB).
      deviceMemoryGB: navigator.deviceMemory ?? null,
      deviceMemorySupported: navigator.deviceMemory !== undefined,
    };
  },
  stableView: (data) => ({ cpuLogicalCores: data.cpuLogicalCores, deviceMemoryGB: data.deviceMemoryGB }),
};

export const touchCollector = {
  id: 'touch',
  label: 'Touch',
  timeoutMs: 1000,
  collect() {
    return {
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      touchEventSupported: 'ontouchstart' in window,
      pointerEventSupported: typeof window.PointerEvent !== 'undefined',
      // Primary-input traits can change on hybrid devices, so they are not hashed.
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? null,
      hoverCapable: window.matchMedia?.('(hover: hover)').matches ?? null,
    };
  },
  stableView: (data) => ({ maxTouchPoints: data.maxTouchPoints, touchEventSupported: data.touchEventSupported }),
};

export const localeCollector = {
  id: 'locale',
  label: 'Locale & timezone',
  timeoutMs: 1000,
  collect() {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    return {
      timeZone: resolved.timeZone,
      locale: resolved.locale,
      language: navigator.language,
      languages: [...(navigator.languages || [])],
      // The offset changes with daylight saving time, so it is not hashed.
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
    };
  },
  stableView: (data) => ({ timeZone: data.timeZone, languages: data.languages }),
};
