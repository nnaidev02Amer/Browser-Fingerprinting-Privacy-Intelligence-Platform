import { describe, expect, it } from 'vitest';
import { STABLE_COLLECTORS } from '../../src/collectors';
import { STATUS } from '../../src/collectors/runner';
import { buildReport, buildStableFingerprint, redactRevokedCategory } from '../../src/utils/fingerprint';

/** Realistic collector outputs, including volatile / non-hashed fields. */
const raw = () => ({
  fingerprintjs: { visitorId: 'abc123', libraryVersion: '4.6.2', confidenceScore: 0.5, componentStatus: {} },
  browser: { source: 'userAgentData', browser: { name: 'Chrome', version: '126.0.1', majorVersion: '126' }, os: { name: 'Windows', version: '11' }, deviceType: 'Desktop', architecture: 'x86', bitness: '64', model: '', userAgent: 'UA' },
  screen: { width: 1920, height: 1080, colorDepth: 24, pixelDepth: 24, availWidth: 1920, availHeight: 1040, devicePixelRatio: 1, orientation: 'landscape-primary' },
  hardware: { cpuLogicalCores: 8, deviceMemoryGB: 8, deviceMemorySupported: true },
  touch: { maxTouchPoints: 0, touchEventSupported: false, pointerEventSupported: true, coarsePointer: false, hoverCapable: true },
  locale: { timeZone: 'Asia/Kolkata', locale: 'en-US', language: 'en-US', languages: ['en-US', 'en'], utcOffsetMinutes: 330 },
  canvas: { hash: 'c'.repeat(64), consistent: true, worker: { status: 'ok', hash: 'd'.repeat(64) } },
  webgl: { vendor: 'Google', renderer: 'ANGLE', shaderPrecision: { vertex: { highFloat: { rangeMin: 127, rangeMax: 127, precision: 23 } } }, extensions: ['A'], parameters: {} },
  audio: { sampleRate: 44100, hash: 'e'.repeat(64), sampleSum: 123.456 },
  fonts: { tested: 41, installed: ['Arial', 'Verdana'] },
});
const asResults = (data) => Object.entries(data).map(([id, d]) => ({ id, label: id, status: 'ok', data: d, durationMs: 1 }));

/**
 * GOLDEN VALUE, computed with the Stage 2 implementation before Stages 3-6
 * were written. If this test fails, the stable-hash algorithm or its inputs
 * have changed and every previously saved snapshot will stop matching.
 * Only update it deliberately, together with HASH_INPUT_VERSION.
 */
const STAGE2_GOLDEN_HASH = 'f00e8547ab2d3ac1ab3fb30a39600479bb45493b0088d640dfb40fc70c0ad5a3';

describe('stable hash: algorithm preserved from Stage 2', () => {
  it('produces the exact Stage 2 golden hash for the fixed input', async () => {
    const fp = await buildStableFingerprint(asResults(raw()));
    expect(fp.hash).toBe(STAGE2_GOLDEN_HASH);
    expect(fp.hashInputVersion).toBe('fp-v1');
    expect(fp.algorithm).toBe('SHA-256');
  });
});

describe('stable hash contract', () => {
  it('is deterministic and independent of result order', async () => {
    const a = await buildStableFingerprint(asResults(raw()));
    const b = await buildStableFingerprint(asResults(raw()).reverse());
    expect(a.hash).toBe(b.hash);
    expect(a.signalsCollected).toBe(STABLE_COLLECTORS.length);
    expect(a.incomplete).toBe(false);
  });

  const excluded = {
    'browser exact version / architecture / UA string': (d) => { d.browser.browser.version = '127.0.9'; d.browser.browser.majorVersion = '127'; d.browser.architecture = null; d.browser.userAgent = 'other'; },
    'available screen area, pixel ratio (zoom), orientation': (d) => { d.screen.availHeight = 900; d.screen.devicePixelRatio = 1.5; d.screen.orientation = 'portrait-primary'; },
    'screen rotation (width/height swapped)': (d) => { [d.screen.width, d.screen.height] = [d.screen.height, d.screen.width]; },
    'UTC offset (daylight saving)': (d) => { d.locale.utcOffsetMinutes = 270; },
    'worker canvas result (informational)': (d) => { d.canvas.worker = { status: 'timeout' }; },
    'audio sampleSum and FingerprintJS metadata': (d) => { d.audio.sampleSum = 0.1; d.fingerprintjs.confidenceScore = 0.9; d.fingerprintjs.libraryVersion = '9'; },
    'touch primary-pointer traits': (d) => { d.touch.coarsePointer = true; d.touch.hoverCapable = false; },
  };
  it.each(Object.entries(excluded))('EXCLUDED, hash unchanged: %s', async (_name, mutate) => {
    const base = await buildStableFingerprint(asResults(raw()));
    const d = raw();
    mutate(d);
    expect((await buildStableFingerprint(asResults(d))).hash).toBe(base.hash);
  });

  const included = {
    'canvas hash': (d) => { d.canvas.hash = 'f'.repeat(64); },
    'WebGL renderer': (d) => { d.webgl.renderer = 'Other GPU'; },
    'WebGL shader precision (regression: used to serialise as {})': (d) => { d.webgl.shaderPrecision.vertex.highFloat.precision = 10; },
    'installed fonts': (d) => { d.fonts.installed = ['Arial']; },
    'browser name': (d) => { d.browser.browser.name = 'Edge'; },
    'OS name': (d) => { d.browser.os.name = 'Linux'; },
    'CPU cores': (d) => { d.hardware.cpuLogicalCores = 4; },
    'time zone': (d) => { d.locale.timeZone = 'Europe/Paris'; },
    'screen resolution': (d) => { d.screen.width = 1366; d.screen.height = 768; },
    'audio hash': (d) => { d.audio.hash = '0'.repeat(64); },
  };
  it.each(Object.entries(included))('INCLUDED, hash changes: %s', async (_name, mutate) => {
    const base = await buildStableFingerprint(asResults(raw()));
    const d = raw();
    mutate(d);
    expect((await buildStableFingerprint(asResults(d))).hash).not.toBe(base.hash);
  });

  it('excludes a randomised canvas (privacy browser) instead of letting the hash change every run', async () => {
    const a = raw(); a.canvas = { hash: '1'.repeat(64), consistent: false, worker: { status: 'ok' } };
    const b = raw(); b.canvas = { hash: '2'.repeat(64), consistent: false, worker: { status: 'ok' } };
    const [ha, hb] = [await buildStableFingerprint(asResults(a)), await buildStableFingerprint(asResults(b))];
    expect(ha.hash).toBe(hb.hash);
    expect(ha.signals.canvas).toEqual({ status: 'randomized' });
  });
});

describe('degraded runs and insecure contexts', () => {
  it('still hashes when a collector failed, flags the result incomplete and differs from a complete run', async () => {
    const base = await buildStableFingerprint(asResults(raw()));
    const results = asResults(raw()).map((r) => (r.id === 'audio' ? { id: 'audio', label: 'audio', status: 'unsupported', reason: 'x', durationMs: 0 } : r));
    const fp = await buildStableFingerprint(results);
    expect(fp.incomplete).toBe(true);
    expect(fp.failedSignals).toEqual([{ id: 'audio', status: 'unsupported' }]);
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fp.hash).not.toBe(base.hash);
  });

  it('ignores the failure REASON text (only the status is hashed)', async () => {
    const mk = (reason) => asResults(raw()).map((r) => (r.id === 'audio' ? { id: 'audio', label: 'a', status: 'error', reason, durationMs: 0 } : r));
    expect((await buildStableFingerprint(mk('one'))).hash).toBe((await buildStableFingerprint(mk('two'))).hash);
  });

  it('does not throw with no results at all', async () => {
    const fp = await buildStableFingerprint([]);
    expect(fp.signalsCollected).toBe(0);
    expect(fp.incomplete).toBe(true);
  });

  it('without crypto.subtle: hash is null, a helpful message is returned, signals are still available', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const fp = await buildStableFingerprint(asResults(raw()));
      expect(fp.hash).toBeNull();
      expect(fp.hashError).toMatch(/secure context/i);
      expect(fp.hashError).toMatch(/localhost/);
      expect(fp.signals.canvas.hash).toBe('c'.repeat(64));
    } finally {
      Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});

describe('buildReport', () => {
  const allOff = { extended: false, publicIp: false, geolocation: false, behavioral: false };
  const extra = (id, data) => ({ id, label: id, status: 'ok', data, durationMs: 1 });

  it('keeps volatile data out of the stable section and out of the hash', async () => {
    const base = await buildStableFingerprint(asResults(raw()));
    const report = await buildReport(
      [...asResults(raw()), extra('battery', { levelPercent: 80 }), extra('publicIp', { ip: '203.0.113.9' })],
      { behavioral: { mouse: { samples: 3 } }, choices: { ...allOff, extended: true, publicIp: true, behavioral: true } },
    );
    expect(report.stableFingerprint.hash).toBe(base.hash);
    expect(report.volatile.battery).toBeDefined();
    expect(report.volatile.behavioral).toBeDefined();
    expect(Object.keys(report.stableFingerprint.signals)).not.toContain('battery');
    const signalsJson = JSON.stringify(report.stableFingerprint.signals);
    expect(signalsJson).not.toContain(report.meta.sessionId);
    expect(signalsJson).not.toContain(report.meta.generatedAt);
    expect(signalsJson).not.toContain('203.0.113.9');
  });

  it('never includes behavioural data without behavioural consent, even if supplied', async () => {
    const report = await buildReport(asResults(raw()), { behavioral: { mouse: { samples: 3 } }, choices: allOff });
    expect(report.volatile.behavioral).toBeUndefined();
  });

  it('lists disabled collectors in diagnostics only, not as data', async () => {
    const disabled = { id: 'publicIp', label: 'Public IP address', status: STATUS.DISABLED, reason: 'Disabled', durationMs: 0 };
    const report = await buildReport([...asResults(raw()), disabled], { choices: allOff });
    expect(report.diagnostics.find((d) => d.id === 'publicIp').status).toBe('disabled');
    expect(report.volatile.publicIp).toBeUndefined();
    expect(report.meta.thirdPartyRequests).toEqual([]);
    expect(report.meta.fingerprintDataTransmitted).toBe(false);
  });

  it('records which third parties were actually contacted', async () => {
    const report = await buildReport([...asResults(raw()), extra('publicIp', { ip: '203.0.113.9' })], { choices: { ...allOff, publicIp: true } });
    expect(report.meta.thirdPartyRequests.map((t) => t.host)).toEqual(['api.ipify.org']);
  });

  it('different runs differ in session id/timestamp but share the stable hash', async () => {
    const a = await buildReport(asResults(raw()), { choices: allOff });
    const b = await buildReport(asResults(raw()), { choices: allOff });
    expect(a.meta.sessionId).not.toBe(b.meta.sessionId);
    expect(a.stableFingerprint.hash).toBe(b.stableFingerprint.hash);
  });

  it('serialises without {} placeholders where hashes belong', async () => {
    const report = await buildReport(asResults(raw()), { choices: allOff });
    expect(JSON.stringify(report)).not.toMatch(/"hash":\{\}/);
  });
});

describe('redactRevokedCategory (consent revocation)', () => {
  const choices = { extended: true, publicIp: true, geolocation: true, behavioral: true };
  const build = () => buildReport(
    [
      ...asResults(raw()),
      { id: 'publicIp', label: 'Public IP address', status: 'ok', data: { ip: '203.0.113.9' }, durationMs: 1 },
      { id: 'geolocation', label: 'Approximate location', status: 'ok', data: { city: 'Testville' }, durationMs: 1 },
      { id: 'battery', label: 'Battery', status: 'ok', data: { levelPercent: 50 }, durationMs: 1 },
    ],
    { behavioral: { mouse: { samples: 2 } }, choices },
  );

  it('removes only the revoked category and marks it disabled', async () => {
    const redacted = redactRevokedCategory(await build(), 'publicIp');
    expect(redacted.volatile.publicIp).toBeUndefined();
    expect(JSON.stringify(redacted)).not.toContain('203.0.113.9');
    expect(redacted.volatile.geolocation).toBeDefined(); // independent category untouched
    expect(redacted.diagnostics.find((d) => d.id === 'publicIp')).toMatchObject({ status: 'disabled' });
    expect(redacted.meta.consent.publicIp).toBe(false);
    expect(redacted.meta.revokedCategories).toEqual(['publicIp']);
  });

  it('removes behavioural data when behavioural consent is revoked', async () => {
    expect(redactRevokedCategory(await build(), 'behavioral').volatile.behavioral).toBeUndefined();
  });

  it('removes every "extended" collector when that category is revoked', async () => {
    const redacted = redactRevokedCategory(await build(), 'extended');
    expect(redacted.volatile.battery).toBeUndefined();
  });

  it('never changes the stable hash (essential signals are not revocable)', async () => {
    const report = await build();
    const redacted = redactRevokedCategory(report, 'extended');
    expect(redacted.stableFingerprint.hash).toBe(report.stableFingerprint.hash);
  });

  it('keeps the truthful record of third parties that were contacted', async () => {
    const redacted = redactRevokedCategory(await build(), 'publicIp');
    expect(redacted.meta.thirdPartyRequests.map((t) => t.host)).toContain('api.ipify.org');
  });

  it('tolerates a missing report', () => {
    expect(redactRevokedCategory(null, 'publicIp')).toBeNull();
  });
});
