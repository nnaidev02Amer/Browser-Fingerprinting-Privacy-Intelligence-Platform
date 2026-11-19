import { describe, expect, it } from 'vitest';
import { STATUS, runCollector, runCollectors } from '../../src/collectors/runner';
import { UnsupportedError } from '../../src/utils/errors';

describe('runCollector: independent error handling and timeouts', () => {
  it('reports a hung collector as "timeout" instead of loading forever', async () => {
    const started = Date.now();
    const r = await runCollector({ id: 'x', label: 'X', timeoutMs: 60, collect: () => new Promise(() => {}) });
    expect(r.status).toBe(STATUS.TIMEOUT);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('maps UnsupportedError to "unsupported" and keeps the reason', async () => {
    const r = await runCollector({ id: 'x', label: 'X', collect: () => { throw new UnsupportedError('no api'); } });
    expect([r.status, r.reason]).toEqual([STATUS.UNSUPPORTED, 'no api']);
  });

  it('maps unexpected sync and async throws to "error" and never rejects', async () => {
    const sync = await runCollector({ id: 'a', label: 'A', collect: () => { throw new Error('boom'); } });
    const async_ = await runCollector({ id: 'b', label: 'B', collect: async () => { throw new Error('boom'); } });
    expect(sync.status).toBe(STATUS.ERROR);
    expect(async_.status).toBe(STATUS.ERROR);
  });

  it('returns the data for a successful collector', async () => {
    const r = await runCollector({ id: 'ok', label: 'OK', collect: () => ({ v: 1 }) });
    expect(r).toMatchObject({ status: STATUS.OK, data: { v: 1 } });
  });

  it('one failing collector does not affect the others', async () => {
    const results = await runCollectors(
      [
        { id: 'bad', label: 'Bad', collect: () => { throw new Error('x'); } },
        { id: 'good', label: 'Good', collect: () => 42 },
      ],
      {},
    );
    expect(results.map((r) => r.status)).toEqual([STATUS.ERROR, STATUS.OK]);
  });
});

describe('runCollectors: consent gate', () => {
  const spyCollector = (requires) => {
    const calls = { n: 0 };
    return { calls, collector: { id: requires ?? 'essential', label: 'L', requires, collect: () => { calls.n += 1; return 'data'; } } };
  };

  it('essential collectors (no `requires`) always run', async () => {
    const { calls, collector } = spyCollector(undefined);
    const [r] = await runCollectors([collector], {});
    expect(calls.n).toBe(1);
    expect(r.status).toBe(STATUS.OK);
  });

  it.each([undefined, {}, { publicIp: false }, { publicIp: 'true' }, { publicIp: 1 }, { publicIp: null }])(
    'does NOT execute a gated collector when choices are %j (strict === true)',
    async (choices) => {
      const { calls, collector } = spyCollector('publicIp');
      const [r] = await runCollectors([collector], choices);
      expect(calls.n).toBe(0);
      expect(r.status).toBe(STATUS.DISABLED);
      expect(r.reason).toMatch(/consent not granted/);
    },
  );

  it('executes a gated collector only with its own category set to true', async () => {
    const { calls, collector } = spyCollector('publicIp');
    const [r] = await runCollectors([collector], { publicIp: true });
    expect(calls.n).toBe(1);
    expect(r.status).toBe(STATUS.OK);
  });

  it('granting one category does not enable another', async () => {
    const a = spyCollector('publicIp');
    const b = spyCollector('geolocation');
    await runCollectors([a.collector, b.collector], { publicIp: true, geolocation: false });
    expect([a.calls.n, b.calls.n]).toEqual([1, 0]);
  });

  it('reports progress for every collector, including disabled ones', async () => {
    const seen = [];
    await runCollectors(
      [spyCollector('publicIp').collector, spyCollector(undefined).collector],
      {},
      (done, total) => seen.push([done, total]),
    );
    expect(seen.at(-1)).toEqual([2, 2]);
  });
});
