import { describe, expect, it } from 'vitest';
import { createExperiment, createRun } from '../../src/services/experimentStore';
import { compareSnapshots } from '../../src/utils/compare';
import { REPORT_PROJECT, buildComparisonReport, buildResearchReport, escapeHtml } from '../../src/utils/reportBuilder';
import { makeReport, makeSnapshot, okResult } from '../helpers/fixtures';

const NOW = new Date(Date.UTC(2025, 5, 1, 12, 0, 0));
const IP = '203.0.113.9';
const withNetwork = () => makeReport({ choices: { publicIp: true, geolocation: true, extended: true }, extra: [
  okResult('publicIp', { ip: IP }), okResult('geolocation', { city: 'Testville', country: 'Testland' }), okResult('battery', { levelPercent: 42 }),
] });

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(5)).toBe('5');
  });
});

describe('buildResearchReport', () => {
  it('requires a collected report', () => {
    expect(() => buildResearchReport({ report: null })).toThrow(/collected fingerprint/);
  });

  it('is a complete, self-contained document with all required sections', async () => {
    const html = buildResearchReport({ report: await makeReport(), now: NOW, title: 'My study', researcher: 'A. Student', institution: 'Test University' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    for (const heading of ['Project and experiment information', 'Browser and environment summary', 'Configuration hash', 'Collected signal categories', 'Privacy exposure analysis', 'Optional collectors and third-party requests', 'Experiment results', 'Snapshot comparison', 'Methodology', 'Limitations']) {
      expect(html, heading).toContain(heading);
    }
    expect(html).toContain(escapeHtml(REPORT_PROJECT)); // the name contains "&", which must be escaped in HTML
    expect(html).toContain('My study');
    expect(html).toContain('A. Student');
    expect(html).toContain('Test University');
  });

  it('contains the real hash and the not-a-unique-identifier statement', async () => {
    const report = await makeReport();
    const html = buildResearchReport({ report, now: NOW });
    expect(html).toContain(report.stableFingerprint.hash);
    expect(html).toMatch(/not a unique identifier of a person or physical device/);
    expect(html).toMatch(/is NOT a unique identifier of a physical device/);
  });

  it('loads nothing external: no scripts, links, images, fonts or URLs to fetch', async () => {
    const html = buildResearchReport({ report: await makeReport(), now: NOW });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i);
  });

  it('never includes IP, location, battery or other optional data, even when it was collected', async () => {
    const html = buildResearchReport({ report: await withNetwork(), now: NOW });
    for (const needle of [IP, 'Testville', 'Testland', 'levelPercent', 'camera']) expect(html).not.toContain(needle);
    expect(html).toMatch(/never included in this report/);
  });

  it('states which optional categories were enabled and which third parties were contacted', async () => {
    const html = buildResearchReport({ report: await withNetwork(), now: NOW });
    expect(html).toContain('api.ipify.org');
    expect(html).toContain('ipapi.co');
    expect(html).toMatch(/Fingerprint data uploaded: no/);
  });

  it('escapes user-typed text so a hostile name or note cannot inject markup', async () => {
    const evil = '<img src=x onerror=alert(1)><script>boom()</script>';
    const exp = { ...createExperiment(evil, NOW), runs: [createRun(await makeReport(), { label: evil }, NOW)] };
    const html = buildResearchReport({ report: await makeReport(), experiment: exp, title: evil, researcher: evil, institution: evil, notes: evil, now: NOW });
    expect(html).not.toContain('<script>boom()');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('includes experiment results with explanations when an experiment is given', async () => {
    const base = createRun(await makeReport(), { label: 'Baseline', presetId: 'baseline' }, new Date(NOW.getTime()), { width: 1280, height: 720 });
    const tz = createRun(await makeReport({ mutate: (d) => { d.locale.timeZone = 'Europe/Paris'; d.fingerprintjs.visitorId = 'zzz'; } }), { label: 'TZ changed', presetId: 'timezone' }, new Date(NOW.getTime() + 1000), { width: 1280, height: 720 });
    const html = buildResearchReport({ report: await makeReport(), experiment: { ...createExperiment('TZ study', NOW), runs: [base, tz] }, now: NOW });
    expect(html).toContain('Experiment results: TZ study');
    expect(html).toContain('TZ changed');
    expect(html).toMatch(/2 distinct configuration hashes/);
    expect(html).toMatch(/Language &amp; time zone/);
    expect(html).toMatch(/time zone/i);
  });

  it('includes a comparison with category counts when given, and says none otherwise', async () => {
    const a = await makeSnapshot(0);
    const b = await makeSnapshot(1000, { mutate: (d) => { d.hardware.cpuLogicalCores = 4; } });
    const withCmp = buildResearchReport({ report: await makeReport(), comparison: compareSnapshots(a, b), now: NOW });
    expect(withCmp).toContain('hardware.cpuLogicalCores');
    expect(withCmp).toMatch(/The configuration hashes differ/);
    const without = buildResearchReport({ report: await makeReport(), now: NOW });
    expect(without).toMatch(/No comparison was selected/);
    expect(without).toMatch(/No experiment was selected/);
  });

  it('documents its methodology and limitations, and gives no scores or percentages', async () => {
    const html = buildResearchReport({ report: await makeReport(), now: NOW });
    expect(html).toMatch(/SHA-256/);
    expect(html).toMatch(/canonical JSON/);
    expect(html).toMatch(/No numeric score, entropy value or risk percentage/);
    expect(html).toMatch(/not a unique identifier of a person or physical device/);
    expect(html).not.toMatch(/\bscore\s*[:=]?\s*\d/i);
  });

  it('is honest about an unavailable hash (insecure context)', async () => {
    const report = await makeReport();
    report.stableFingerprint = { ...report.stableFingerprint, hash: null, hashError: 'SHA-256 is unavailable because Web Crypto needs a secure context.' };
    const html = buildResearchReport({ report, now: NOW });
    expect(html).toMatch(/The hash is unavailable/);
    expect(html).toMatch(/secure context/);
  });

  it('discloses attribution and the FingerprintJS licence without claiming a licence', async () => {
    const html = buildResearchReport({ report: await makeReport(), now: NOW });
    expect(html).toMatch(/Abu Sufiun/);
    expect(html).toMatch(/Business Source License 1\.1/);
    expect(html).toMatch(/No licence is claimed or granted/);
  });
});

describe('buildComparisonReport', () => {
  it('produces a standalone comparison with every row and the identifier disclaimer', async () => {
    const cmp = compareSnapshots(await makeSnapshot(0), await makeSnapshot(1000, { mutate: (d) => { d.fonts.installed = ['Arial']; } }));
    const html = buildComparisonReport({ comparison: cmp, now: NOW });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('fonts');
    expect(html).toMatch(/not a unique identifier of a person or physical device/);
    expect(html).not.toMatch(/<script/i);
  });
});
