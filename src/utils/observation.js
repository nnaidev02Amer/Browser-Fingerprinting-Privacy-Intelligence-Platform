/**
 * An "observation" is the whitelisted metadata saved next to a snapshot, an experiment run or a simulated
 * visit: session evidence plus the results of the repeat-read randomisation checks. It never contains
 * fingerprint values, IP address, location or behavioural data.
 */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bool = (v) => (v === true ? true : v === false ? false : null);
const id = (v) => (typeof v === 'string' && v.length <= 80 ? v : null);

/** Repeat-read results from a report: true = identical on repeat, false = differed (noise), null = unknown. */
export function readChecksFromReport(report) {
  const d = report?.details ?? {};
  return {
    canvas: bool(d.canvas?.consistent),
    audio: bool(d.audio?.consistent),
    webgl: bool(d.webgl?.readbackCheck?.consistent),
  };
}

/** Build the observation for a report and the current session evidence. */
export function buildObservation(report, evidence) {
  return sanitizeObservation({ ...evidence, readChecks: readChecksFromReport(report) });
}

/** Rebuild an observation from untrusted data, keeping only known fields. */
export function sanitizeObservation(raw) {
  const o = isPlainObject(raw) ? raw : {};
  const checks = isPlainObject(o.readChecks) ? o.readChecks : {};
  return {
    pageLoadId: id(o.pageLoadId),
    browserSessionId: id(o.browserSessionId),
    newBrowserSession: bool(o.newBrowserSession),
    storageMarkerPresent: bool(o.storageMarkerPresent),
    readChecks: { canvas: bool(checks.canvas), audio: bool(checks.audio), webgl: bool(checks.webgl) },
  };
}

/** Plain-language summary of the session evidence of two observations (never a verdict). */
export function describeSessionRelation(a, b) {
  if (!a || !b) return 'Session evidence is not available for one of the observations.';
  if (a.pageLoadId && a.pageLoadId === b.pageLoadId) {
    return 'Both observations come from the same page load. They share the same browser process and graphics state, so this tests repeatability, not behaviour across sessions.';
  }
  const parts = [];
  if (a.browserSessionId && b.browserSessionId) parts.push(a.browserSessionId === b.browserSessionId ? 'the same tab session' : 'different tab sessions (a new tab or browser session)');
  if (b.storageMarkerPresent === false) parts.push('with the app\'s localStorage marker absent at the later load (first use, or site data was cleared)');
  if (b.storageMarkerPresent === true) parts.push('with the app\'s localStorage marker still present at the later load');
  return `Different page loads${parts.length ? `: ${parts.join('; ')}` : ''}. This is evidence about what happened, not proof.`;
}
