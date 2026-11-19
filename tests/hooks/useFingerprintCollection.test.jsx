// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFingerprintCollection } from '../../src/hooks/useFingerprintCollection';

/**
 * Consent revocation WHILE a collection is running.
 *
 * The collector registry is replaced by controllable fakes: the three
 * consent-gated collectors only finish when the test says so, which lets a
 * test revoke consent at the exact moment a request is "in flight".
 */
const ctl = vi.hoisted(() => {
  const state = { calls: [], signals: {}, gates: {} };
  state.reset = () => {
    state.calls = [];
    state.signals = {};
    for (const id of ['publicIp', 'geolocation', 'battery']) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      state.gates[id] = { promise, resolve };
    }
  };
  state.reset();
  return state;
});

vi.mock('../../src/collectors', () => {
  const gated = (id, requires) => ({
    id,
    label: id,
    requires,
    timeoutMs: 10000,
    collect: (context = {}) => {
      ctl.calls.push(id);
      ctl.signals[id] = context.signal;
      return ctl.gates[id].promise; // finishes only when the test resolves the gate
    },
  });
  const alpha = { id: 'alpha', label: 'alpha', timeoutMs: 1000, collect: () => ({ v: 1 }), stableView: (d) => d };
  const volatile = [gated('publicIp', 'publicIp'), gated('geolocation', 'geolocation'), gated('battery', 'extended')];
  return { STABLE_COLLECTORS: [alpha], VOLATILE_COLLECTORS: volatile, ALL_COLLECTORS: [alpha, ...volatile] };
});

const SECRET = 'SECRET-203.0.113.9';
const ALL_ON = { extended: true, publicIp: true, geolocation: true, behavioral: true };
const OFF = { extended: false, publicIp: false, geolocation: false, behavioral: false };

beforeEach(() => ctl.reset());

/** Render the hook and record every report that was ever rendered (to catch transient leaks). */
function setup() {
  const everRendered = [];
  const view = renderHook(() => {
    const hook = useFingerprintCollection();
    everRendered.push(hook.report ? JSON.stringify(hook.report) : null);
    return hook;
  });
  return { ...view, everRendered };
}

const startRun = (result, getChoices, getBehavioral = () => null) => {
  let promise;
  act(() => { promise = result.current.collect(getChoices, getBehavioral); });
  return promise;
};
const finished = async (result, promise) => {
  await act(async () => { await promise; });
  await waitFor(() => expect(result.current.status).toBe('done'));
  return result.current.report;
};
const status = (report, id) => report.diagnostics.find((d) => d.id === id)?.status;

describe('revoking a category while collection is running', () => {
  it('discards the late result of the revoked category, and it is never rendered', async () => {
    const { result, everRendered } = setup();
    let choices = { ...OFF, publicIp: true };
    const run = startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toContain('publicIp'));

    choices = { ...choices, publicIp: false }; // user revokes
    act(() => result.current.redact('publicIp'));
    ctl.gates.publicIp.resolve({ ip: SECRET }); // the request "returns" after revocation

    const report = await finished(result, run);
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(report.volatile.publicIp).toBeUndefined();
    expect(status(report, 'publicIp')).toBe('disabled');
    expect(everRendered.join('|')).not.toContain(SECRET);
  });

  it('aborts the in-flight request and does not wait for it', async () => {
    const { result } = setup();
    let choices = { ...OFF, publicIp: true };
    const run = startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toContain('publicIp'));
    expect(ctl.signals.publicIp.aborted).toBe(false);

    choices = { ...choices, publicIp: false };
    act(() => result.current.redact('publicIp'));
    expect(ctl.signals.publicIp.aborted).toBe(true);

    // The gate is NEVER resolved: the run must still finish (no indefinite loading).
    const report = await finished(result, run);
    expect(status(report, 'publicIp')).toBe('disabled');
  });

  it('discards results even if consent is granted AGAIN before the run ends (revoke then re-grant)', async () => {
    const { result, everRendered } = setup();
    let choices = { ...OFF, publicIp: true };
    const run = startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toContain('publicIp'));

    choices = { ...choices, publicIp: false };
    act(() => result.current.redact('publicIp'));
    choices = { ...choices, publicIp: true }; // re-granted while the old run is still going
    ctl.gates.publicIp.resolve({ ip: SECRET });

    const report = await finished(result, run);
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(everRendered.join('|')).not.toContain(SECRET);
  });

  it('discards a result that had ALREADY ARRIVED when consent is revoked and re-granted before the run ends', async () => {
    // publicIp finishes first; the run is still waiting on geolocation when the user flips the switch off and on.
    // Nothing is in flight for publicIp any more, so only the per-run revocation record can protect it.
    const { result, everRendered } = setup();
    let choices = { ...OFF, publicIp: true, geolocation: true };
    const run = startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toEqual(expect.arrayContaining(['publicIp', 'geolocation'])));

    ctl.gates.publicIp.resolve({ ip: SECRET }); // arrives while the run is still going
    await act(async () => { await ctl.gates.publicIp.promise; });

    choices = { ...choices, publicIp: false };
    act(() => result.current.redact('publicIp')); // revoked after its data already exists
    choices = { ...choices, publicIp: true }; // ...and granted again before the run finishes
    ctl.gates.geolocation.resolve({ city: 'Testville' });

    const report = await finished(result, run);
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(report.volatile.publicIp).toBeUndefined();
    expect(report.volatile.geolocation).toEqual({ city: 'Testville' }); // unrelated category unaffected
    expect(everRendered.join('|')).not.toContain(SECRET);
  });

  it('is independent per category: revoking one keeps the other category\'s result', async () => {
    const { result } = setup();
    let choices = { ...OFF, publicIp: true, geolocation: true };
    const run = startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toEqual(expect.arrayContaining(['publicIp', 'geolocation'])));

    choices = { ...choices, geolocation: false };
    act(() => result.current.redact('geolocation'));
    expect(ctl.signals.publicIp.aborted).toBe(false); // untouched
    expect(ctl.signals.geolocation.aborted).toBe(true);
    ctl.gates.publicIp.resolve({ ip: 'KEEP-ME' });
    ctl.gates.geolocation.resolve({ city: SECRET });

    const report = await finished(result, run);
    expect(report.volatile.publicIp).toEqual({ ip: 'KEEP-ME' });
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it('never reads behavioural data once that category was revoked mid-run', async () => {
    const { result } = setup();
    const getBehavioral = vi.fn(() => ({ mouse: { samples: 9 }, keyboard: {}, touch: {} }));
    let choices = { ...OFF, behavioral: true, publicIp: true };
    const run = startRun(result, () => choices, getBehavioral);
    await waitFor(() => expect(ctl.calls).toContain('publicIp'));

    choices = { ...choices, behavioral: false };
    act(() => result.current.redact('behavioral'));
    ctl.gates.publicIp.resolve({ ip: 'x' });

    const report = await finished(result, run);
    expect(getBehavioral).not.toHaveBeenCalled();
    expect(report.volatile.behavioral).toBeUndefined();
  });

  it('keeps the stable hash identical to a run with no revocation', async () => {
    const baseline = setup();
    const baselineRun = startRun(baseline.result, () => OFF);
    const baselineHash = (await finished(baseline.result, baselineRun)).stableFingerprint.hash;
    baseline.unmount();
    ctl.reset();

    const { result } = setup();
    let choices = { ...ALL_ON };
    const run = startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toEqual(expect.arrayContaining(['publicIp', 'geolocation', 'battery'])));
    choices = { ...OFF };
    for (const id of ['publicIp', 'geolocation', 'extended', 'behavioral']) act(() => result.current.redact(id));

    const report = await finished(result, run);
    expect(report.stableFingerprint.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(report.stableFingerprint.hash).toBe(baselineHash);
  });
});

describe('after revocation, future requests are blocked', () => {
  it('a new run with the category off never starts its collector', async () => {
    const { result } = setup();
    const run = startRun(result, () => OFF);
    const report = await finished(result, run);
    expect(ctl.calls).toEqual([]); // no gated collector (so no request) was even invoked
    for (const id of ['publicIp', 'geolocation', 'battery']) expect(status(report, id)).toBe('disabled');
  });

  it('a run started right after a mid-run revocation does not start the revoked collector', async () => {
    const { result } = setup();
    let choices = { ...OFF, publicIp: true };
    startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toContain('publicIp'));
    choices = { ...choices, publicIp: false };
    act(() => result.current.redact('publicIp'));

    ctl.calls.length = 0;
    const second = startRun(result, () => choices);
    const report = await finished(result, second);
    expect(ctl.calls).not.toContain('publicIp');
    expect(status(report, 'publicIp')).toBe('disabled');
  });

  it('a stale run that finishes late cannot overwrite or leak into the newer run', async () => {
    const { result, everRendered } = setup();
    let choices = { ...OFF, publicIp: true };
    const first = startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toContain('publicIp'));

    choices = { ...choices, publicIp: false };
    act(() => result.current.redact('publicIp'));
    const second = startRun(result, () => choices);
    await finished(result, second);

    ctl.gates.publicIp.resolve({ ip: SECRET }); // the OLD run's request returns now
    await act(async () => { await first; });

    expect(JSON.stringify(result.current.report)).not.toContain(SECRET);
    expect(everRendered.join('|')).not.toContain(SECRET);
  });

  it('an earlier revocation does not poison a later run once consent is granted again', async () => {
    const { result } = setup();
    act(() => result.current.redact('publicIp')); // revoked while idle
    const choices = { ...OFF, publicIp: true }; // later, the user opts in again
    const run = startRun(result, () => choices);
    await waitFor(() => expect(ctl.calls).toContain('publicIp'));
    ctl.gates.publicIp.resolve({ ip: 'LEGIT' });
    const report = await finished(result, run);
    expect(report.volatile.publicIp).toEqual({ ip: 'LEGIT' });
  });

  it('revoking when nothing has been collected does nothing and does not throw', () => {
    const { result } = setup();
    expect(() => act(() => result.current.redact('geolocation'))).not.toThrow();
    expect(result.current.report).toBeNull();
  });

  it('unmounting aborts in-flight requests', async () => {
    const { result, unmount } = setup();
    startRun(result, () => ({ ...OFF, publicIp: true }));
    await waitFor(() => expect(ctl.calls).toContain('publicIp'));
    unmount();
    expect(ctl.signals.publicIp.aborted).toBe(true);
  });
});
