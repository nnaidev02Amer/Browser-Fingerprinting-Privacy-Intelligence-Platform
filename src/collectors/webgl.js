import { UnsupportedError } from '../utils/errors';

// WebGLShaderPrecisionFormat has only prototype getters, so JSON.stringify
// turns it into `{}`. Copy the fields into a plain object instead.
function precision(gl, shaderType, precisionType) {
  const fmt = gl.getShaderPrecisionFormat(shaderType, precisionType);
  return fmt ? { rangeMin: fmt.rangeMin, rangeMax: fmt.rangeMax, precision: fmt.precision } : null;
}

function shaderPrecisionInfo(gl) {
  const out = {};
  for (const [stageName, stage] of [['vertex', gl.VERTEX_SHADER], ['fragment', gl.FRAGMENT_SHADER]]) {
    out[stageName] = {
      highFloat: precision(gl, stage, gl.HIGH_FLOAT),
      mediumFloat: precision(gl, stage, gl.MEDIUM_FLOAT),
      highInt: precision(gl, stage, gl.HIGH_INT),
    };
  }
  return out;
}

const PROBE_VERTEX = 'attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
const PROBE_FRAGMENT = 'precision mediump float; varying vec2 v; void main(){ gl_FragColor = vec4(v.x, v.y, sin(v.x * 12.9898 + v.y * 78.233) * 0.5 + 0.5, 1.0); }';

/** Draw a small gradient and read the pixels back as text; null if WebGL cannot do it. */
function renderProbe() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) return null;
  try {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, PROBE_VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, PROBE_FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 32, 32);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const pixels = new Uint8Array(32 * 32 * 4);
    gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels.join(',');
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/**
 * Do two identical draws read back identically? A browser that perturbs WebGL pixel readback would not.
 * `consistent` is null when the check could not run (it says nothing either way).
 * INFORMATIONAL ONLY: this is kept out of the hash (see `stableView`), so the hash is unchanged.
 */
export function readbackCheck() {
  try {
    const first = renderProbe();
    const second = renderProbe();
    if (first === null || second === null) return { consistent: null };
    return { consistent: first === second };
  } catch {
    return { consistent: null };
  }
}

export const webglCollector = {
  id: 'webgl',
  label: 'WebGL',
  timeoutMs: 3000,
  collect() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new UnsupportedError('WebGL is not available');

    try {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const unmasked = Boolean(debugInfo);
      return {
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        unmaskedInfoAvailable: unmasked, // false when the browser hides GPU details
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        shaderPrecision: shaderPrecisionInfo(gl),
        extensions: [...(gl.getSupportedExtensions() || [])].sort(),
        parameters: {
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxViewportDims: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
          maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
          maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
        },
        readbackCheck: readbackCheck(),
      };
    } finally {
      gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the GPU context
    }
  },
  // The hash input is exactly what it was before the readback check existed: that check is informational.
  stableView: (data) => {
    const hashed = { ...data };
    delete hashed.readbackCheck;
    return hashed;
  },
};
