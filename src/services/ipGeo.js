import { CancelledError, UnsupportedError } from '../utils/errors';

/**
 * Third-party lookups. Each function contacts exactly ONE provider and is only
 * ever invoked by a collector that requires its own, separate consent
 * category ("publicIp" or "geolocation"); the collector runner enforces that.
 *
 * No fingerprint data is ever included: these are plain GET requests with no
 * cookies, no referrer and no body. The providers see the caller's IP address,
 * as any website does.
 */

export const IPIFY_URL = 'https://api.ipify.org?format=json';
export const IPAPI_URL = 'https://ipapi.co/json/';
export const REQUEST_TIMEOUT_MS = 5000;

async function fetchJson(url, label, externalSignal) {
  if (typeof fetch !== 'function') throw new UnsupportedError('fetch is not available');
  // Consent already revoked: do not even start the request.
  if (externalSignal?.aborted) throw new CancelledError();

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new Error(`${label} responded with HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (externalSignal?.aborted) throw new CancelledError(); // revoked, not a timeout
    if (err.name === 'AbortError') throw new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS} ms`);
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/** Public IP address via ipify. Requires "publicIp" consent. */
export async function lookupPublicIp({ signal } = {}) {
  const { ip } = await fetchJson(IPIFY_URL, 'Public IP lookup', signal);
  if (typeof ip !== 'string' || !ip) throw new Error('Public IP lookup returned no address');
  return { ip, provider: 'api.ipify.org' };
}

/**
 * Approximate location via ipapi.co. Requires "geolocation" consent.
 * The service resolves the caller's IP itself; the `ip` field of its response
 * is deliberately discarded, so the IP address is only reported when the user
 * separately consented to the public IP lookup.
 */
export async function lookupGeolocation({ signal } = {}) {
  const geo = await fetchJson(IPAPI_URL, 'Geolocation lookup', signal);
  // ipapi reports quota/limit problems as JSON with `error: true`, even on HTTP 200.
  if (geo.error) throw new Error(geo.reason || geo.message || 'Geolocation service returned an error');
  return {
    provider: 'ipapi.co',
    city: geo.city ?? null,
    region: geo.region ?? null,
    country: geo.country_name ?? null,
    countryCode: geo.country_code ?? null,
    latitude: geo.latitude ?? null,
    longitude: geo.longitude ?? null,
    timezone: geo.timezone ?? null,
    organization: geo.org ?? null,
  };
}
