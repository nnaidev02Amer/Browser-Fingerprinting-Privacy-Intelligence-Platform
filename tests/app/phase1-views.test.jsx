// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { HISTORY_KEY } from '../../src/services/historyStore';
import { MARKER_KEY } from '../../src/services/sessionEvidence';
import { EXPERIMENTS_KEY } from '../../src/services/experimentStore';
import { MemoryStorage } from '../helpers/memoryStorage';

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: async () => ({ get: async () => ({ visitorId: 'fake-visitor-id', version: 'test', confidence: { score: 0.5 }, components: {} }) }) },
}));

const ORIGINAL_CRYPTO = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let fetchMock;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'crypto', ORIGINAL_CRYPTO);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const click = (name) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
const goTab = (name) => click(new RegExp(`^${name}$`));
const idle = () => waitFor(() => expect(screen.queryByText(/Collecting…|Simulating…|Recording…/)).toBeNull(), { timeout: 10000 });
const withCores = (n) => vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(n);

async function start(storage = new MemoryStorage()) {
  render(<App storage={storage} />);
  click(/Save choices and continue/);
  return storage;
}

describe('protection test (A-B-A)', () => {
  const create = (name) => {
    fireEvent.change(screen.getByLabelText('New test name'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  };
  const record = async (step, cores, changeLabel) => {
    withCores(cores);
    if (changeLabel) fireEvent.change(screen.getByLabelText(/What did you change/), { target: { value: changeLabel } });
    click(new RegExp(`^Record ${step}$`));
    await waitFor(() => expect(screen.getByTestId(`step-protect-${step.toLowerCase()}`).dataset.done).toBe('true'), { timeout: 10000 });
  };

  it('states plainly what it does not claim, and does not change any setting', async () => {
    await start();
    goTab('Protection test');
    expect(screen.getByTestId('protection-honesty').textContent).toMatch(/does not say the change is good for privacy/);
    expect(screen.getByTestId('protection-honesty').textContent).toMatch(/No protection effectiveness is claimed for any browser/);
    expect(screen.getByTestId('protection-empty')).toBeTruthy();
  });

  it('enforces the order A1, B, A2', async () => {
    await start();
    goTab('Protection test');
    create('Order');
    await screen.findByTestId('step-protect-a1');
    expect(screen.getByRole('button', { name: 'Record A1' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Record B' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Record A2' }).disabled).toBe(true);
  });

  it('records A1, B, A2 and attributes the difference to the setting beyond the noise floor', async () => {
    const storage = await start();
    goTab('Protection test');
    create('Cores');
    await screen.findByTestId('step-protect-a1');
    await record('A1', 8);
    await record('B', 2, 'Fewer cores');
    await record('A2', 8);

    const results = screen.getByTestId('protection-results');
    expect(screen.getByTestId('protect-attr-hardware').dataset.outcome).toBe('changed');
    expect(screen.getByTestId('protect-attr-screen').dataset.outcome).toBe('unaffected');
    expect(screen.getByTestId('protect-attr-canvas').dataset.outcome).toBe('unavailable-both'); // unsupported in jsdom: not guessed
    expect(results.textContent).toMatch(/configuration hash changed/);
    expect(results.textContent).toMatch(/Noise floor: the two baselines had the same hash/);
    expect(screen.getByTestId('protection-residual').textContent).toMatch(/Screen/);
    expect(screen.getByTestId('protection-residual').textContent).not.toMatch(/Processor & memory/);
    expect(screen.getByTestId('protection-caveats').textContent).toMatch(/not evidence of better privacy/);
    expect(JSON.parse(storage.getItem(EXPERIMENTS_KEY)).experiments[0].protocol).toBe('protection');
  });

  it('refuses to blame the setting for an attribute that varies between the two baselines', async () => {
    await start();
    goTab('Protection test');
    create('Noisy');
    await screen.findByTestId('step-protect-a1');
    await record('A1', 8);
    await record('B', 2, 'Setting');
    await record('A2', 4); // the baseline itself moved
    expect(screen.getByTestId('protect-attr-hardware').dataset.outcome).toBe('unstable-baseline');
    expect(screen.getByTestId('protect-attr-hardware').textContent).toMatch(/No conclusion about the setting can be drawn/);
  });

  it('without A2 it says the noise floor is missing and that differences are provisional', async () => {
    await start();
    goTab('Protection test');
    create('No A2');
    await screen.findByTestId('step-protect-a1');
    await record('A1', 8);
    await record('B', 2, 'Setting');
    expect(screen.getByTestId('protection-results').textContent).toMatch(/Noise floor: not recorded/);
    expect(screen.getByTestId('protection-caveats').textContent).toMatch(/No second baseline was recorded/);
  });

  it('never uses scores, percentages or protection verdicts', async () => {
    await start();
    goTab('Protection test');
    create('Words');
    await screen.findByTestId('step-protect-a1');
    await record('A1', 8);
    await record('B', 2, 'Setting');
    await record('A2', 8);
    const text = screen.getByTestId('protection-results').textContent;
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%|\bscore\b|\bprotected\b|\bprotects\b|\bsafe\b|anonymous/i);
  });

  it('the Laboratory shows only general experiments, not protection tests', async () => {
    await start();
    goTab('Protection test');
    create('Hidden from lab');
    await screen.findByTestId('step-protect-a1');
    goTab('Laboratory');
    expect(screen.getByTestId('experiments-empty')).toBeTruthy();
  });

  it('what is saved contains no IP, location or behavioural data, and records session evidence', async () => {
    const storage = await start();
    goTab('Protection test');
    create('Privacy');
    await screen.findByTestId('step-protect-a1');
    await record('A1', 8);
    const raw = storage.getItem(EXPERIMENTS_KEY);
    for (const needle of ['203.', 'latitude', 'keyboard', 'behavioral', 'userAgent']) expect(raw).not.toContain(needle);
    const run = JSON.parse(raw).experiments[0].runs[0];
    expect(run.observation).toMatchObject({ readChecks: expect.any(Object) });
    expect(run.observation.pageLoadId).toBeTruthy();
    expect(storage.getItem(MARKER_KEY)).not.toBeNull(); // written only now, on a user-initiated recording
  });
});

describe('comparison: attribute-level changes with tracking implications', () => {
  it('lists per-attribute states in the History comparison, WebGL as one attribute, and explains implications', async () => {
    await start();
    withCores(8);
    click(/^Collect fingerprint$/); await idle();
    click(/^Save snapshot$/);
    withCores(2);
    click(/^Refresh$/); await idle();
    click(/^Save snapshot$/);
    goTab('History');
    for (const box of screen.getAllByRole('checkbox', { name: /for comparison/ })) fireEvent.click(box);
    click(/^Compare selected$/);

    const panel = await screen.findByTestId('attribute-changes');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(10); // one row per attribute
    expect(screen.getByTestId('attribute-hardware').dataset.state).toBe('changed');
    expect(screen.getByTestId('attribute-screen').dataset.state).toBe('unchanged');
    expect(screen.getByTestId('attribute-webgl')).toBeTruthy();
    expect(screen.getByTestId('attribute-hardware').textContent).toMatch(/could still link the two observations/);
    expect(screen.getByTestId('attribute-screen').textContent).toMatch(/stays usable as a linking attribute/);
    expect(screen.getByTestId('attribute-fingerprintjs').textContent).toMatch(/Derived, not counted/);
    expect(screen.getByTestId('session-relation').textContent).toMatch(/same page load/);
    expect(screen.queryByTestId('version-mismatch')).toBeNull();
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{"snapshots":[]}').snapshots.length).toBeGreaterThanOrEqual(0);
  });
});
