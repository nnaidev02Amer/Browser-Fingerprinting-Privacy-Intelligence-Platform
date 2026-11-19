// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { verifyBundle } from '../../src/utils/researchBundle';
import { MemoryStorage } from '../helpers/memoryStorage';

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: async () => ({ get: async () => ({ visitorId: 'fake-visitor-id', version: 'test', confidence: { score: 0.5 }, components: {} }) }) },
}));

const ORIGINAL_CRYPTO = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let fetchMock;
let blobs;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  blobs = [];
  URL.createObjectURL = vi.fn((blob) => { blobs.push(blob); return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
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
const idle = () => waitFor(() => expect(screen.queryByText(/Collecting…|Recording…|Simulating…/)).toBeNull(), { timeout: 10000 });
const withCores = (n) => vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(n);
const blobText = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsText(blob); });

async function start() {
  const storage = new MemoryStorage();
  render(<App storage={storage} />);
  click(/Save choices and continue/);
  return storage;
}
async function recordProtectionTest(name = 'Cores') {
  goTab('Protection test');
  fireEvent.change(screen.getByLabelText('New test name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await screen.findByTestId('step-protect-a1');
  const record = async (step, cores, label) => {
    withCores(cores);
    if (label) fireEvent.change(screen.getByLabelText(/What did you change/), { target: { value: label } });
    click(new RegExp(`^Record ${step}$`));
    await waitFor(() => expect(screen.getByTestId(`step-protect-${step.toLowerCase()}`).dataset.done).toBe('true'), { timeout: 10000 });
  };
  await record('A1', 8);
  await record('B', 2, 'Fewer cores');
  await record('A2', 8);
}

describe('research bundle export in the app (export only)', () => {
  it('downloads a verifiable bundle from the Protection results, without any network request', async () => {
    await start();
    await recordProtectionTest();
    fireEvent.click(within(screen.getByTestId('bundle-export')).getByRole('button', { name: /Download research bundle/ }));
    await waitFor(() => expect(blobs.length).toBe(1));
    expect(blobs[0].type).toBe('application/json');
    const text = await blobText(blobs[0]);
    const bundle = JSON.parse(text);
    expect(bundle.schema).toBe('fpp-research-bundle');
    expect(bundle.limitations.join(' ')).toMatch(/No uniqueness, entropy, population statistic or risk score/);
    expect((await verifyBundle(bundle)).ok).toBe(true);
    expect(screen.getByTestId('bundle-export').textContent).toMatch(/does not import bundles/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the Reports page exports a chosen experiment, and says so when there is nothing to export', async () => {
    await start();
    goTab('Reports');
    expect(screen.queryByTestId('bundle-empty')).toBeNull(); // no report yet: the page asks for a collection first
    click(/^Collect fingerprint$/);
    await idle();
    expect(screen.getByTestId('bundle-empty')).toBeTruthy();
    await recordProtectionTest('Reports export');
    goTab('Reports');
    fireEvent.change(screen.getByLabelText('Experiment'), { target: { value: within(screen.getByLabelText('Experiment')).getAllByRole('option')[1].value } });
    fireEvent.click(within(screen.getByTestId('bundle-export')).getByRole('button', { name: /Download research bundle/ }));
    await waitFor(() => expect(blobs.length).toBe(1));
    expect(JSON.parse(await blobText(blobs[0])).experiments[0].name).toBe('Reports export');
  });

  it('without Web Crypto it explains why instead of producing an unchecked bundle', async () => {
    await start();
    await recordProtectionTest();
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    fireEvent.click(within(screen.getByTestId('bundle-export')).getByRole('button', { name: /Download research bundle/ }));
    expect((await screen.findByText(/needs Web Crypto/)).getAttribute('role')).toBe('alert');
    expect(blobs.length).toBe(0);
  });

  it('there is no way to import: no file input anywhere in the running app', async () => {
    await start();
    for (const tab of ['Overview', 'Fingerprint', 'Privacy risks', 'Laboratory', 'Protection test', 'History', 'Reports', 'Privacy & consent']) {
      goTab(tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      expect(document.querySelector('input[type=file]')).toBeNull();
    }
  });
});

describe('Protection results: repeatability counts', () => {
  it('shows "identical in k of m baseline runs" as counts, never percentages', async () => {
    await start();
    await recordProtectionTest();
    const panel = screen.getByTestId('protection-stability');
    expect(screen.getByTestId('stability-screen').textContent).toMatch(/identical in 2 of 2 baseline runs/);
    expect(screen.getByTestId('stability-canvas').textContent).toMatch(/not readable/); // unsupported in jsdom: not guessed
    expect(panel.textContent).toMatch(/not percentages or probabilities/);
    expect(panel.textContent).not.toMatch(/\d+\s*%/);
  });
});

describe('Findings and recommendations in the Exposure view', () => {
  it('says nothing has been measured when there is no experiment data', async () => {
    await start();
    click(/^Collect fingerprint$/);
    await idle();
    goTab('Privacy risks');
    expect(screen.getByTestId('no-findings').textContent).toMatch(/Nothing has been measured/);
    expect(screen.getByTestId('recommendation-measure')).toBeTruthy();
  });

  it('turns a real Protection test into traceable findings grouped by environment, and an actionable recommendation', async () => {
    await start();
    await recordProtectionTest();
    goTab('Privacy risks');
    const f1 = screen.getAllByTestId(/^finding-F1/);
    expect(f1.length).toBe(1);
    expect(f1[0].textContent).toMatch(/Processor & memory differed from the baseline beyond baseline variation/);
    expect(f1[0].textContent).toMatch(/Reproducible experiment/);
    expect(document.querySelector('[data-testid^="findings-"]')).not.toBeNull();
    const rec = document.querySelector('[data-testid^="recommendation-rec-effect"]');
    expect(rec.textContent).toMatch(/What to do:.*A3 baseline/);
    expect(rec.textContent).toMatch(/not evidence of better privacy/);
    expect(screen.queryByTestId('recommendation-measure')).toBeNull(); // already measured
    expect(document.body.textContent).not.toMatch(/\d+\s*%/);
  });
});

describe('Distinguishability in the experiment pages', () => {
  it('Protection test: says "not enough data" when only one setup exists, and the Laboratory shows the same panel', async () => {
    await start();
    await recordProtectionTest('Panel');
    // Baseline x2 and one changed setup: enough to say which detail tells them apart
    const text = screen.getByTestId('distinct-set').textContent;
    expect(text).toMatch(/small set of 1 attribute\(s\) separated every pair that could be separated: Processor & memory/);
    expect(text).toMatch(/not guaranteed to be the smallest possible/);
    expect(screen.getByTestId('distinct-plain').textContent).toMatch(/would only need to look at: Processor & memory/);
    expect(screen.getByTestId('distinct-v2').textContent).toMatch(/says nothing about how rare any value is/);
    expect(document.querySelector('#distinguishability').textContent).not.toMatch(/d+s*%|entropy|uniqueness/i);
  });
});

describe('Report: provenance and findings', () => {
  it('includes versions and findings grouped by environment, and no IP', async () => {
    await start();
    await recordProtectionTest('Report findings');
    goTab('Reports');
    fireEvent.click(screen.getByRole('button', { name: /Download report \(HTML\)/ }));
    await waitFor(() => expect(blobs.length).toBe(1));
    const html = await blobText(blobs[0]);
    expect(html).toMatch(/Findings from your experiments/);
    expect(html).toMatch(/Processor &amp; memory differed from the baseline/);
    expect(html).toMatch(/Application version/);
    expect(html).toMatch(/FingerprintJS version/);
    expect(html).toMatch(/Hash input version/);
    expect(html).not.toMatch(/<script/i);
  });
});
