/**
 * Knowledge base describing every signal this application can collect.
 *
 * IMPORTANT: everything here is *qualitative and editorial*. It explains what each signal discloses and
 * why it changes. It is NOT measured against any population, and it contains no entropy values, scores
 * or risk percentages. The "exposure class" rubric below is how signals are grouped, nothing more.
 */

/** Visual/semantic groups. `color` is used together with text labels, never alone. */
export const CATEGORIES = Object.freeze([
  { id: 'browser', label: 'Browser & operating system', short: 'Browser & OS', color: '#8fb88a' },
  { id: 'hardware', label: 'Hardware', short: 'Hardware', color: '#c9a27e' },
  { id: 'display', label: 'Display', short: 'Display', color: '#8fa3ad' },
  { id: 'graphics', label: 'Graphics', short: 'Graphics', color: '#d9a441' },
  { id: 'rendering', label: 'Rendering & fonts', short: 'Rendering', color: '#6fb29a' },
  { id: 'locale', label: 'Language & time zone', short: 'Locale', color: '#cf7f8f' },
  { id: 'composite', label: 'Composite identifier', short: 'Composite', color: '#a8a59a' },
  { id: 'network', label: 'Network (optional)', short: 'Network', color: '#d08a6a' },
  { id: 'environment', label: 'Environment (optional)', short: 'Environment', color: '#9aa86a' },
]);

export const CATEGORY_BY_ID = Object.freeze(Object.fromEntries(CATEGORIES.map((c) => [c.id, c])));

/**
 * Exposure classes: a documented grouping, not a score.
 *  shared  – many browsers/devices report the same value, so it says little about one setup.
 *  narrows – values differ between systems, so the signal helps tell configurations apart.
 *  reveals – discloses something about your real-world setting (region, language, network, location).
 */
export const EXPOSURE_CLASSES = Object.freeze({
  shared: {
    label: 'Widely shared',
    meaning: 'Many browsers and devices report the same value, so on its own it says little about one setup.',
  },
  narrows: {
    label: 'Narrows configuration',
    meaning: 'Values differ between systems, so the signal helps tell one configuration from another.',
  },
  reveals: {
    label: 'Reveals context',
    meaning: 'Discloses something about your real-world setting: region, language, network or location.',
  },
});

export const EXPOSURE_RUBRIC_NOTE =
  'These groups are an editorial classification of what each signal discloses. They are not measured on any '
  + 'population and are not a risk score, probability or entropy value.';

/**
 * Per-signal knowledge. Keys match collector ids.
 *  stable       – feeds the configuration hash
 *  hashed       – what exactly is hashed (stable signals only)
 *  excluded     – what is deliberately NOT hashed and why
 *  changesWhen  – realistic causes of change (used to explain differences between runs)
 */
export const SIGNALS = Object.freeze({
  fingerprintjs: {
    label: 'FingerprintJS identifier',
    category: 'composite',
    stable: true,
    exposureClass: 'narrows',
    exposes: 'A hash that a third-party library computes from its own set of browser attributes.',
    identifies: 'It bundles many attributes into one value, so any change to one of them (including time zone, screen or canvas) changes it. It is a convenient comparison key, not an independent signal.',
    hashed: 'The visitorId value.',
    excluded: 'Library version and confidence score (metadata).',
    changesWhen: ['any internal component changes (time zone, screen, fonts, canvas, audio, languages and more)', 'display scaling or pixel-ratio changes (observed when testing this app in Chrome, even though this app\'s own screen signal ignores them)', 'a FingerprintJS version update'],
  },
  browser: {
    label: 'Browser & operating system',
    category: 'browser',
    stable: true,
    exposureClass: 'shared',
    exposes: 'Browser name and version, operating system, and device class (desktop/mobile/tablet).',
    identifies: 'Common values shared by very many users. The exact version narrows it a little, which is why the version is shown but not hashed.',
    hashed: 'Browser name, operating-system name and device class.',
    excluded: 'Exact versions and CPU architecture: they change with every update, or exist only when Client Hints resolve.',
    changesWhen: ['switching browser or operating system', 'a browser update (version only; not hashed)'],
  },
  screen: {
    label: 'Screen',
    category: 'display',
    stable: true,
    exposureClass: 'narrows',
    exposes: 'Screen resolution and colour depth.',
    identifies: 'Resolution is shared by many devices, but unusual or multi-monitor resolutions stand out more.',
    hashed: 'Longer side, shorter side (so rotation does not matter) and colour depth.',
    excluded: 'Available area, pixel ratio (changes with browser zoom) and orientation.',
    changesWhen: ['changing display resolution or connecting a different monitor', 'moving the window to another screen'],
  },
  hardware: {
    label: 'Processor & memory',
    category: 'hardware',
    stable: true,
    exposureClass: 'narrows',
    exposes: 'Number of logical CPU cores and (Chromium only) an approximate amount of device memory.',
    identifies: 'Core counts cluster around a few common values; combined with other signals they help distinguish machines.',
    hashed: 'Logical core count and device memory.',
    excluded: 'Nothing else is read.',
    changesWhen: ['using a different device', 'a browser that caps or hides these values (privacy modes)'],
  },
  touch: {
    label: 'Touch support',
    category: 'hardware',
    stable: true,
    exposureClass: 'shared',
    exposes: 'Whether touch input is available and how many simultaneous touch points are supported.',
    identifies: 'Mostly separates touch devices from non-touch devices.',
    hashed: 'Maximum touch points and touch-event support.',
    excluded: 'Primary pointer type and hover capability (they can change on hybrid devices).',
    changesWhen: ['using a different device', 'switching a hybrid device between modes'],
  },
  locale: {
    label: 'Language & time zone',
    category: 'locale',
    stable: true,
    exposureClass: 'reveals',
    exposes: 'The time-zone name and the ordered list of preferred languages.',
    identifies: 'Reveals your region and language preferences. The combination of a time zone and an unusual language list can be distinctive.',
    hashed: 'Time-zone name and language list.',
    excluded: 'UTC offset (it changes with daylight saving time).',
    changesWhen: ['changing the operating-system time zone', 'changing the browser or system language list', 'travelling'],
  },
  canvas: {
    label: 'Canvas rendering',
    category: 'rendering',
    stable: true,
    exposureClass: 'narrows',
    exposes: 'How your browser, graphics driver and fonts draw a test image.',
    identifies: 'Tiny differences in anti-aliasing, font smoothing and drivers make the result differ between systems, while staying the same on one system.',
    hashed: 'A SHA-256 hash of the rendered pixels (left out if the browser returns different results on repeated reads).',
    excluded: 'A Web Worker render, shown for comparison only.',
    changesWhen: ['a graphics-driver or browser update', 'changing system font rendering', 'a browser that randomises canvas output'],
  },
  webgl: {
    label: 'WebGL graphics',
    category: 'graphics',
    stable: true,
    exposureClass: 'narrows',
    exposes: 'Graphics vendor and renderer (often the GPU model), supported extensions and numeric limits.',
    identifies: 'The GPU model and driver capabilities are strong configuration hints, especially when the unmasked renderer is exposed.',
    hashed: 'Vendor, renderer, version, shader precision, supported extensions and limits.',
    excluded: 'Nothing else is read.',
    changesWhen: ['a graphics-driver update', 'using a different GPU or browser', 'a browser that hides the unmasked renderer'],
  },
  audio: {
    label: 'Audio processing',
    category: 'rendering',
    stable: true,
    exposureClass: 'narrows',
    exposes: 'How your browser processes a short synthetic audio signal (rendered silently in memory).',
    identifies: 'Floating-point and audio-stack differences produce small result differences between browser builds.',
    hashed: 'A hash of the processed samples and the sample rate.',
    excluded: 'A raw sample sum (shown for information only).',
    changesWhen: ['a browser update', 'using a different browser or audio stack'],
  },
  fonts: {
    label: 'Installed fonts',
    category: 'rendering',
    stable: true,
    exposureClass: 'narrows',
    exposes: 'Which fonts from a fixed candidate list are installed, detected through text-width differences.',
    identifies: 'Installed fonts depend on the operating system and on software you installed, so the list can be quite distinctive.',
    hashed: 'The sorted list of detected fonts.',
    excluded: 'Nothing else is read.',
    changesWhen: ['installing or removing fonts or software that adds fonts', 'an operating-system update'],
  },
  // ------------------------------------------------------------- optional, never hashed
  publicIp: {
    label: 'Public IP address',
    category: 'network',
    stable: false,
    exposureClass: 'reveals',
    exposes: 'The public IP address your connection uses, as seen by a third-party service.',
    identifies: 'An IP address is assigned by your network provider; it can indicate your provider and rough region.',
    changesWhen: ['changing network, using a VPN or proxy', 'your provider reassigns the address'],
  },
  geolocation: {
    label: 'Approximate location',
    category: 'network',
    stable: false,
    exposureClass: 'reveals',
    exposes: 'A city/region/country estimate and network provider derived from your IP address.',
    identifies: 'Shows what a site can infer about your location without any permission prompt. It is an estimate and often reflects your provider rather than your exact place.',
    changesWhen: ['changing network, using a VPN or proxy'],
  },
  connection: {
    label: 'Connection quality',
    category: 'environment',
    stable: false,
    exposureClass: 'shared',
    exposes: 'Reported connection type, downlink speed and round-trip time (Chromium only).',
    identifies: 'Varies from moment to moment, so it is not useful as a stable identifier.',
    changesWhen: ['every measurement'],
  },
  battery: {
    label: 'Battery',
    category: 'environment',
    stable: false,
    exposureClass: 'shared',
    exposes: 'Battery level and charging state (Chromium only).',
    identifies: 'Changes constantly. It has historically been abused to link sessions, and several browsers removed it for that reason.',
    changesWhen: ['continuously'],
  },
  permissions: {
    label: 'Permission states',
    category: 'environment',
    stable: false,
    exposureClass: 'narrows',
    exposes: 'Whether sensitive capabilities (camera, microphone, location, notifications and others) are granted, denied or undecided.',
    identifies: 'Your own choices can make a profile more distinctive over time.',
    changesWhen: ['you change a site permission'],
  },
  mediaDevices: {
    label: 'Media device counts',
    category: 'environment',
    stable: false,
    exposureClass: 'narrows',
    exposes: 'How many cameras, microphones and speakers are connected (counts only; no names or IDs).',
    identifies: 'Device counts can differ between setups. Names and IDs are intentionally not collected.',
    changesWhen: ['plugging in or removing peripherals'],
  },
  automation: {
    label: 'Automation signals',
    category: 'environment',
    stable: false,
    exposureClass: 'shared',
    exposes: 'Whether the browser reports being automated (webdriver flag or a headless user agent).',
    identifies: 'Used by sites to detect bots; says nothing about you personally.',
    changesWhen: ['running under automation tools'],
  },
  cpuBenchmark: {
    label: 'CPU timing',
    category: 'environment',
    stable: false,
    exposureClass: 'shared',
    exposes: 'How long a short computation takes in your browser.',
    identifies: 'Varies with system load and power state, so it is not stable.',
    changesWhen: ['every measurement'],
  },
});

/** Ids of the signals that feed the configuration hash, in a stable display order. */
export const STABLE_SIGNAL_IDS = Object.freeze(Object.keys(SIGNALS).filter((id) => SIGNALS[id].stable));
export const VARIABLE_SIGNAL_IDS = Object.freeze(Object.keys(SIGNALS).filter((id) => !SIGNALS[id].stable));

/** Category for a diff path such as `screen.long` or `fonts` (first segment = collector id). */
export function categoryOfPath(path) {
  const id = String(path).split('.')[0];
  return SIGNALS[id]?.category ?? 'composite';
}

/**
 * Variable context values the Laboratory records next to each run. They are NOT hashed. Watching them move
 * while the hash stays put is how the "stable vs variable" design can be observed.
 */
export const CONTEXT_FIELDS = Object.freeze({
  devicePixelRatio: {
    label: 'Pixel ratio (browser zoom / display scaling)',
    why: 'Pixel ratio changes with browser zoom and display scaling. This app does not hash it, but the FingerprintJS composite may still react to it.',
  },
  viewport: {
    label: 'Window size',
    why: 'The window size changes whenever you resize or snap the window, so it is never part of the hash.',
  },
  availableArea: {
    label: 'Available screen area',
    why: 'The available area changes with taskbars and docks, so it is excluded from the hash.',
  },
  orientation: {
    label: 'Screen orientation',
    why: 'Orientation changes when a device is rotated; the hash uses rotation-independent screen sizes.',
  },
  utcOffsetMinutes: {
    label: 'UTC offset (minutes)',
    why: 'The offset changes with daylight saving time, so it is excluded; the time-zone name is hashed instead.',
  },
  languages: {
    label: 'Language list',
    why: 'The language list is part of the hash, so changes to it are expected to change the hash.',
  },
});

/** Short guided-experiment presets for the Laboratory. The user changes the setting; the app never does. */
export const EXPERIMENT_PRESETS = Object.freeze([
  {
    id: 'baseline',
    label: 'Baseline',
    howTo: 'Record the unchanged browser first. Every later run is compared with it.',
    hypothesis: 'This is the reference: repeating it should reproduce the same hash.',
    watch: [],
  },
  {
    id: 'timezone',
    label: 'Time zone changed',
    howTo: 'Change your operating system time zone yourself (for example in system date & time settings), reload this page and record a run.',
    hypothesis: 'The time-zone signal and the FingerprintJS identifier should change, so the hash should change.',
    watch: ['locale', 'fingerprintjs'],
  },
  {
    id: 'language',
    label: 'Language changed',
    howTo: 'Add or reorder a preferred language in your browser settings, reload and record a run.',
    hypothesis: 'The language list should change, so the hash should change.',
    watch: ['locale', 'fingerprintjs'],
  },
  {
    id: 'display',
    label: 'Display / zoom changed',
    howTo: 'Zoom the page (Ctrl + / Ctrl -) or resize the window, reload and record a run.',
    hypothesis: 'This app\'s own screen signal ignores zoom, pixel ratio and window size, so it should not change. The FingerprintJS composite may still react to display scaling, so the hash may or may not change: the result will show which.',
    watch: ['screen', 'fingerprintjs'],
  },
  {
    id: 'setting',
    label: 'Browser setting / mode changed',
    howTo: 'Change one browser setting, for example enable fingerprint protection, open a private window, or turn an extension on or off, then record a run.',
    hypothesis: 'Protections that randomise or standardise canvas, WebGL or fonts should change those signals.',
    watch: ['canvas', 'webgl', 'audio', 'fonts', 'fingerprintjs'],
  },
  {
    id: 'custom',
    label: 'Custom',
    howTo: 'Describe your own change in the run label, then record a run.',
    hypothesis: 'Form your own hypothesis and check which signals moved.',
    watch: [],
  },
]);
