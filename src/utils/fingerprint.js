import { ALL_COLLECTORS, STABLE_COLLECTORS } from '../collectors';
import { STATUS } from '../collectors/runner';
import { isHashSupported, sha256OfValue } from './hash';

/** Bump when the set of hashed signals or their shape changes. */
export const HASH_INPUT_VERSION = 'fp-v1';

export const FINGERPRINT_DISCLAIMER =
  'This hash is a browser/device-configuration fingerprint. It is NOT a unique identifier of a physical device: '
  + 'different devices with identical software and hardware can share it, and it changes when the browser, '
  + 'settings, or hardware change. Privacy tools may also alter or block some signals.';

/**
 * Build the stable fingerprint from collector results.
 *
 * Only `stableView` data of successfully collected stable collectors is
 * hashed. A collector that failed contributes just its status, so the input
 * stays deterministic. Timestamps, session IDs, battery, behavioural data, IP
 * and every other volatile value are excluded by construction.
 */
export async function buildStableFingerprint(results) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const signals = {};
  const failedSignals = [];

  for (const collector of STABLE_COLLECTORS) {
    const result = byId.get(collector.id);
    if (result?.status === STATUS.OK) {
      signals[collector.id] = collector.stableView ? collector.stableView(result.data) : result.data;
    } else {
      const status = result?.status ?? STATUS.DISABLED;
      signals[collector.id] = { status };
      failedSignals.push({ id: collector.id, status });
    }
  }

  const base = {
    algorithm: 'SHA-256',
    hashInputVersion: HASH_INPUT_VERSION,
    signals,
    signalsCollected: STABLE_COLLECTORS.length - failedSignals.length,
    signalsTotal: STABLE_COLLECTORS.length,
    // A hash built from fewer signals will not match a complete one.
    incomplete: failedSignals.length > 0,
    failedSignals,
    disclaimer: FINGERPRINT_DISCLAIMER,
  };

  if (!isHashSupported()) {
    return {
      ...base,
      hash: null,
      hashError:
        'SHA-256 is unavailable because Web Crypto (crypto.subtle) needs a secure context. '
        + 'Open the app via http://localhost or https:// to generate the hash. The collected signals are shown below.',
    };
  }

  try {
    const hash = await sha256OfValue({ version: HASH_INPUT_VERSION, signals });
    return { ...base, hash, hashError: null };
  } catch (err) {
    return { ...base, hash: null, hashError: err.message };
  }
}

function newSessionId() {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now().toString(36)}`;
}

/**
 * Assemble the full report from collector results plus optional behavioural
 * data. Layout:
 *   stableFingerprint – the hash and exactly what went into it
 *   details           – full output of the stable collectors (incl. non-hashed fields)
 *   volatile          – everything that changes between visits (never hashed)
 *   diagnostics       – status/timing of every collector
 *   meta              – timestamp and session ID (volatile, never hashed)
 */
export async function buildReport(results, { behavioral = null, choices }) {
  const stableIds = new Set(STABLE_COLLECTORS.map((c) => c.id));
  const details = {};
  const volatile = {};

  for (const r of results) {
    if (r.status === STATUS.DISABLED) continue; // listed in diagnostics only
    const payload = r.status === STATUS.OK ? r.data : { status: r.status, reason: r.reason };
    if (stableIds.has(r.id)) details[r.id] = payload;
    else volatile[r.id] = payload;
  }
  // Behavioural data only ever enters the report with explicit consent.
  if (behavioral && choices?.behavioral === true) volatile.behavioral = behavioral;

  // Third parties actually contacted in this run (a disabled collector makes no request).
  const contacted = results
    .filter((r) => THIRD_PARTY_BY_COLLECTOR[r.id] && r.status !== STATUS.DISABLED)
    .map((r) => THIRD_PARTY_BY_COLLECTOR[r.id]);

  return {
    schemaVersion: 1,
    stableFingerprint: await buildStableFingerprint(results),
    details,
    volatile,
    diagnostics: results.map(({ id, label, status, durationMs, reason }) => ({ id, label, status, durationMs, reason })),
    meta: {
      generatedAt: new Date().toISOString(),
      sessionId: newSessionId(),
      consent: { ...choices },
      fingerprintDataTransmitted: false,
      thirdPartyRequests: contacted,
      revokedCategories: [],
    },
  };
}

const THIRD_PARTY_BY_COLLECTOR = {
  publicIp: { host: 'api.ipify.org', purpose: 'public IP lookup' },
  geolocation: { host: 'ipapi.co', purpose: 'approximate location lookup' },
};

/**
 * Remove everything belonging to one consent category from an existing report.
 * Called when the user revokes that category, so revoked data does not stay on
 * screen (or get exported/saved). The stable hash is unaffected: only
 * essential collectors feed it, and essential collectors are never revoked.
 */
export function redactRevokedCategory(report, categoryId) {
  if (!report) return report;
  const ids = new Set(ALL_COLLECTORS.filter((c) => c.requires === categoryId).map((c) => c.id));
  if (categoryId === 'behavioral') ids.add('behavioral');

  const volatile = Object.fromEntries(Object.entries(report.volatile).filter(([id]) => !ids.has(id)));
  const diagnostics = report.diagnostics.map((d) =>
    ids.has(d.id) ? { ...d, status: STATUS.DISABLED, durationMs: 0, reason: 'Consent revoked; data removed' } : d,
  );

  return {
    ...report,
    volatile,
    diagnostics,
    meta: {
      ...report.meta,
      consent: { ...report.meta.consent, [categoryId]: false },
      // `thirdPartyRequests` is intentionally kept: it is a truthful record of
      // what this run contacted, even though the returned data is now removed.
      revokedCategories: [...new Set([...report.meta.revokedCategories, categoryId])],
    },
  };
}
