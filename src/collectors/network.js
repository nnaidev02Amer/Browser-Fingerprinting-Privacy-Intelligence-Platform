import { lookupGeolocation, lookupPublicIp } from '../services/ipGeo';

/**
 * Network collectors. Each requires its OWN consent category, so granting one
 * never enables the other, and with neither granted the runner never executes
 * them (so no request is made). Both are volatile and never hashed.
 */
export const publicIpCollector = {
  id: 'publicIp',
  label: 'Public IP address',
  requires: 'publicIp',
  timeoutMs: 7000,
  collect: lookupPublicIp,
};

export const geolocationCollector = {
  id: 'geolocation',
  label: 'Approximate location',
  requires: 'geolocation',
  timeoutMs: 7000,
  collect: lookupGeolocation,
};
