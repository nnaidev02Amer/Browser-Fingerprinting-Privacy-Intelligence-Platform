import { APP_NAME, APP_VERSION, FINGERPRINTJS_VERSION } from '../config/buildInfo';
import { sanitizeExperiment } from '../services/experimentStore';
import { sha256OfValue } from './hash';
import { stableStringify } from './stableStringify';
import { analyzeExperiment } from './experiments';
import { OPTIONAL_PROTECTION_STEP, PROTECTION_STEPS, analyzeProtection, pickProtectionRuns } from './protectionTest';
import { baselineStability } from './stability';
import { HASH_INPUT_VERSION } from './fingerprint';

/**
 * Research bundle: a self-describing, EXPORT-ONLY record of one experiment, so a result can be archived and
 * its analysis re-derived. The application never reads a bundle back in (no import, by design); a local
 * script (`npm run verify:bundle`) checks a file instead.
 *
 * Contents: the whitelisted runs (stable signals, labels, variable context, session evidence), the protocol,
 * the versions that produced it, and the analysis DERIVED from the runs. The checksum is SHA-256 over the
 * canonical JSON of everything else. It detects accidental edits. It does NOT prove who produced the file
 * or that the runs came from a real browser.
 */
export const BUNDLE_SCHEMA = 'fpp-research-bundle';
export const BUNDLE_VERSION = 1;

/** Keys that must never appear anywhere in a bundle. */
export const FORBIDDEN_KEYS = Object.freeze(['ip', 'publicIp', 'latitude', 'longitude', 'city', 'region', 'country', 'keyboard', 'behavioral', 'userAgent', 'sessionId', 'typed', 'password']);

export const BUNDLE_LIMITATIONS = Object.freeze([
  'Describes one browser on one machine and the settings you changed. It says nothing about other browsers, versions or users.',
  'No uniqueness, entropy, population statistic or risk score is contained or implied.',
  'The checksum detects accidental edits. It does not prove authorship or that the runs came from a real browser.',
  'Analysis is derived from the included runs and can be re-derived with `npm run verify:bundle`.',
]);

/** Protocol description embedded in the bundle (static, so a reader knows what the steps meant). */
export function protocolOf(experiment) {
  if (experiment.protocol !== 'protection') return { id: 'laboratory', description: 'Free-form Laboratory experiment: runs are compared with the first (baseline) run.' };
  return {
    id: 'protection-aba',
    description: 'Baseline (A1), one changed configuration (B), baseline again (A2), optional extra baseline (A3). Any attribute that differs between any two baselines is not attributed to the change.',
    steps: [...PROTECTION_STEPS, OPTIONAL_PROTECTION_STEP].map((s) => ({ id: s.id, label: s.label, optional: s.id === OPTIONAL_PROTECTION_STEP.id })),
  };
}

/** Analysis derived from an experiment's runs. Pure and deterministic: no times, no randomness. */
export function deriveExperiment(experiment) {
  const out = { runs: experiment.runs.length };
  if (experiment.protocol === 'protection') {
    const picked = pickProtectionRuns(experiment);
    const baselines = [picked.baseline, picked.repeat, picked.repeat2].filter(Boolean);
    out.stability = baselineStability(baselines);
    if (picked.baseline && picked.changed) {
      const a = analyzeProtection(picked);
      out.protection = {
        baselineCount: a.baselineCount,
        hasNoiseFloor: a.hasNoiseFloor,
        hashChanged: a.hashChanged,
        hashNoise: a.hashNoise,
        counts: a.counts,
        residual: a.residual,
        attributes: a.attributes.map((x) => ({ id: x.id, derived: x.derived, outcome: x.outcome })),
        summary: a.summary,
        caveats: a.caveats,
      };
    }
    return out;
  }
  const a = analyzeExperiment(experiment);
  if (a) {
    out.laboratory = {
      distinctHashes: a.distinctHashes,
      repeatable: a.repeatable,
      summary: a.summary,
      runs: a.runs.map((r) => ({ index: r.index, hashGroup: r.hashGroup, sameHashAsBaseline: r.comparison ? r.comparison.sameHash : null, changedPaths: r.comparison ? r.comparison.changedPaths : [] })),
    };
  }
  return out;
}

/** The bundle body, without the checksum. Pure (the time is passed in). */
export function bundleBody(experiments, now = new Date()) {
  const clean = experiments.map(sanitizeExperiment).filter(Boolean);
  return {
    schema: BUNDLE_SCHEMA,
    version: BUNDLE_VERSION,
    generator: {
      application: APP_NAME,
      applicationVersion: APP_VERSION,
      fingerprintjsVersion: FINGERPRINTJS_VERSION,
      hashInputVersion: HASH_INPUT_VERSION,
      hashAlgorithm: 'SHA-256 (Web Crypto, computed locally)',
      generatedAt: now.toISOString(),
    },
    contents: 'Whitelisted stable signals, labels, variable display context and session-evidence flags per run, plus analysis derived from them.',
    excludes: ['IP address', 'location', 'behavioural data', 'battery', 'permission states', 'media devices', 'raw User-Agent string', 'session identifiers'],
    protocols: Object.fromEntries(clean.map((e) => [e.id, protocolOf(e)])),
    experiments: clean,
    derived: Object.fromEntries(clean.map((e) => [e.id, deriveExperiment(e)])),
    limitations: BUNDLE_LIMITATIONS,
  };
}

/** Checksum of a bundle body (canonical JSON, keys sorted). */
export const checksumOf = (body) => sha256OfValue(body);

/** Build the complete bundle, ready to serialise. @returns {Promise<object>} */
export async function buildBundle(experiments, now = new Date()) {
  const body = bundleBody(experiments, now);
  return { ...body, checksum: { algorithm: 'SHA-256', scope: 'canonical JSON of every other top-level field', value: await checksumOf(body) } };
}

export const serialiseBundle = (bundle) => JSON.stringify(bundle, null, 2);

function findForbidden(value, path = '', out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => findForbidden(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k)) out.push(`${path}.${k}`);
      findForbidden(v, `${path}.${k}`, out);
    }
  }
  return out;
}

/**
 * Check a bundle (used by `npm run verify:bundle` and the tests; never by the app UI):
 *  1. schema and version, 2. no forbidden keys, 3. checksum matches, 4. the analysis re-derived from the
 *  included runs equals the stored analysis.
 * @returns {Promise<{ok: boolean, problems: string[], checks: Record<string, boolean>}>}
 */
export async function verifyBundle(bundle) {
  const problems = [];
  const checks = { schema: false, privacy: false, checksum: false, analysis: false };
  if (!bundle || typeof bundle !== 'object' || bundle.schema !== BUNDLE_SCHEMA) problems.push('Not a research bundle (schema).');
  else if (bundle.version !== BUNDLE_VERSION) problems.push(`Unsupported bundle version ${bundle.version}.`);
  else checks.schema = true;
  if (!checks.schema) return { ok: false, problems, checks };

  const forbidden = findForbidden(bundle);
  if (forbidden.length) problems.push(`Forbidden keys present: ${forbidden.slice(0, 5).join(', ')}`);
  else checks.privacy = true;

  const { checksum, ...body } = bundle;
  if (!checksum?.value) problems.push('Missing checksum.');
  else if ((await checksumOf(body)) !== checksum.value) problems.push('Checksum mismatch: the file was modified after export.');
  else checks.checksum = true;

  const experiments = Array.isArray(bundle.experiments) ? bundle.experiments : [];
  const recomputed = Object.fromEntries(experiments.map((e) => [e.id, deriveExperiment(e)]));
  if (stableStringify(recomputed) !== stableStringify(bundle.derived ?? {})) problems.push('Stored analysis does not match the analysis re-derived from the runs.');
  else checks.analysis = true;

  return { ok: problems.length === 0, problems, checks };
}
