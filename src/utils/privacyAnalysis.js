import { OPTIONAL_CATEGORIES } from '../config/consentCategories';
import { DOCUMENTED_MECHANISMS, UNVERIFIED_REMOVED } from '../config/sources';
import { EXPOSURE_CLASSES, SIGNALS } from '../config/signalCatalog';
import { parseOsFromUA } from '../collectors/browser';
import { buildFindings, environmentLabel, evidenceRank, groupByEnvironment, recommendationsFromFindings } from './findings';
import { selectCollector } from './reportView';

/**
 * Privacy exposure analysis for ONE report.
 *
 * It explains what each *collected* signal discloses and groups the signals with a documented, qualitative
 * rubric. It produces NO numeric score, entropy figure or risk percentage: those would need a reference
 * population that this project does not have.
 *
 * Every observation and recommendation says what it rests on (`evidence`) and cites its sources. Claims
 * about what a browser or setting does appear only if quoted from official documentation (config/sources.js)
 * or reproducible with a tool in this application. Nothing here says that any setting protects you.
 */
export function analyzeExposure(report, extras = {}) {
  if (!report) return null;

  const outcome = (id) => selectCollector(report, id);
  const has = (id) => outcome(id).status === 'ok';

  const signals = Object.keys(SIGNALS)
    .filter(has)
    .map((id) => ({ id, ...SIGNALS[id], exposureLabel: EXPOSURE_CLASSES[SIGNALS[id].exposureClass].label }));

  const counts = { shared: 0, narrows: 0, reveals: 0 };
  for (const s of signals) counts[s.exposureClass] += 1;

  const browser = outcome('browser').data;
  const environment = extras.environment ?? environmentLabel(browser ? { browser: `${browser.browser.name} ${browser.browser.version ?? ''}`.trim(), os: browser.os.name } : null);
  const findings = buildFindings({ experiments: extras.experiments ?? [], report, environment });

  return {
    collectedCount: signals.length,
    signals,
    counts,
    observations: buildObservations(outcome),
    recommendations: mergeRecommendations(findings, buildRecommendations({ has, report })),
    findings,
    findingGroups: groupByEnvironment(findings),
    environment,
    mechanisms: DOCUMENTED_MECHANISMS,
    unverifiedNote: UNVERIFIED_REMOVED,
    optional: OPTIONAL_CATEGORIES.map((c) => ({ ...c, enabled: report.meta.consent?.[c.id] === true })),
    thirdParties: report.meta.thirdPartyRequests ?? [],
  };
}

/** Facts drawn directly from this run's data. Tone: protective, notable or neutral. All are MEASURED. */
function buildObservations(outcome) {
  const out = [];
  const canvas = outcome('canvas').data;
  const audio = outcome('audio').data;
  const webgl = outcome('webgl').data;
  const fonts = outcome('fonts').data;
  const browser = outcome('browser').data;
  const locale = outcome('locale').data;
  const hardware = outcome('hardware').data;
  const obs = (tone, text, sources = []) => out.push({ tone, text, evidence: ['observed'], sources });

  for (const [name, data] of [['Canvas', canvas], ['Audio', audio]]) {
    if (data && data.consistent === false) {
      obs('protective', `${name} output differed between two identical reads in this session (measured). That is consistent with the output being altered between reads. This project cannot tell which software did it, and it cannot tell whether the alteration prevents identification. The signal was left out of the hash.`);
    }
  }
  if (canvas && canvas.consistent !== false) obs('notable', 'Canvas rendering was identical across two reads in this session, so it is a repeatable attribute within a session. Whether it stays the same across sessions is tested with the Protection test and the Same-origin tracking experiment.');
  if (webgl) {
    obs(webgl.unmaskedInfoAvailable ? 'notable' : 'neutral', webgl.unmaskedInfoAvailable
      ? `The unmasked graphics renderer string was readable by this page: "${webgl.renderer}". It describes your graphics hardware and driver.`
      : 'The unmasked GPU vendor and renderer were not readable by this page, so that attribute was reduced to the generic values the browser reports.');
    if (webgl.readbackCheck?.consistent === false) obs('protective', 'WebGL pixel readback differed between two identical draws (measured). That is consistent with readback being altered between reads. This is informational and not part of the hash.');
  }
  if (fonts) obs('notable', `${fonts.installed.length} of ${fonts.tested} tested fonts were detected. The list is reported exactly as observed; this application does not infer an operating system, or anything else, from it.`, ['mdn']);
  if (browser) {
    obs('neutral', browser.source === 'userAgent'
      ? 'Client Hints were not available here, so browser and operating system were read from the User-Agent string.'
      : 'This application requested the full browser version and platform through User-Agent Client Hints, which the browser provided. Chrome documents that Client Hints give access to the full data only when a server declares an explicit need for it.', browser.source === 'userAgent' ? [] : ['chromeUa']);
  }
  if (hardware && !hardware.deviceMemorySupported) obs('neutral', 'Your browser did not expose device memory, so that attribute was unavailable to this page.');
  if (locale) obs('notable', `Your time zone (${locale.timeZone}) and languages (${(locale.languages ?? []).join(', ') || 'none reported'}) are readable by scripts and describe your region and language preferences. MDN lists time zone and preferred language among the elements a fingerprint might include.`, ['w3c', 'mdn']);
  out.push(...consistencyObservations({ browser, locale, outcome }));
  return out;
}

/**
 * Practical steps, each backed by evidence. The `because` line says why it applies to THIS run; `why` states
 * the support; `tradeoff` states the cost or the limit.
 */
function buildRecommendations({ has, report }) {
  const recs = [];
  const consent = report.meta.consent ?? {};
  const readable = ['canvas', 'webgl', 'audio', 'fonts', 'screen', 'hardware', 'locale'].filter(has);

  if (readable.length) {
    recs.push({
      id: 'scope',
      title: 'Know what browser protections do and do not cover',
      evidence: ['observed', 'documented'],
      sources: ['edge', 'w3c'],
      because: `A script on this page could read ${readable.length} configuration attributes without any prompt (${readable.map((id) => SIGNALS[id].label).join(', ')}).`,
      why: 'Edge documents its tracking prevention as restricting the storage and network access of resources classified as trackers, using tracker lists. The documentation does not describe changing the values that a page\'s own scripts can read. This project has not tested whether any Edge level changes the signals it collects.',
      tradeoff: 'List-based blocking can miss unlisted trackers: Edge documents that trackers listed only as fingerprinters are not blocked.',
    });
  }
  recs.push({
    id: 'measure',
    title: 'Test your own browser setup instead of assuming a setting works',
    evidence: ['experiment'],
    sources: [],
    because: 'Whether a setting changes what scripts can read is something you can measure here, on your own browser.',
    why: 'The Protection test records a baseline, a changed configuration and a second baseline. The second baseline shows normal variation, so only differences beyond it are attributed to the setting. It reports which attributes changed, became unavailable or look altered, and which stay identical.',
    tradeoff: 'It takes manual steps, covers only the attributes this application reads, and a changed value is not by itself evidence of better privacy.',
  });
  recs.push({
    id: 'state',
    title: 'Clearing cookies is useful, but it is a separate thing from your fingerprint',
    evidence: ['documented', 'observed'],
    sources: ['w3c'],
    because: 'Fingerprint attributes are read from the browser\'s configuration, not from cookies or local storage.',
    why: 'The W3C guidance lists "making state mechanisms clearable" as a mitigation for state-based tracking. This application reads configuration attributes (browser, screen, graphics and so on), not stored data, so clearing cookies or site data does not change them.',
    tradeoff: 'Clearing stored data still helps against cookie-style tracking. It does not change the attributes read here. This is how this application works, not a statement about any real tracker.',
  });
  if (consent.publicIp || consent.geolocation) {
    recs.push({
      id: 'network',
      title: 'Leave third-party IP and location lookups off unless you need them',
      evidence: ['observed'],
      sources: [],
      because: `You enabled ${[consent.publicIp && 'public IP lookup', consent.geolocation && 'location lookup'].filter(Boolean).join(' and ')}.`,
      why: 'Each lookup sends a request to an outside provider, which sees your IP address as any website does. Neither request includes your fingerprint. This is how this application is built and can be checked in your browser\'s network panel.',
      tradeoff: 'You lose the demonstration of what network-level lookups reveal.',
    });
  }
  return recs;
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Offset (minutes east of UTC) of an IANA zone at a given instant, or null if it cannot be determined. */
export function zoneOffsetMinutes(timeZone, at) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
    if (!part) return null;
    if (part === 'GMT') return 0;
    const m = part.match(/^GMT([+-])(\d{1,2}):?(\d{2})?$/);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : null;
  } catch {
    return null;
  }
}

/**
 * Consistency checks BETWEEN this application's own signals. They report agreement or difference and never
 * judge which value is right, and they make no statement about how common any value is.
 */
function consistencyObservations({ browser, locale, outcome }) {
  const out = [];
  const obs = (text) => out.push({ tone: 'neutral', text, evidence: ['observed'], sources: [] });

  if (browser && browser.source !== 'userAgent' && browser.userAgent) {
    const fromUa = parseOsFromUA(browser.userAgent).name;
    obs(norm(fromUa) === norm(browser.os.name)
      ? `The operating system name from Client Hints ("${browser.os.name}") and from the User-Agent string ("${fromUa}") agree.`
      : `The operating system name from Client Hints ("${browser.os.name}") and from the User-Agent string ("${fromUa}") differ. This is reported only; the application does not say which is accurate.`);
  }
  if (locale?.timeZone && Number.isFinite(locale.utcOffsetMinutes)) {
    const expected = zoneOffsetMinutes(locale.timeZone, new Date());
    if (expected !== null) {
      obs(expected === locale.utcOffsetMinutes
        ? `The reported UTC offset (${locale.utcOffsetMinutes} minutes) is consistent with the time zone ${locale.timeZone}.`
        : `The reported UTC offset (${locale.utcOffsetMinutes} minutes) differs from the offset expected for ${locale.timeZone} now (${expected} minutes). This can happen around daylight-saving changes; it is reported only.`);
    }
  }
  const touch = outcome('touch').data;
  if (browser?.deviceType === 'Mobile' && touch && touch.maxTouchPoints === 0) {
    obs('A mobile device class was reported together with 0 touch points. This is reported as observed and is not judged.');
  }
  return out;
}

/** Findings-bound recommendations first (by evidence strength), then the general documented/observed ones. */
function mergeRecommendations(findings, base) {
  const measured = findings.some((f) => f.rule === 'F1' || f.rule === 'F3');
  const kept = base.filter((r) => !(measured && r.id === 'measure')); // already done: do not tell the user to run it
  return [...recommendationsFromFindings(findings), ...kept].sort((a, b) => evidenceRank(a.evidence) - evidenceRank(b.evidence) || a.id.localeCompare(b.id));
}
