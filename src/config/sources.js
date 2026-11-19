/**
 * Sources for every claim about browsers that the application makes.
 *
 * RULES
 *  - A claim about what a browser or a browser setting does may appear in the application only if it is
 *    (a) quoted from official documentation listed here, or (b) reproduced by an experiment this
 *    application runs on your own browser.
 *  - Quotes were retrieved on SOURCES_ACCESSED with an automated fetch tool. Re-check them on the live
 *    page before citing them in academic work.
 *  - Claims about Firefox and Tor Browser were REMOVED: the official pages could not be retrieved, or did
 *    not discuss fingerprinting, so they could not be verified (see UNVERIFIED_REMOVED).
 */
export const SOURCES_ACCESSED = '2026-11-18';

export const SOURCES = Object.freeze({
  w3c: {
    id: 'w3c',
    title: 'Mitigating Browser Fingerprinting in Web Specifications',
    publisher: 'W3C (Privacy Working Group and TAG guidance)',
    url: 'https://w3c.github.io/fingerprinting-guidance/',
    quotes: [
      'browser fingerprinting is the capability of a site to identify or re-identify a visiting user',
      'characteristics that can be used in concert to identify a user, user agent or device',
      'Specifications can mitigate against fingerprintability through standardization',
      'Removing the source of entropy or available attributes that can be used for fingerprinting',
      'Helping users respond to fingerprinting by making state mechanisms clearable',
    ],
  },
  chromeUa: {
    id: 'chromeUa',
    title: 'User-Agent reduction',
    publisher: 'Google Privacy Sandbox',
    url: 'https://privacysandbox.google.com/protections/user-agent',
    quotes: [
      'User-Agent (UA) reduction minimizes the identifying information shared in the User-Agent string',
      'User-Agent Client Hints allow access to the full set of User-Agent data, but only when servers actively declare an explicit need for specific pieces of data.',
    ],
  },
  edge: {
    id: 'edge',
    title: 'Tracking prevention in Microsoft Edge',
    publisher: 'Microsoft Learn (Microsoft Edge developer documentation)',
    url: 'https://learn.microsoft.com/en-us/microsoft-edge/web-platform/tracking-prevention',
    quotes: [
      'The tracking prevention feature in Microsoft Edge protects users from online tracking by restricting the ability of trackers to access browser-based storage as well as the network.',
      'Trackers that appear on solely on the Fingerprinting list are considered non-malicious fingerprinters and aren\'t blocked.',
    ],
  },
  mdn: {
    id: 'mdn',
    title: 'Fingerprinting (Glossary)',
    publisher: 'MDN Web Docs (Mozilla)',
    url: 'https://developer.mozilla.org/en-US/docs/Glossary/Fingerprinting',
    retrieved: '2026-11-19',
    quotes: [
      'Fingerprinting is a practice in which websites identify a particular browser (and by extension, a particular user) by collecting and combining distinguishing features of the browser and underlying operating system.',
      'Elements of a fingerprint might include, for example:',
      'Web standards are designed in such a way as to minimize the ability of a website to collect identifying information, and browsers typically add their own protections as well.',
    ],
    // The glossary lists, among the elements: browser version, timezone and preferred language, available
    // video or audio codecs, installed fonts, browser settings state, and display size and resolution.
    listed: ['browser version', 'timezone and preferred language', 'installed fonts', 'display size and resolution'],
  },
  brave: {
    id: 'brave',
    title: 'Fingerprinting Protections (Brave wiki)',
    publisher: 'Brave Software',
    url: 'https://github.com/brave/brave-browser/wiki/Fingerprinting-Protections',
    quotes: [
      'These randomization values are derived from a seed that changes per session, per site (eTLD+1) and per storage area.',
      'best-effort',
    ],
  },
});

/**
 * Browser mechanisms that are DOCUMENTED, with exactly what the documentation says, what it does not say,
 * and whether THIS project has tested it. Nothing here claims that any mechanism protects the user.
 */
export const DOCUMENTED_MECHANISMS = Object.freeze([
  {
    id: 'mdn-definition',
    title: 'MDN: what fingerprinting is and which features it combines',
    source: 'mdn',
    says: 'MDN defines fingerprinting as identifying a browser by collecting and combining distinguishing features of the browser and operating system, and lists among the possible elements the browser version, time zone and preferred language, installed fonts and display size and resolution.',
    notSaid: 'It is a glossary definition. It does not say how identifying any particular value is, which browsers resist it, or how any of the listed elements should be mitigated individually.',
    testedHere: 'No. It is a definition; this application only reads the listed attributes and reports what it observed.',
  },
  {
    id: 'w3c-approaches',
    title: 'Mitigation approaches described by the W3C',
    source: 'w3c',
    says: 'The guidance describes reducing the available attributes, standardising values, and helping users clear state. It defines fingerprinting as the capability of a site to identify or re-identify a visiting user, using characteristics "in concert".',
    notSaid: 'It is design guidance for web specifications. It does not say that any particular browser setting makes a user harder to identify.',
    testedHere: 'No. This is guidance, not a browser feature.',
  },
  {
    id: 'chrome-ua-reduction',
    title: 'Chrome: User-Agent reduction and Client Hints',
    source: 'chromeUa',
    says: 'Chrome documents that UA reduction minimises the identifying information in the User-Agent string, and that Client Hints give access to the full data only when a server declares an explicit need.',
    notSaid: 'It concerns the User-Agent string and Client Hints only, not canvas, WebGL, audio or fonts.',
    testedHere: 'Partly. This application requests the full Client Hints itself, and reports whether browser and OS came from Client Hints or from the User-Agent string.',
  },
  {
    id: 'edge-tracking-prevention',
    title: 'Edge: tracking prevention',
    source: 'edge',
    says: 'Edge documents restricting storage and network access for resources classified as trackers using tracker lists. Its table lists classified fingerprinting trackers as blocked at Basic, Balanced and Strict.',
    notSaid: 'It is list-based. Trackers that appear only on the fingerprinting list are documented as not blocked, and the documentation does not describe changing the values that a page\'s own scripts can read.',
    testedHere: 'No. This project has not measured whether any Edge tracking-prevention level changes the signals it collects. The Protection test can be used to check that on your own browser.',
  },
  {
    id: 'brave-fingerprinting',
    title: 'Brave: fingerprinting protections',
    source: 'brave',
    says: 'Brave documents randomisation values derived from a seed that changes per session, per site and per storage area, and describes the protection as best-effort.',
    notSaid: 'The retrieved page did not state which APIs are affected, and it says fingerprinting attacks will always be possible.',
    testedHere: 'No. Brave is not installed on the test machine, so no protection effectiveness is claimed.',
  },
]);

export const UNVERIFIED_REMOVED =
  'Claims about Firefox and Tor Browser were removed from this application: the official pages could not be retrieved or did not discuss fingerprinting, so they could not be verified. '
  + 'Earlier versions also described Brave\'s behaviour more broadly than its documentation supports; that was removed too.';

/** Kinds of evidence a statement can rest on. Shown next to every recommendation. */
export const EVIDENCE_KINDS = Object.freeze({
  observed: { label: 'Observed in your data', meaning: 'Taken directly from the values collected in this run.' },
  experiment: { label: 'Reproducible experiment', meaning: 'Can be reproduced with a tool in this application on your own browser.' },
  documented: { label: 'Documented', meaning: 'Stated in official documentation listed under Sources.' },
  measured: { label: 'Measured', meaning: 'Directly observed in this browser in this application.' },
});
