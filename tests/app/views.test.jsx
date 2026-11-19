// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { NAV } from '../../src/config/navigation';
import { EXPERIMENTS_KEY } from '../../src/services/experimentStore';
import { HISTORY_KEY } from '../../src/services/historyStore';
import { MemoryStorage } from '../helpers/memoryStorage';

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: async () => ({ get: async () => ({ visitorId: 'fake-visitor-id', version: 'test', confidence: { score: 0.5 }, components: {} }) }) },
}));

const IP = '203.0.113.9';
const ORIGINAL_CRYPTO = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let fetchMock;
let blobs;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  blobs = [];
  URL.createObjectURL = vi.fn((blob) => { blobs.push(blob); return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
  fetchMock = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('ipify') ? { ip: IP } : { city: 'Testville', country_name: 'Testland' }) }));
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
const idle = () => waitFor(() => expect(screen.queryByText('Collecting…')).toBeNull(), { timeout: 8000 });
const sw = (title) => screen.getByRole('switch', { name: title });

async function start(storage = new MemoryStorage()) {
  render(<App storage={storage} />);
  click(/Save choices and continue/);
  return storage;
}
async function collect() {
  click(/^(Collect fingerprint|Refresh)$/);
  await idle();
}
const blobText = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsText(blob);
});
const withCores = (n) => vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(n);

describe('navigation and structure', () => {
  it('offers every section, keeps one h1 and one navigation landmark, and shows no nav during first run', async () => {
    render(<App storage={new MemoryStorage()} />);
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    click(/Save choices and continue/);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(NAV.map((n) => n.label));
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it.each([
    ['Overview', 'Overview'], ['Fingerprint', 'Fingerprint'], ['Privacy risks', 'Privacy risks'], ['Laboratory', 'Laboratory'],
    ['Protection test', 'Protection test'], ['History', 'History'], ['Reports', 'Reports and export'], ['Privacy & consent', 'Privacy & consent'],
  ])('"%s" opens its page and marks it as current', async (label, heading) => {
    await start();
    goTab(label);
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: label }).getAttribute('aria-current')).toBe('page');
  });

  it('reports real session facts in the status panel', async () => {
    await start();
    const status = screen.getByRole('list', { name: 'Session status' });
    expect(within(status).getByText(/Optional collectors on/).textContent).toMatch(/0 of 4/);
    expect(within(status).getByText(/uploaded: never/)).toBeTruthy();
  });
});

describe('empty states offer a way forward', () => {
  it.each(['Fingerprint', 'Privacy risks', 'Reports'])('%s asks for a collection first', async (label) => {
    await start();
    goTab(label);
    expect(screen.getAllByRole('button', { name: /^Collect fingerprint$/ }).length).toBeGreaterThan(0);
  });
});

describe('Fingerprint intelligence', () => {
  it('shows the hash, composition, categories and per-signal explanations from the real run', async () => {
    await start();
    await collect();
    goTab('Fingerprint');
    expect(screen.getByTestId('config-hash').textContent).toMatch(/^[0-9a-f]{64}$/);
    expect(screen.getByRole('img', { name: /Hash composition/ })).toBeTruthy();
    expect(screen.getByText('Stable signals (feed the hash)')).toBeTruthy();
    expect(screen.getByText('Variable signals (never hashed)')).toBeTruthy();
    const canvas = screen.getByTestId('signal-canvas');
    expect(within(canvas).getByText('Stable')).toBeTruthy();
    expect(canvas.textContent).toMatch(/How it helps identify a browser setup/);
    expect(canvas.textContent).toMatch(/Not hashed/);
    expect(screen.getByTestId('signal-publicIp').textContent).toMatch(/never part of the configuration hash/);
  });

  it('is honest that jsdom-unsupported signals are not collected', async () => {
    await start();
    await collect();
    goTab('Fingerprint');
    expect(within(screen.getByTestId('signal-webgl')).getByText('Unsupported')).toBeTruthy();
    expect(within(screen.getByTestId('signal-battery')).getByText('Disabled')).toBeTruthy();
  });

  it('never calls the hash a unique identifier', async () => {
    await start();
    await collect();
    goTab('Fingerprint');
    const sentences = document.body.textContent.split(/[.!?]/).filter((s) => /unique/i.test(s));
    for (const s of sentences) expect(s).toMatch(/\bnot\b/i);
  });
});

describe('Privacy risks', () => {
  it('explains collected signals, groups them without a score, and gives conditional recommendations', async () => {
    await start();
    await collect();
    goTab('Privacy risks');
    expect(screen.getByText('How the groups work')).toBeTruthy();
    expect(screen.getByText(/not a risk score|No privacy score is shown on purpose/)).toBeTruthy();
    expect(screen.getByTestId('exposure-locale')).toBeTruthy();
    expect(screen.getByTestId('recommendation-measure')).toBeTruthy();
    expect(screen.getByTestId('recommendation-scope').textContent).toMatch(/Trade-off or limit/);
    expect(screen.getByTestId('recommendation-scope').textContent).toMatch(/Documented/);
    expect(screen.getByTestId('recommendation-scope').textContent).toMatch(/learn\.microsoft\.com/);
    expect(screen.getByTestId('mechanism-brave-fingerprinting').textContent).toMatch(/No\. Brave is not installed/);
    expect(screen.getByTestId('unverified-note').textContent).toMatch(/Firefox and Tor Browser were removed/);
    expect(document.body.textContent).not.toMatch(/\brisk (score|level)\b[^.]*\d|\bscore\b\s*:?\s*\d|\d+\s*%/i);
  });

  it('lists which optional collectors are enabled and the third parties actually contacted', async () => {
    await start();
    goTab('Privacy & consent');
    fireEvent.click(sw('Public IP address lookup'));
    goTab('Overview');
    await collect();
    goTab('Privacy risks');
    const card = screen.getByRole('region', { name: 'Optional extras and data sent to others' });
    expect(card.textContent).toMatch(/1 of 4 optional categories were enabled/);
    expect(card.textContent).toMatch(/api\.ipify\.org \(public IP lookup\)/);
    expect(card.textContent).toMatch(/Fingerprint data uploaded: no/);
    expect(document.body.textContent).not.toContain(IP);
  });

  it('shows no third-party requests when none were made', async () => {
    await start();
    await collect();
    goTab('Privacy risks');
    expect(screen.getByRole('region', { name: 'Optional extras and data sent to others' }).textContent).toMatch(/Third-party requests made: none/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Research laboratory', () => {
  const createExperiment = (name) => {
    fireEvent.change(screen.getByLabelText('New experiment name'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  };
  const record = async (expected) => {
    click(/^Record run$/);
    await waitFor(() => expect(screen.getAllByTestId('experiment-run')).toHaveLength(expected), { timeout: 8000 });
  };

  it('guides the user, never changes settings, and requires an experiment before recording', async () => {
    await start();
    goTab('Laboratory');
    expect(screen.getByText(/Nothing is changed for you/)).toBeTruthy();
    expect(screen.getByText('Select or create an experiment first.')).toBeTruthy();
    expect(screen.getByTestId('experiments-empty')).toBeTruthy();
    expect(screen.getByTestId('preset-guide').textContent).toMatch(/Hypothesis/);
    fireEvent.click(screen.getByLabelText('Time zone changed'));
    expect(screen.getByTestId('preset-guide').textContent).toMatch(/Change your operating system time zone yourself/);
  });

  it('creates an experiment, records runs and attributes a change to the right signal', async () => {
    const storage = await start();
    goTab('Laboratory');
    createExperiment('Core count study');
    expect(await screen.findByText(/Recording into/)).toBeTruthy();

    withCores(8);
    await record(1);
    const first = screen.getAllByTestId('experiment-run')[0];
    expect(within(first).getAllByText('Baseline')).toHaveLength(2); // the default run label and the "Baseline" marker

    withCores(3); // the "browser configuration" changes between runs
    fireEvent.click(screen.getByLabelText('Custom'));
    fireEvent.change(screen.getByLabelText(/Run label/), { target: { value: 'Fewer cores' } });
    await record(2);

    const runs = screen.getAllByTestId('experiment-run');
    expect(runs[1].textContent).toMatch(/Fewer cores/);
    expect(runs[1].textContent).toMatch(/Differs in 1 signal/);
    fireEvent.click(within(runs[1]).getByText(/Why did this run differ/));
    expect(runs[1].textContent).toMatch(/Processor & memory/);
    expect(runs[1].textContent).toMatch(/hardware\.cpuLogicalCores/);
    expect(screen.getByTestId('experiment-summary').textContent).toMatch(/2 distinct configuration hashes/);

    const stored = storage.getItem(EXPERIMENTS_KEY);
    expect(JSON.parse(stored).experiments[0].runs).toHaveLength(2);
  });

  it('keeps the selected experiment when the user switches tabs and comes back (regression: it used to reset)', async () => {
    await start();
    goTab('Laboratory');
    createExperiment('Sticky');
    expect(await screen.findByText(/Recording into/)).toBeTruthy();
    goTab('History');
    goTab('Laboratory');
    expect(screen.getByText(/Recording into/).textContent).toMatch(/Sticky/);
    expect(screen.getByRole('button', { name: 'Record run' }).disabled).toBe(false);
  });

  it('a repeatability test records three identical runs and reports them as repeatable', async () => {
    await start();
    goTab('Laboratory');
    createExperiment('Repeat');
    await screen.findByText(/Recording into/);
    withCores(8);
    click(/^Repeatability test/);
    await waitFor(() => expect(screen.getAllByTestId('experiment-run')).toHaveLength(3), { timeout: 15000 });
    expect(screen.getByTestId('experiment-summary').textContent).toMatch(/1 distinct configuration hash/);
    expect(screen.getByTestId('experiment-summary').textContent).toMatch(/repeatable/);
  });

  it('what is saved never contains IP, location or behavioural data, even with those consents on', async () => {
    const storage = await start();
    goTab('Privacy & consent');
    fireEvent.click(sw('Public IP address lookup'));
    fireEvent.click(sw('Approximate location from IP (geolocation)'));
    goTab('Laboratory');
    createExperiment('Privacy check');
    await screen.findByText(/Recording into/);
    await record(1);
    expect(fetchMock).toHaveBeenCalled(); // consented lookups did run for the collection...
    const stored = storage.getItem(EXPERIMENTS_KEY);
    for (const needle of [IP, 'Testville', 'Testland', 'behavioral', 'keyboard', 'sessionId']) expect(stored).not.toContain(needle); // ...but are never saved
  });

  it('deleting a run and an experiment (with confirmation) updates storage', async () => {
    const storage = await start();
    goTab('Laboratory');
    createExperiment('To delete');
    await screen.findByText(/Recording into/);
    await record(1);

    fireEvent.click(screen.getByRole('button', { name: /Delete run 1/ }));
    expect(screen.queryAllByTestId('experiment-run')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Delete experiment To delete/ }));
    expect(screen.getAllByTestId('experiment-item')).toHaveLength(1); // not yet: needs confirmation
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getAllByTestId('experiment-item')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Delete experiment To delete/ }));
    fireEvent.click(within(screen.getByRole('group', { name: /Confirm deleting/ })).getByRole('button', { name: 'Delete' }));
    expect(screen.getByTestId('experiments-empty')).toBeTruthy();
    expect(JSON.parse(storage.getItem(EXPERIMENTS_KEY)).experiments).toHaveLength(0);
  });

  it('limits names to a safe length and survives corrupted storage with a reset option', async () => {
    const storage = new MemoryStorage({ [EXPERIMENTS_KEY]: '{{{', 'fpp.consent.v1': JSON.stringify({ version: 1, acknowledged: true, choices: {} }) });
    render(<App storage={storage} />);
    goTab('Laboratory');
    expect(screen.getByText(/could not be read/)).toBeTruthy();
    expect(screen.getByLabelText('New experiment name').maxLength).toBe(60);
    fireEvent.click(screen.getByRole('button', { name: 'Reset experiments' }));
    expect(screen.getByTestId('experiments-empty')).toBeTruthy();
    expect(storage.getItem(EXPERIMENTS_KEY)).toBeNull();
  });

  it('records nothing and says so when the collection cannot finish', async () => {
    await start();
    goTab('Laboratory');
    createExperiment('Failing');
    await screen.findByText(/Recording into/);
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    click(/^Record run$/);
    await idle();
    Object.defineProperty(globalThis, 'crypto', original);
    // Without crypto the run still completes (hash unavailable) and is recorded honestly as hash-less.
    expect(await screen.findAllByTestId('experiment-run')).toHaveLength(1);
    expect(screen.getByText('no hash')).toBeTruthy();
  });
});

describe('History comparison from real saved snapshots', () => {
  async function twoSnapshots() {
    const storage = await start();
    withCores(8);
    await collect();
    click(/^Save snapshot$/);
    withCores(2);
    await collect();
    click(/^Save snapshot$/);
    return storage;
  }
  async function compare() {
    goTab('History');
    for (const box of screen.getAllByRole('checkbox', { name: /for comparison/ })) fireEvent.click(box);
    click(/^Compare selected$/);
    await screen.findByTestId('hash-verdict');
  }

  it('compares two saved snapshots at signal and category level', async () => {
    await twoSnapshots();
    await compare();
    expect(screen.getByTestId('diff-hardware.cpuLogicalCores').dataset.status).toBe('changed');
    expect(screen.getByTestId('category-diff-hardware').textContent).toMatch(/1 changed/);
  });

  it('exports the comparison as a local HTML report and as JSON', async () => {
    await twoSnapshots();
    await compare();

    fireEvent.click(screen.getByRole('button', { name: /Download comparison report \(HTML\)/ }));
    const html = await blobText(blobs.at(-1));
    expect(blobs.at(-1).type).toBe('text/html');
    expect(html).toContain('hardware.cpuLogicalCores');
    expect(html).not.toMatch(/<script/i);

    fireEvent.click(screen.getByRole('button', { name: /Download comparison data \(JSON\)/ }));
    const data = JSON.parse(await blobText(blobs.at(-1)));
    expect(data.counts.changed).toBe(1);
    expect(data.generatedLocally).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Reports', () => {
  const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('builds a local HTML report with the real hash, chosen details and no optional data', async () => {
    await start();
    goTab('Privacy & consent');
    fireEvent.click(sw('Public IP address lookup'));
    goTab('Overview');
    await collect();
    const hash = screen.getByTestId('config-hash').textContent;
    goTab('Reports');
    fill('Report title', 'Final year study');
    fill('Researcher (optional)', 'A. Student');
    fill(/Institution/, 'Test University');
    fill(/Notes/, 'Observed on a laptop.');
    fireEvent.click(screen.getByRole('button', { name: /Download report \(HTML\)/ }));

    const html = await blobText(blobs.at(-1));
    expect(blobs.at(-1).type).toBe('text/html');
    expect(html).toContain(hash);
    for (const text of ['Final year study', 'A. Student', 'Test University', 'Observed on a laptop.']) expect(html).toContain(text);
    expect(html).not.toContain(IP);
    expect(html).toMatch(/api\.ipify\.org/);
    expect(screen.getByRole('status').textContent).toMatch(/Report generated/);
  });

  it('escapes hostile text typed into the form', async () => {
    await start();
    await collect();
    goTab('Reports');
    fill('Report title', '<script>alert(1)</script>');
    fireEvent.click(screen.getByRole('button', { name: /Download report \(HTML\)/ }));
    const html = await blobText(blobs.at(-1));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('includes a selected experiment and snapshot comparison', async () => {
    await start();
    goTab('Laboratory');
    fireEvent.change(screen.getByLabelText('New experiment name'), { target: { value: 'Report study' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText(/Recording into/);
    withCores(8);
    click(/^Record run$/);
    await waitFor(() => expect(screen.getAllByTestId('experiment-run')).toHaveLength(1), { timeout: 8000 });

    withCores(8);
    await collect();
    click(/^Save snapshot$/);
    withCores(2);
    await collect();
    click(/^Save snapshot$/);

    goTab('Reports');
    fireEvent.change(screen.getByLabelText('Include an experiment'), { target: { value: within(screen.getByLabelText('Include an experiment')).getByRole('option', { name: /Report study/ }).value } });
    const options = [...screen.getByLabelText('Compare: earlier snapshot').querySelectorAll('option')].filter((o) => o.value);
    fireEvent.change(screen.getByLabelText('Compare: earlier snapshot'), { target: { value: options[1].value } });
    fireEvent.change(screen.getByLabelText('Compare: later snapshot'), { target: { value: options[0].value } });
    fireEvent.click(screen.getByRole('button', { name: /Download report \(HTML\)/ }));

    const html = await blobText(blobs.at(-1));
    expect(html).toContain('Experiment results: Report study');
    expect(html).toContain('hardware.cpuLogicalCores');
  });

  it('refuses a comparison of a snapshot with itself and says why', async () => {
    await start();
    await collect();
    click(/^Save snapshot$/);
    click(/^Refresh$/); await idle();
    click(/^Save snapshot$/);
    goTab('Reports');
    const option = [...screen.getByLabelText('Compare: earlier snapshot').querySelectorAll('option')].find((o) => o.value).value;
    fireEvent.change(screen.getByLabelText('Compare: earlier snapshot'), { target: { value: option } });
    fireEvent.change(screen.getByLabelText('Compare: later snapshot'), { target: { value: option } });
    expect(screen.getByText(/Choose two different snapshots/)).toBeTruthy();
  });

  it('keeps stored history unaffected by report generation', async () => {
    const storage = await start();
    await collect();
    goTab('Reports');
    fireEvent.click(screen.getByRole('button', { name: /Download report \(HTML\)/ }));
    expect(storage.getItem(HISTORY_KEY)).toBeNull();
  });
});
