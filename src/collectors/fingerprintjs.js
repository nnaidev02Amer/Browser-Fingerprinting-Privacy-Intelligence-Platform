import FingerprintJS from '@fingerprintjs/fingerprintjs';

export const fingerprintJsCollector = {
  id: 'fingerprintjs',
  label: 'FingerprintJS',
  timeoutMs: 8000,
  async collect() {
    // `monitoring: false` is essential: by default the library sends an
    // anonymous usage ping to openfpcdn.io, which would be an external
    // request this app never asked the user to consent to.
    const agent = await FingerprintJS.load({ monitoring: false });
    const result = await agent.get();

    const componentStatus = {};
    for (const [name, component] of Object.entries(result.components)) {
      componentStatus[name] = 'error' in component ? 'error' : 'ok';
    }

    return {
      visitorId: result.visitorId,
      libraryVersion: result.version,
      confidenceScore: result.confidence?.score ?? null,
      componentStatus,
    };
  },
  stableView: (data) => ({ visitorId: data.visitorId }),
};
