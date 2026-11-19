import { audioCollector } from './audio';
import { browserCollector } from './browser';
import { canvasCollector } from './canvas';
import { hardwareCollector, localeCollector, screenCollector, touchCollector } from './device';
import { fingerprintJsCollector } from './fingerprintjs';
import { fontsCollector } from './fonts';
import { geolocationCollector, publicIpCollector } from './network';
import {
  automationCollector,
  batteryCollector,
  benchmarkCollector,
  connectionCollector,
  mediaDevicesCollector,
  permissionsCollector,
} from './system';
import { webglCollector } from './webgl';

/**
 * Collectors whose output feeds the stable fingerprint hash (each defines a
 * `stableView` that selects only its stable fields). Their full output is
 * still reported under `details`.
 */
export const STABLE_COLLECTORS = [
  fingerprintJsCollector,
  browserCollector,
  screenCollector,
  hardwareCollector,
  touchCollector,
  localeCollector,
  canvasCollector,
  webglCollector,
  audioCollector,
  fontsCollector,
];

/** Volatile collectors: reported separately, never hashed. */
export const VOLATILE_COLLECTORS = [
  publicIpCollector, // requires its own "publicIp" consent
  geolocationCollector, // requires its own "geolocation" consent
  connectionCollector,
  batteryCollector,
  permissionsCollector,
  mediaDevicesCollector,
  automationCollector,
  benchmarkCollector,
];

export const ALL_COLLECTORS = [...STABLE_COLLECTORS, ...VOLATILE_COLLECTORS];
