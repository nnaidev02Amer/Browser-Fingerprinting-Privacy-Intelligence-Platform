/**
 * Single source of truth for consent categories. The UI, the collector runner
 * and the documentation all derive from this list.
 *
 * Essential signals are not a toggle: they are the purpose of the tool and are
 * only read when the user presses "Collect". Every optional category is OFF by
 * default and can be revoked at any time.
 */

export const ESSENTIAL = Object.freeze({
  id: 'essential',
  title: 'Essential browser & device signals',
  summary: 'Read only when you press Collect. Processed locally and never uploaded.',
  what: [
    'Browser and operating system (User-Agent Client Hints, with User-Agent fallback)',
    'Screen resolution and colour depth, CPU core count, device memory (Chromium only), touch capability',
    'Time zone and language list',
    'Canvas, WebGL, audio and installed-font rendering results, plus a FingerprintJS identifier',
  ],
  why: 'These signals are combined into the configuration hash, which is the core of this demonstration.',
  where: 'Computed in your browser. Nothing is sent anywhere.',
  thirdParties: [],
});

export const OPTIONAL_CATEGORIES = Object.freeze([
  {
    id: 'extended',
    title: 'Extended device & environment details',
    summary: 'Battery, connection quality, permission states, media-device counts, automation flags and a CPU timing test.',
    what: [
      'Battery level and charging state (Chromium only)',
      'Connection type, downlink and round-trip time (Chromium only)',
      'Current permission states (read-only; never prompts)',
      'Number of cameras/microphones/speakers (counts only, no names or IDs)',
      'Whether the browser reports automation (webdriver/headless)',
      'A short CPU timing measurement',
    ],
    why: 'Shows additional signals that change between visits. They are reported but never included in the configuration hash.',
    where: 'Computed in your browser. Nothing is sent anywhere.',
    thirdParties: [],
  },
  {
    id: 'publicIp',
    title: 'Public IP address lookup',
    summary: 'Asks a third-party service which public IP address your connection uses.',
    what: ['Your public IP address, as seen by the service'],
    why: 'A browser cannot read its own public IP address. An external service must be asked.',
    where: 'A request leaves your browser. Only a plain GET request is made; no fingerprint data is included.',
    thirdParties: [{ name: 'ipify', host: 'api.ipify.org', url: 'https://www.ipify.org/' }],
  },
  {
    id: 'geolocation',
    title: 'Approximate location from IP (geolocation)',
    summary: 'Asks a third-party service to estimate your city and country from your IP address.',
    what: ['Approximate city, region, country, time zone and network provider derived from your IP address'],
    why: 'Shows what a website can infer about your location without any permission prompt.',
    where:
      'A request leaves your browser. The service sees your IP address (as any website does) and returns an estimate. No fingerprint data is included. This is independent of the public IP lookup.',
    thirdParties: [{ name: 'ipapi', host: 'ipapi.co', url: 'https://ipapi.co/' }],
  },
  {
    id: 'behavioral',
    title: 'Behavioural timing',
    summary: 'Mouse movement, click count, touch movement and keystroke timing while this page is open.',
    what: [
      'Mouse positions and speed, click count, touch movement',
      'Keystroke timing only: how long keys are held and the gap between presses',
      'Never recorded: which keys you press, or any text you type',
    ],
    why: 'Demonstrates behavioural biometrics. Reported separately, never hashed and never saved to history.',
    where: 'Computed in your browser. Nothing is sent anywhere.',
    thirdParties: [],
  },
]);

export const OPTIONAL_IDS = Object.freeze(OPTIONAL_CATEGORIES.map((c) => c.id));

export const CATEGORY_BY_ID = Object.freeze(Object.fromEntries(OPTIONAL_CATEGORIES.map((c) => [c.id, c])));
