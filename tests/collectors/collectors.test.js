// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioCollector } from '../../src/collectors/audio';
import { canvasCollector } from '../../src/collectors/canvas';
import { hardwareCollector } from '../../src/collectors/device';
import { fontsCollector } from '../../src/collectors/fonts';
import { STATUS, runCollector } from '../../src/collectors/runner';
import { automationCollector, mediaDevicesCollector } from '../../src/collectors/system';
import { webglCollector } from '../../src/collectors/webgl';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const stubContext = (ctx) => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);

describe('WebGL collector', () => {
  // The real WebGLShaderPrecisionFormat exposes its fields as prototype getters,
  // which JSON.stringify drops. Reproduce that to prove the collector copies them.
  class FakeFormat {
    get rangeMin() { return 127; }
    get rangeMax() { return 127; }
    get precision() { return 23; }
  }
  const fakeGl = () => ({
    VENDOR: 1, RENDERER: 2, VERSION: 3, SHADING_LANGUAGE_VERSION: 4, VERTEX_SHADER: 5, FRAGMENT_SHADER: 6,
    HIGH_FLOAT: 7, MEDIUM_FLOAT: 8, HIGH_INT: 9, MAX_TEXTURE_SIZE: 10, MAX_VIEWPORT_DIMS: 11, MAX_VERTEX_ATTRIBS: 12, MAX_VARYING_VECTORS: 13,
    getExtension: vi.fn((name) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_VENDOR_WEBGL: 100, UNMASKED_RENDERER_WEBGL: 101 } : { loseContext: vi.fn() })),
    getParameter: vi.fn((p) => ({ 100: 'Vendor X', 101: 'GPU Y', 3: 'WebGL 2', 4: 'GLSL', 10: 16384, 11: new Int32Array([32767, 32767]), 12: 16, 13: 30 }[p])),
    getShaderPrecisionFormat: vi.fn(() => new FakeFormat()),
    getSupportedExtensions: vi.fn(() => ['B_ext', 'A_ext']),
  });

  it('the fake really would serialise to {} without copying (guards the regression)', () => {
    expect(JSON.stringify(new FakeFormat())).toBe('{}');
  });

  it('serialises shader precision as real numbers and sorts extensions', () => {
    stubContext(fakeGl());
    const data = webglCollector.collect();
    expect(data.shaderPrecision.fragment.highFloat).toEqual({ rangeMin: 127, rangeMax: 127, precision: 23 });
    expect(data.extensions).toEqual(['A_ext', 'B_ext']);
    expect(data.parameters.maxViewportDims).toEqual([32767, 32767]);
    expect(data).toMatchObject({ vendor: 'Vendor X', renderer: 'GPU Y', unmaskedInfoAvailable: true });
  });

  it('releases the GPU context even though it returns data', () => {
    const gl = fakeGl();
    const lose = vi.fn();
    gl.getExtension = vi.fn((n) => (n === 'WEBGL_debug_renderer_info' ? null : { loseContext: lose }));
    stubContext(gl);
    webglCollector.collect();
    expect(lose).toHaveBeenCalled();
  });

  it('is reported "unsupported" when WebGL is unavailable', async () => {
    stubContext(null);
    expect((await runCollector(webglCollector)).status).toBe(STATUS.UNSUPPORTED);
  });
});

describe('Canvas collector', () => {
  it('is "unsupported" (not a hang or crash) without a 2D context', async () => {
    stubContext(null);
    expect((await runCollector(canvasCollector)).status).toBe(STATUS.UNSUPPORTED);
  });

  it('excludes a randomised canvas from the stable view', () => {
    expect(canvasCollector.stableView({ hash: 'h', consistent: false })).toEqual({ status: 'randomized' });
    expect(canvasCollector.stableView({ hash: 'h', consistent: true, worker: { status: 'timeout' } })).toEqual({ hash: 'h' });
  });
});

describe('Audio collector', () => {
  it('is "unsupported" without OfflineAudioContext, and never uses a real (audible) AudioContext', async () => {
    delete window.OfflineAudioContext;
    delete window.webkitOfflineAudioContext;
    const audible = vi.fn();
    vi.stubGlobal('AudioContext', audible);
    expect((await runCollector(audioCollector)).status).toBe(STATUS.UNSUPPORTED);
    expect(audible).not.toHaveBeenCalled();
  });

  it('renders offline: result is hashed, and nothing is connected to the speakers', async () => {
    const connect = vi.fn();
    class FakeOffline {
      constructor() { this.sampleRate = 44100; this.destination = { speakers: false }; }
      createOscillator() { return { type: '', frequency: {}, connect, start: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect }; }
      async startRendering() { return { getChannelData: () => new Float32Array(5000).fill(0.25) }; }
    }
    vi.stubGlobal('OfflineAudioContext', FakeOffline);
    window.OfflineAudioContext = FakeOffline;
    const r = await runCollector(audioCollector);
    expect(r.status).toBe(STATUS.OK);
    expect(r.data.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.data.sampleRate).toBe(44100);
  });

  it('times out if rendering never completes (no indefinite loading)', async () => {
    class Hung {
      constructor() { this.destination = {}; }
      createOscillator() { return { frequency: {}, connect: vi.fn(), start: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: vi.fn() }; }
      startRendering() { return new Promise(() => {}); }
    }
    window.OfflineAudioContext = Hung;
    const r = await runCollector({ ...audioCollector, timeoutMs: 50 });
    expect(r.status).toBe(STATUS.TIMEOUT);
    delete window.OfflineAudioContext;
  });
});

describe('Fonts collector', () => {
  it('detects a font whose width differs from every generic fallback, and sorts the result', async () => {
    stubContext({
      set font(value) { this._font = value; },
      measureText() {
        const f = this._font;
        if (f.includes('"Georgia"')) return { width: 111 };
        if (f.includes('"Arial"')) return { width: 222 };
        return { width: 100 }; // generic fallbacks and absent fonts
      },
    });
    const r = await runCollector(fontsCollector);
    expect(r.status).toBe(STATUS.OK);
    expect(r.data.installed).toEqual(['Arial', 'Georgia']);
    expect(fontsCollector.stableView(r.data)).toEqual(['Arial', 'Georgia']);
  });

  it('is "unsupported" without a canvas context', async () => {
    stubContext(null);
    expect((await runCollector(fontsCollector)).status).toBe(STATUS.UNSUPPORTED);
  });
});

describe('Hardware collector', () => {
  it('reports "unsupported" when neither value is exposed', async () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(undefined);
    expect((await runCollector(hardwareCollector)).status).toBe(STATUS.UNSUPPORTED);
  });

  it('keeps cores and explicitly flags that deviceMemory is not exposed', async () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    const r = await runCollector(hardwareCollector);
    expect(r.data).toMatchObject({ cpuLogicalCores: 8, deviceMemoryGB: null, deviceMemorySupported: false });
  });
});

describe('privacy-reducing collectors', () => {
  it('media devices: returns counts only, never labels or device IDs', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: async () => [
        { kind: 'videoinput', label: 'Secret Camera', deviceId: 'ID-123', groupId: 'G1' },
        { kind: 'audioinput', label: 'Mic', deviceId: 'ID-456', groupId: 'G2' },
        { kind: 'audioinput', label: 'Mic 2', deviceId: 'ID-789', groupId: 'G3' },
      ] },
    });
    const r = await runCollector(mediaDevicesCollector);
    expect(r.data).toEqual({ audioinput: 2, audiooutput: 0, videoinput: 1 });
    expect(JSON.stringify(r)).not.toMatch(/Secret Camera|ID-123|G1/);
    delete navigator.mediaDevices;
  });

  it('automation: only the two reliable indicators, not the old heuristics', () => {
    expect(Object.keys(automationCollector.collect()).sort()).toEqual(['headlessUserAgent', 'webdriverFlag']);
  });
});
