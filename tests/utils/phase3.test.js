import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDistinguishability, ROLE } from '../../src/utils/distinguishability';
import { buildFindings, environmentLabel, groupByEnvironment, recommendationsFromFindings } from '../../src/utils/findings';
import { analyzeExposure, zoneOffsetMinutes } from '../../src/utils/privacyAnalysis';
import { BUNDLE_SCHEMA, FORBIDDEN_KEYS, buildBundle, bundleBody, checksumOf, serialiseBundle, verifyBundle } from '../../src/utils/researchBundle';
import { baselineStability } from '../../src/utils/stability';
import { createExperiment, createRun } from '../../src/services/experimentStore';
import { SOURCES } from '../../src/config/sources';
import { makeReport, rawSignals } from '../helpers/fixtures';

const at = (ms) => new Date(Date.UTC(2025, 0, 1) + ms);
const sigOf = async (mutate) => (await makeReport({ mutate })).stableFingerprint.signals;
const runOf = async (presetId, ms, label, mutate) => createRun(await makeReport({ mutate }), { label, presetId }, at(ms), { width: 1, height: 1 }, { pageLoadId: `p${ms}` });

async function protectionExperiment({ changed = (d) => { d.hardware.cpuLogicalCores = 2; }, withA2 = true, withA3 = false, envMutate } = {}) {
  const e = createExperiment('Test', at(0), 'protection');
  e.runs = [await runOf('protect-a1', 1, 'Baseline (A1)', envMutate), await runOf('protect-b', 2, 'Setting X', (d) => { envMutate?.(d); changed(d); })];
  if (withA2) e.runs.push(await runOf('protect-a2', 3, 'Baseline again (A2)', envMutate));
  if (withA3) e.runs.push(await runOf('protect-a3', 4, 'Extra baseline (A3)', envMutate));
  return e;
}

describe('research bundle (export only)', () => {
  it('has the schema, versions, protocol, whitelisted runs, derived analysis and a checksum', async () => {
    const e = await protectionExperiment({ withA3: true });
    const b = await buildBundle([e], at(10));
    expect(b.schema).toBe(BUNDLE_SCHEMA);
    expect(b.generator).toMatchObject({ hashInputVersion: 'fp-v1', hashAlgorithm: expect.stringMatching(/SHA-256/), generatedAt: at(10).toISOString() });
    expect(b.generator).toHaveProperty('applicationVersion');
    expect(b.generator).toHaveProperty('fingerprintjsVersion');
    expect(b.protocols[e.id].steps.map((s) => s.id)).toEqual(['protect-a1', 'protect-b', 'protect-a2', 'protect-a3']);
    expect(b.protocols[e.id].steps.find((s) => s.id === 'protect-a3').optional).toBe(true);
    expect(b.derived[e.id].protection).toMatchObject({ baselineCount: 3, hasNoiseFloor: true, hashChanged: true });
    expect(b.derived[e.id].stability.find((s) => s.id === 'screen')).toMatchObject({ identical: 3, runs: 3, status: 'identical' });
    expect(b.checksum).toMatchObject({ algorithm: 'SHA-256', value: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(b.limitations.join(' ')).toMatch(/No uniqueness, entropy, population statistic or risk score/);
  });

  it('a freshly built bundle verifies, including after a JSON round trip', async () => {
    const b = await buildBundle([await protectionExperiment()], at(10));
    const result = await verifyBundle(JSON.parse(serialiseBundle(b)));
    expect(result).toEqual({ ok: true, problems: [], checks: { schema: true, privacy: true, checksum: true, analysis: true } });
  });

  it('is deterministic: the same experiment and time give the same checksum', async () => {
    const e = await protectionExperiment();
    expect((await buildBundle([e], at(5))).checksum.value).toBe((await buildBundle([e], at(5))).checksum.value);
    expect((await buildBundle([e], at(5))).checksum.value).not.toBe((await buildBundle([e], at(6))).checksum.value); // time is part of the body
  });

  it('detects an edited run value (checksum mismatch) and an edited analysis (re-derivation mismatch)', async () => {
    const e = await protectionExperiment();
    const b = JSON.parse(serialiseBundle(await buildBundle([e], at(10))));
    const edited = structuredClone(b);
    edited.experiments[0].runs[0].signals.hardware.cpuLogicalCores = 99;
    const r1 = await verifyBundle(edited);
    expect(r1.ok).toBe(false);
    expect(r1.problems.join(' ')).toMatch(/Checksum mismatch/);

    // An attacker who also fixes the checksum is still caught by re-deriving the analysis from the runs.
    const forged = structuredClone(b);
    forged.derived[e.id].protection.hashChanged = false;
    const { checksum, ...body } = forged;
    forged.checksum = { ...checksum, value: await checksumOf(body) };
    const r2 = await verifyBundle(forged);
    expect(r2.checks.checksum).toBe(true);
    expect(r2.checks.analysis).toBe(false);
    expect(r2.problems.join(' ')).toMatch(/re-derived/);
  });

  it('rejects wrong schema, wrong version, and garbage', async () => {
    expect((await verifyBundle(null)).ok).toBe(false);
    expect((await verifyBundle({ schema: 'other' })).ok).toBe(false);
    const b = await buildBundle([await protectionExperiment()], at(1));
    expect((await verifyBundle({ ...b, version: 99 })).problems.join(' ')).toMatch(/Unsupported bundle version/);
  });

  it('never contains IP, location, behaviour, raw User-Agent or session ids, even if the stored data tried to', async () => {
    const e = await protectionExperiment();
    e.runs[0].ip = '203.0.113.9'; e.runs[0].userAgent = 'RAW-UA'; e.runs[0].observation.sessionId = 'S'; e.runs[0].behavioral = { keyboard: [] };
    const text = serialiseBundle(await buildBundle([e], at(1)));
    for (const needle of ['203.0.113.9', 'RAW-UA', 'keyboard', '"sessionId"', 'latitude']) expect(text).not.toContain(needle);
    expect((await verifyBundle(JSON.parse(text))).checks.privacy).toBe(true);
  });

  it('the verifier rejects a bundle that contains a forbidden key', async () => {
    const b = JSON.parse(serialiseBundle(await buildBundle([await protectionExperiment()], at(1))));
    b.experiments[0].runs[0].context.publicIp = '203.0.113.9';
    const r = await verifyBundle(b);
    expect(r.checks.privacy).toBe(false);
    expect(FORBIDDEN_KEYS).toEqual(expect.arrayContaining(['ip', 'userAgent', 'behavioral', 'latitude']));
  });

  it('works for Laboratory experiments too, with a derived summary', async () => {
    const e = createExperiment('Lab', at(0), 'general');
    e.runs = [await runOf('baseline', 1, 'Baseline'), await runOf('timezone', 2, 'TZ', (d) => { d.locale.timeZone = 'Europe/Paris'; })];
    const b = await buildBundle([e], at(3));
    expect(b.protocols[e.id].id).toBe('laboratory');
    expect(b.derived[e.id].laboratory.distinctHashes).toBe(2);
    expect((await verifyBundle(b)).ok).toBe(true);
  });

  it('contains no percentage, entropy, uniqueness or score wording', async () => {
    const text = serialiseBundle(await buildBundle([await protectionExperiment({ withA3: true })], at(1)));
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%/);
    expect(text.replace(/No uniqueness, entropy, population statistic or risk score[^"]*/g, '')).not.toMatch(/\bentropy\b|\buniqueness\b|\brisk score\b/i);
  });

  it('bundleBody is pure: no checksum inside', async () => {
    expect(bundleBody([await protectionExperiment()], at(1))).not.toHaveProperty('checksum');
  });
});

describe('the local verification script (npm run verify:bundle)', () => {
  const run = (file) => spawnSync(process.execPath, ['--import', './scripts/register-resolve.mjs', 'scripts/verify-bundle.mjs', file], { encoding: 'utf8', cwd: process.cwd() });

  it('exits 0 for a good bundle, and 1 for a tampered one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fpp-bundle-'));
    const good = join(dir, 'good.json');
    writeFileSync(good, serialiseBundle(await buildBundle([await protectionExperiment({ withA3: true })], at(1))));
    const ok = run(good);
    expect(ok.stdout).toMatch(/internally consistent/);
    expect(ok.status).toBe(0);

    const bad = join(dir, 'bad.json');
    const parsed = JSON.parse(readFileSync(good, 'utf8'));
    parsed.experiments[0].runs[1].signals.hardware.cpuLogicalCores = 1;
    writeFileSync(bad, JSON.stringify(parsed));
    const failed = run(bad);
    expect(failed.status).toBe(1);
    expect(failed.stdout).toMatch(/Checksum mismatch/);
  }, 60000);

  it('exits 2 for a missing file or no argument', () => {
    expect(run(join(tmpdir(), 'does-not-exist.json')).status).toBe(2);
    expect(spawnSync(process.execPath, ['--import', './scripts/register-resolve.mjs', 'scripts/verify-bundle.mjs'], { encoding: 'utf8' }).status).toBe(2);
  }, 60000);
});

describe('baseline stability counts (counts, never percentages)', () => {
  it('"not tested" with fewer than two baselines', async () => {
    const r = baselineStability([{ signals: await sigOf() }]);
    expect(r.every((x) => x.status === 'not-tested' && x.identical === null)).toBe(true);
  });

  it('identical in k of m runs', async () => {
    const runs = [await sigOf(), await sigOf(), await sigOf(), await sigOf((d) => { d.hardware.cpuLogicalCores = 4; }), await sigOf()].map((signals) => ({ signals }));
    const byId = Object.fromEntries(baselineStability(runs).map((x) => [x.id, x]));
    expect(byId.hardware).toMatchObject({ identical: 4, runs: 5, status: 'varied' });
    expect(byId.screen).toMatchObject({ identical: 5, runs: 5, status: 'identical' });
    expect(Object.keys(byId)).not.toContain('fingerprintjs');
  });

  it('an attribute unreadable in every run is "unreadable", not stable', async () => {
    const mk = async () => ({ signals: await sigOf((d) => { delete d.audio; }) });
    expect(baselineStability([await mk(), await mk()]).find((x) => x.id === 'audio').status).toBe('unreadable');
  });
});

describe('findings ledger', () => {
  it('F1/F2 for one real difference, with traceable basis ids and an environment', async () => {
    const e = await protectionExperiment();
    const f = buildFindings({ experiments: [e] });
    const f1 = f.filter((x) => x.rule === 'F1');
    expect(f1).toHaveLength(1);
    expect(f1[0]).toMatchObject({ attribute: 'hardware', environment: 'Chrome 126 / Windows', evidence: ['experiment'] });
    expect(f1[0].statement).toMatch(/Processor & memory differed from the baseline beyond baseline variation/);
    expect(f1[0].basis).toEqual(expect.arrayContaining([e.id, ...e.runs.map((r) => r.id)]));
    const f2 = f.find((x) => x.rule === 'F2');
    expect(f2.attributes).toEqual(expect.arrayContaining(['screen', 'locale']));
    expect(f2.attributes).not.toContain('hardware');
  });

  it('F8 for an attribute that varied between baselines: no F1 for it', async () => {
    const e = createExperiment('Noisy', at(0), 'protection');
    e.runs = [await runOf('protect-a1', 1, 'A1'), await runOf('protect-b', 2, 'B', (d) => { d.hardware.cpuLogicalCores = 2; }), await runOf('protect-a2', 3, 'A2', (d) => { d.hardware.cpuLogicalCores = 4; })];
    const f = buildFindings({ experiments: [e] });
    expect(f.filter((x) => x.rule === 'F1' && x.attribute === 'hardware')).toHaveLength(0);
    expect(f.find((x) => x.rule === 'F8').attributes).toContain('hardware');
  });

  it('F3 provisional when no A2 was recorded, never stated as conclusive', async () => {
    const f = buildFindings({ experiments: [await protectionExperiment({ withA2: false })] });
    expect(f.filter((x) => x.rule === 'F1')).toHaveLength(0);
    expect(f.find((x) => x.rule === 'F3').statement).toMatch(/no second baseline.*provisional/);
  });

  it('keeps browser environments apart: two environments give two groups and no finding spans both', async () => {
    const chrome = await protectionExperiment();
    const edge = await protectionExperiment({ envMutate: (d) => { d.browser.browser.name = 'Edge'; } });
    const groups = groupByEnvironment(buildFindings({ experiments: [chrome, edge] }));
    expect(groups.map((g) => g.environment)).toEqual(['Chrome 126 / Windows', 'Edge 126 / Windows']);
    for (const g of groups) for (const f of g.findings) expect(f.statement).toContain(g.environment.split(' / ')[0]);
    expect(environmentLabel(null)).toBe('unknown environment');
    expect(environmentLabel({ browser: 'Chrome 157.0.8103.78', os: 'Windows 11' })).toBe('Chrome 157 / Windows');
  });

  it('F6: attributes that told your setups apart in one experiment (needs two setups and a repeat)', async () => {
    const e = await protectionExperiment({ withA3: false });
    const f6 = buildFindings({ experiments: [e] }).find((x) => x.rule === 'F6');
    expect(f6.attributes).toEqual(['hardware']);
    expect(f6.statement).toMatch(/your own setups only/);
    expect(f6.basis).toEqual(expect.arrayContaining([e.id, ...e.runs.map((r) => r.id)]));
    const single = await protectionExperiment({ withA2: false });
    expect(buildFindings({ experiments: [single] }).find((x) => x.rule === 'F6')).toBeUndefined(); // no repeat: nothing claimed
  });

  it('F7: repeat-read differences from the current report, without attributing them to any software', async () => {
    const report = await makeReport({ mutate: (d) => { d.canvas.consistent = false; } });
    const f7 = buildFindings({ report }).find((x) => x.rule === 'F7');
    expect(f7.statement).toMatch(/cannot tell which software did it/);
  });

  it('no data, no findings', () => {
    expect(buildFindings({})).toEqual([]);
  });
});

describe('evidence-bound recommendations', () => {
  it('every recommendation cites findings or sources, states an action and a limit, and has evidence', async () => {
    const e = await protectionExperiment();
    const report = await makeReport();
    const a = analyzeExposure(report, { experiments: [e] });
    expect(a.findings.length).toBeGreaterThan(0);
    const bound = recommendationsFromFindings(a.findings);
    expect(bound.length).toBeGreaterThan(0);
    for (const r of a.recommendations) {
      expect(r.evidence.length).toBeGreaterThan(0);
      expect(r.tradeoff.length).toBeGreaterThan(15);
      expect(r.why.length).toBeGreaterThan(15);
      if (r.findings) { expect(r.findings.length).toBeGreaterThan(0); expect(r.action.length).toBeGreaterThan(15); for (const id of r.findings) expect(a.findings.map((f) => f.id)).toContain(id); }
      for (const s of r.sources) expect(SOURCES[s]).toBeDefined();
    }
  });

  it('is ordered by evidence strength (experiments before observations before documentation), then id, deterministically', async () => {
    const e = await protectionExperiment();
    const a = analyzeExposure(await makeReport(), { experiments: [e] });
    const rank = (r) => Math.min(...r.evidence.map((k) => ({ experiment: 0, measured: 0, observed: 1, documented: 2 }[k] ?? 3)));
    const ranks = a.recommendations.map(rank);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    const again = analyzeExposure(await makeReport(), { experiments: [e] });
    expect(again.recommendations.map((r) => r.id)).toEqual(a.recommendations.map((r) => r.id)); // same input, same order
  });

  it('without any experiment data the only measured action is "run the Protection test"', async () => {
    const a = analyzeExposure(await makeReport());
    expect(a.findings).toEqual([]);
    expect(a.recommendations.map((r) => r.id)).toContain('measure');
    expect(a.recommendations.filter((r) => r.findings)).toHaveLength(0);
  });

  it('once a protection finding exists, the generic "run a test" recommendation is dropped', async () => {
    const a = analyzeExposure(await makeReport(), { experiments: [await protectionExperiment()] });
    expect(a.recommendations.map((r) => r.id)).not.toContain('measure');
  });

  it('contains no percentages, scores, risk wording, product names or protection claims', async () => {
    const e = await protectionExperiment({ withA3: true });
    const a = analyzeExposure(await makeReport({ mutate: (d) => { d.canvas.consistent = false; } }), { experiments: [e] });
    const text = JSON.stringify([a.recommendations, a.findings]);
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%|\bscore\b|\brisk\b|Tor Browser|Firefox|Brave|resistFingerprinting|\bprotected\b|\bprotects\b|\bsafe\b/i);
  });
});

describe('value-and-consistency based exposure observations', () => {
  const texts = (a) => a.observations.map((o) => o.text).join(' ');

  it('reports fonts as observed and says no operating system or anything else is inferred', async () => {
    const t = texts(analyzeExposure(await makeReport()));
    expect(t).toMatch(/2 of 41 tested fonts were detected\. The list is reported exactly as observed; this application does not infer an operating system/);
    expect(t).not.toMatch(/Segoe|Calibri|Menlo|indicates (Windows|macOS)|implies/);
  });

  it('cites MDN for the elements a fingerprint might include, with the retrieval date on the source', async () => {
    const a = analyzeExposure(await makeReport());
    expect(a.observations.some((o) => o.sources.includes('mdn'))).toBe(true);
    expect(SOURCES.mdn.url).toBe('https://developer.mozilla.org/en-US/docs/Glossary/Fingerprinting');
    expect(SOURCES.mdn.retrieved).toBe('2026-11-19');
    expect(a.mechanisms.find((m) => m.id === 'mdn-definition').notSaid).toMatch(/does not say how identifying any particular value is/);
  });

  it('operating-system consistency: agree, and differ (reported without judging which is right)', async () => {
    const agree = texts(analyzeExposure(await makeReport({ mutate: (d) => { d.browser.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; } })));
    expect(agree).toMatch(/Client Hints \("Windows"\) and from the User-Agent string \("Windows"\) agree/);
    const differ = texts(analyzeExposure(await makeReport({ mutate: (d) => { d.browser.userAgent = 'Mozilla/5.0 (X11; Linux x86_64)'; } })));
    expect(differ).toMatch(/differ\. This is reported only; the application does not say which is accurate/);
  });

  it('UTC offset consistency with the time zone', async () => {
    expect(zoneOffsetMinutes('Asia/Kolkata', new Date())).toBe(330);
    expect(zoneOffsetMinutes('UTC', new Date())).toBe(0);
    expect(zoneOffsetMinutes('Not/AZone', new Date())).toBeNull();
    const ok = texts(analyzeExposure(await makeReport()));
    expect(ok).toMatch(/UTC offset \(330 minutes\) is consistent with the time zone Asia\/Kolkata/);
    const off = texts(analyzeExposure(await makeReport({ mutate: (d) => { d.locale.utcOffsetMinutes = 60; } })));
    expect(off).toMatch(/differs from the offset expected for Asia\/Kolkata now \(330 minutes\)/);
  });

  it('mobile class with zero touch points is reported, not judged; desktop is silent', async () => {
    const mobile = texts(analyzeExposure(await makeReport({ mutate: (d) => { d.browser.deviceType = 'Mobile'; } })));
    expect(mobile).toMatch(/mobile device class was reported together with 0 touch points.*not judged/);
    expect(texts(analyzeExposure(await makeReport()))).not.toMatch(/0 touch points/);
  });

  it('never says a value is common, rare, unique or typical (except in negation)', async () => {
    const a = analyzeExposure(await makeReport({ mutate: (d) => { d.canvas.consistent = false; } }), { experiments: [await protectionExperiment()] });
    const text = JSON.stringify([a.observations, a.recommendations, a.findings]);
    expect(text).not.toMatch(/\b(is|are|was|were) (very |quite )?(common|rare|unique|typical|unusual)\b/i);
  });
});

describe('distinguishability v2: what is enough to tell configurations apart', () => {
  const obs = async (configLabel, mutate) => ({ configLabel, signals: await sigOf(mutate) });

  it('finds a small separating set deterministically', async () => {
    const data = [await obs('A'), await obs('A'), await obs('B', (d) => { d.hardware.cpuLogicalCores = 2; d.webgl.renderer = 'X'; }), await obs('C', (d) => { d.webgl.renderer = 'Y'; })];
    const r = analyzeDistinguishability(data);
    expect(r.sufficient).toBe(true);
    expect(r.separatingSet).toEqual(['webgl']); // one attribute is enough for every pair here
    expect(analyzeDistinguishability(data).separatingSet).toEqual(r.separatingSet);
  });

  it('needs two attributes when no single one separates every pair (greedy, catalog order breaks ties)', async () => {
    const data = [await obs('A'), await obs('A'), await obs('B', (d) => { d.hardware.cpuLogicalCores = 2; }), await obs('C', (d) => { d.touch.maxTouchPoints = 5; })];
    expect(analyzeDistinguishability(data).separatingSet).toEqual(['hardware', 'touch']);
  });

  it('reports attributes that separated exactly the same pairs as interchangeable', async () => {
    const data = [await obs('A'), await obs('A'), await obs('B', (d) => { d.hardware.cpuLogicalCores = 2; d.touch.maxTouchPoints = 5; })];
    const r = analyzeDistinguishability(data);
    expect(r.interchangeable).toEqual([expect.arrayContaining(['hardware', 'touch'])]);
    expect(r.separatingSet).toHaveLength(1);
  });

  it('reports configurations that no measured attribute separates', async () => {
    const r = analyzeDistinguishability([await obs('A'), await obs('A'), await obs('B')]);
    expect(r.separatingSet).toEqual([]);
    expect(r.inseparablePairs).toEqual([['A', 'B']]);
  });

  it('gates on sufficiency: nothing is claimed with one configuration or no repeated session', async () => {
    expect(analyzeDistinguishability([await obs('A'), await obs('A')]).sufficient).toBe(false);
    const two = analyzeDistinguishability([await obs('A'), await obs('B', (d) => { d.hardware.cpuLogicalCores = 2; })]);
    expect(two.sufficient).toBe(false);
    expect(two.separatingSet).toEqual([]);
    expect(two.attributes.every((a) => a.role === ROLE.INSUFFICIENT || a.role === ROLE.UNREADABLE)).toBe(true);
  });

  it('does not use unstable attributes to separate', async () => {
    const r = analyzeDistinguishability([await obs('A', (d) => { d.canvas.hash = '1'.repeat(64); }), await obs('A', (d) => { d.canvas.hash = '2'.repeat(64); }), await obs('B', (d) => { d.hardware.cpuLogicalCores = 2; })]);
    expect(r.separatingSet).not.toContain('canvas');
  });

  it('output has no percentage, entropy, score or uniqueness wording', async () => {
    const r = analyzeDistinguishability([await obs('A'), await obs('A'), await obs('B', (d) => { d.hardware.cpuLogicalCores = 2; })]);
    expect(JSON.stringify(r)).not.toMatch(/\d+(\.\d+)?\s*%|entropy|uniqueness|\bscore\b|\brisk\b/i);
    expect(rawSignals()).toHaveProperty('canvas');
  });
});

describe('CI configuration and repository reproducibility files', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('runs install, lint, unit tests and the production build, on Node 22 and 24', () => {
    for (const step of ['npm ci', 'npm run lint', 'npm test', 'npm run build']) expect(ci).toContain(`run: ${step}`);
    expect(ci).toMatch(/node-version: \[22, 24\]/);
    expect(ci).toMatch(/runs-on: ubuntu-latest/);
  });

  it('is deliberately lightweight: no browser tests, secrets, deployment, uploads or network calls', () => {
    const body = ci.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); // ignore the explanatory comments
    expect(body).not.toMatch(/test:browser|secrets\.|deploy|upload|curl|wget|http:\/\/|https:\/\//i);
    expect(body).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(ci).toMatch(/intentionally not run here/); // and the reason is documented
  });

  it('uses only first-party GitHub actions at pinned major versions', () => {
    const uses = [...ci.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    expect(uses.sort()).toEqual(['actions/checkout@v4', 'actions/setup-node@v4']);
  });

  it('pins the Node version and declares the minimum in package.json', () => {
    expect(readFileSync('.nvmrc', 'utf8').trim()).toMatch(/^\d+/);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.engines.node).toBe('>=22.12.0');
    for (const s of ['test', 'test:browser', 'verify:bundle', 'audit:report', 'lint', 'build']) expect(pkg.scripts).toHaveProperty(s);
  });

  it('every command documented in REPRODUCING.md exists as a package script', () => {
    const doc = readFileSync('docs/REPRODUCING.md', 'utf8');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const used = [...doc.matchAll(/`npm run ([a-z:]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(4);
    for (const s of used) expect(pkg.scripts, s).toHaveProperty(s);
    expect(doc).toMatch(/does not\s+run the browser check/);
  });

  it('KNOWN_ISSUES states the picomatch facts: advisory id, range, paths, no patch, not in bundle, forced fix is a downgrade', () => {
    const doc = readFileSync('docs/KNOWN_ISSUES.md', 'utf8');
    for (const fact of ['GHSA-fc5q-39xc-vjpf', '<= 4.0.7', 'CWE-1333', '7.5', 'no patched version exists', 'not part of what a user', '`vitest@5.1.0` > `picomatch`', 'downgrade', 'Not applied']) expect(doc).toContain(fact);
    expect(doc).toMatch(/not audited every place|have \*\*not\*\* audited every place/);
  });

  it('the README documents the new scripts and does not claim Firefox or Brave support', () => {
    const readme = readFileSync('README.md', 'utf8');
    for (const s of ['npm run test:browser', 'verify:bundle', 'research bundle']) expect(readme).toContain(s);
    expect(readme).not.toMatch(/Firefox[^.\n]*(supported|passes|tested and)|Brave[^.\n]*(supported|passes)/i);
  });
});

describe('the application never imports data (export only)', () => {
  const sources = import.meta.glob('/src/**/*.{js,jsx}', { query: '?raw', import: 'default', eager: true });
  it('has no file input, FileReader, file picker, drag-and-drop or fetch of local files', () => {
    for (const [path, text] of Object.entries(sources)) {
      for (const re of [/type=["']file["']/, /\bFileReader\b/, /showOpenFilePicker/, /\bonDrop\b|\bdataTransfer\b/, /\.files\b/]) expect(re.test(text), `${path} ${re}`).toBe(false);
    }
  });

  it('the bundle verifier is used only by scripts and tests, never by a component, view or hook', () => {
    const users = Object.entries(sources).filter(([, t]) => /verifyBundle/.test(t)).map(([p]) => p);
    expect(users).toEqual(['/src/utils/researchBundle.js']);
  });
});
