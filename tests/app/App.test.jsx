// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { CONSENT_KEY } from '../../src/services/consentStore';
import { HISTORY_KEY } from '../../src/services/historyStore';
import { MemoryStorage } from '../helpers/memoryStorage';

// FingerprintJS needs a real rendering environment; a plain stub is enough here.
vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: async () => ({ get: async () => ({ visitorId: 'fake-visitor-id', version: 'test', confidence: { score: 0.5 }, components: { a: { value: 1, duration: 1 } } }) }) },
}));

const IP = '203.0.113.9';
const ORIGINAL_CRYPTO = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const json = (body) => ({ ok: true, status: 200, json: async () => body });
let fetchMock;

beforeEach(() => {
  // jsdom has no canvas/audio/WebGL: those collectors report "unsupported", like an old browser.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });

  fetchMock = vi.fn(async (url) => {
    if (String(url).startsWith('https://api.ipify.org')) return json({ ip: IP });
    if (String(url).startsWith('https://ipapi.co')) return json({ ip: IP, city: 'Testville', country_name: 'Testland', org: 'Test ISP' });
    throw new Error(`UNEXPECTED REQUEST: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  // Always restore Web Crypto, even if a test failed mid-way, so one failure cannot cascade.
  Object.defineProperty(globalThis, 'crypto', ORIGINAL_CRYPTO);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- helpers
const renderApp = (storage = new MemoryStorage()) => ({ storage, ...render(<App storage={storage} />) });
const click = (name) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
const goTab = (name) => click(new RegExp(`^${name}$`));
const acknowledge = () => click(/Save choices and continue/);
const sw = (title) => screen.getByRole('switch', { name: new RegExp(title) });
const setSwitch = (title, on) => { if (sw(title).checked !== on) fireEvent.click(sw(title)); };
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const reportJson = () => JSON.parse(screen.getByTestId('report-json').textContent);

async function collect() {
  click(/^(Collect fingerprint|Refresh)$/);
  await waitFor(() => expect(screen.queryByText('Collecting…')).toBeNull(), { timeout: 5000 });
  await screen.findByTestId('config-hash', {}, { timeout: 5000 });
}

async function startedApp(storage) {
  const view = renderApp(storage);
  acknowledge();
  return view;
}

// ---------------------------------------------------------------- tests
describe('first-time experience', () => {
  it('shows the privacy explanation first, with no tabs and no Collect button', () => {
    renderApp();
    expect(screen.getByText('Before you start')).toBeTruthy();
    expect(screen.getByText(/Nothing is collected until you press/)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Collect fingerprint/ })).toBeNull();
  });

  it('every optional category starts OFF', () => {
    renderApp();
    for (const title of ['Extended device', 'Public IP address lookup', 'Approximate location from IP', 'Behavioural timing']) {
      expect(sw(title).checked).toBe(false);
    }
  });

  it('explains what / why / where and names the third parties', () => {
    renderApp();
    expect(screen.getAllByText('What, why and where').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText(/Contacts a third party: api\.ipify\.org/)).toBeTruthy();
    expect(screen.getByText(/Contacts a third party: ipapi\.co/)).toBeTruthy();
  });

  it('makes NO network request and attaches NO behavioural listeners before the user does anything', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderApp();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(add.mock.calls.map((c) => c[0]).filter((t) => ['keydown', 'keyup', 'mousemove', 'touchmove', 'click'].includes(t))).toEqual([]);
  });

  it('continuing opens the dashboard; consent is saved with every optional category still off', async () => {
    const { storage } = await startedApp();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    await waitFor(() => expect(storage.getItem(CONSENT_KEY)).not.toBeNull());
    const saved = JSON.parse(storage.getItem(CONSENT_KEY));
    expect(saved.acknowledged).toBe(true);
    expect(Object.values(saved.choices).every((v) => v === false)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled(); // acknowledging is not collecting
  });
});

describe('collection with essential signals only', () => {
  it('collects, shows a SHA-256 configuration hash, and makes no external request', async () => {
    await startedApp();
    expect(screen.getByText('No fingerprint collected yet.')).toBeTruthy(); // empty state
    await collect();
    expect(screen.getByTestId('config-hash').textContent).toMatch(/^[0-9a-f]{64}$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never labels the hash a unique device identifier', async () => {
    await startedApp();
    await collect();
    expect(screen.getByText(/not a unique device identifier/i)).toBeTruthy();
    // Any sentence that says "unique" must be a denial ("not a unique ...").
    const sentences = document.body.textContent.split(/[.!?]/).filter((s) => /unique/i.test(s));
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) expect(sentence).toMatch(/\bnot\b|\bNOT\b/);
  });

  it('shows per-collector statuses: collected, unsupported and disabled', async () => {
    await startedApp();
    await collect();
    const row = (id) => within(screen.getByTestId(`collector-${id}`));
    expect(row('browser').getByText('Collected')).toBeTruthy();
    expect(row('canvas').getByText('Unsupported')).toBeTruthy(); // jsdom has no canvas
    expect(row('publicIp').getByText('Disabled')).toBeTruthy();
    expect(row('geolocation').getByText('Disabled')).toBeTruthy();
    expect(row('battery').getByText('Disabled')).toBeTruthy();
    expect(within(screen.getByTestId('collector-behavioral')).getByText('Disabled')).toBeTruthy();
  });

  it('reports an incomplete hash honestly when signals were unavailable', async () => {
    await startedApp();
    await collect();
    expect(screen.getByText(/Some stable signals were unavailable/)).toBeTruthy();
  });

  it('the same browser state produces the same hash on refresh', async () => {
    await startedApp();
    await collect();
    const first = screen.getByTestId('config-hash').textContent;
    await collect();
    expect(screen.getByTestId('config-hash').textContent).toBe(first);
  });

  it('without crypto.subtle the signals still show, with a clear explanation instead of a fake hash', async () => {
    await startedApp();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      click(/^Collect fingerprint$/);
      await waitFor(() => expect(screen.queryByText('Collecting…')).toBeNull(), { timeout: 5000 });
      // The message is also present inside the JSON report, so target the alert element.
      expect(await screen.findByText(/needs a secure context/, { selector: 'p[role="alert"]' }, { timeout: 5000 })).toBeTruthy();
      expect(screen.queryByTestId('config-hash')).toBeNull();
      expect(reportJson().stableFingerprint.hash).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});

describe('separate, revocable consent for IP and geolocation', () => {
  it('public IP consent contacts ONLY ipify and shows the IP', async () => {
    await startedApp();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    goTab('Overview');
    await collect();
    expect(urls()).toEqual(['https://api.ipify.org?format=json']);
    expect(screen.getByText(IP)).toBeTruthy();
    expect(reportJson().meta.thirdPartyRequests.map((t) => t.host)).toEqual(['api.ipify.org']);
    expect(reportJson().meta.fingerprintDataTransmitted).toBe(false);
  });

  it('geolocation consent contacts ONLY ipapi, and does not reveal the IP', async () => {
    await startedApp();
    goTab('Privacy & consent');
    setSwitch('Approximate location from IP', true);
    goTab('Overview');
    await collect();
    expect(urls()).toEqual(['https://ipapi.co/json/']);
    expect(screen.getByText('Testville')).toBeTruthy();
    expect(document.body.textContent).not.toContain(IP);
  });

  it('revoking public IP removes its data from the screen and the JSON immediately, and later runs make no request', async () => {
    await startedApp();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    goTab('Overview');
    await collect();
    expect(document.body.textContent).toContain(IP);
    const callsBefore = fetchMock.mock.calls.length;

    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', false); // revoke
    goTab('Overview');

    expect(document.body.textContent).not.toContain(IP);
    expect(reportJson().volatile.publicIp).toBeUndefined();
    expect(within(screen.getByTestId('collector-publicIp')).getByText('Disabled')).toBeTruthy();

    await collect(); // refresh after revoking
    expect(fetchMock.mock.calls.length).toBe(callsBefore); // no new requests of any kind
    expect(document.body.textContent).not.toContain(IP);
  });

  it('revoking one category leaves the other untouched', async () => {
    await startedApp();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    setSwitch('Approximate location from IP', true);
    goTab('Overview');
    await collect();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', false);
    goTab('Overview');
    expect(screen.queryByText(IP)).toBeNull();
    expect(screen.getByText('Testville')).toBeTruthy();
  });

  it('"Revoke all optional consent" turns every category off and clears their data', async () => {
    await startedApp();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    setSwitch('Approximate location from IP', true);
    goTab('Overview');
    await collect();
    goTab('Privacy & consent');
    click(/Revoke all optional consent/);
    for (const title of ['Extended device', 'Public IP address lookup', 'Approximate location from IP', 'Behavioural timing']) expect(sw(title).checked).toBe(false);
    goTab('Overview');
    expect(document.body.textContent).not.toContain(IP);
    expect(document.body.textContent).not.toContain('Testville');
  });

  it('a network failure is shown as "Failed" and never blocks the rest of the report', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await startedApp();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    goTab('Overview');
    await collect();
    expect(within(screen.getByTestId('collector-publicIp')).getByText('Failed')).toBeTruthy();
    expect(screen.getByTestId('config-hash')).toBeTruthy();
  });
});

describe('consent persistence', () => {
  it('remembers choices across a reload and skips the first-run screen', async () => {
    const storage = new MemoryStorage();
    await startedApp(storage);
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    await waitFor(() => expect(JSON.parse(storage.getItem(CONSENT_KEY)).choices.publicIp).toBe(true));
    cleanup();

    renderApp(storage); // "reload"
    expect(screen.queryByText('Before you start')).toBeNull();
    goTab('Privacy & consent');
    expect(sw('Public IP address lookup').checked).toBe(true);
    expect(sw('Approximate location from IP').checked).toBe(false);
  });

  it('a persisted revocation stays revoked after reload, and no request is made', async () => {
    const storage = new MemoryStorage();
    await startedApp(storage);
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    setSwitch('Public IP address lookup', false);
    await waitFor(() => expect(JSON.parse(storage.getItem(CONSENT_KEY)).choices.publicIp).toBe(false));
    cleanup();

    renderApp(storage);
    await collect();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('corrupted saved preferences fall back to the safe defaults', () => {
    renderApp(new MemoryStorage({ [CONSENT_KEY]: '{broken' }));
    expect(screen.getByText('Before you start')).toBeTruthy();
    expect(screen.getByText(/could not be read and were reset/)).toBeTruthy();
    expect(sw('Public IP address lookup').checked).toBe(false);
  });

  it('works without browser storage: choices apply for the session and the user is told', async () => {
    renderApp(null);
    expect(screen.getByText(/Browser storage is unavailable/)).toBeTruthy();
    acknowledge();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    expect(sw('Public IP address lookup').checked).toBe(true);
    expect(await screen.findByText(/could not be saved/)).toBeTruthy();
  });
});

describe('behavioural timing is optional, off by default and never records text', () => {
  it('is off by default: no typing box, no listeners', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    await startedApp();
    expect(screen.queryByTestId('typing-box')).toBeNull();
    expect(add.mock.calls.map((c) => c[0]).filter((t) => ['keydown', 'keyup', 'mousemove'].includes(t))).toEqual([]);
  });

  it('when enabled it records timing only; typed text and keys are absent from the report', async () => {
    await startedApp();
    goTab('Privacy & consent');
    setSwitch('Behavioural timing', true);
    goTab('Overview');
    const box = screen.getByTestId('typing-box');
    for (const ch of 'topsecret') {
      fireEvent.keyDown(box, { key: ch, code: `Key${ch.toUpperCase()}` });
      fireEvent.keyUp(box, { key: ch, code: `Key${ch.toUpperCase()}` });
    }
    fireEvent.change(box, { target: { value: 'topsecret' } });
    await collect();

    const text = screen.getByTestId('report-json').textContent;
    expect(reportJson().volatile.behavioral.keyboard.keyPresses).toBe(9);
    for (const needle of ['topsecret', '"key"', '"code"', 'keyCode', 'KeyT']) expect(text).not.toContain(needle);
    expect(document.body.textContent).not.toContain('topsecret');
  });

  it('revoking removes the typing box and the captured data', async () => {
    await startedApp();
    goTab('Privacy & consent');
    setSwitch('Behavioural timing', true);
    goTab('Overview');
    await collect();
    expect(reportJson().volatile.behavioral).toBeDefined();
    goTab('Privacy & consent');
    setSwitch('Behavioural timing', false);
    goTab('Overview');
    expect(screen.queryByTestId('typing-box')).toBeNull();
    expect(reportJson().volatile.behavioral).toBeUndefined();
  });
});

describe('copy and export', () => {
  it('copies the report JSON and the hash to the clipboard', async () => {
    await startedApp();
    await collect();
    click(/^Copy JSON$/);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(JSON.parse(navigator.clipboard.writeText.mock.calls[0][0]).stableFingerprint.hash).toBe(screen.getByTestId('config-hash').textContent);

    click(/^Copy hash$/);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(screen.getByTestId('config-hash').textContent));
  });

  it('downloads the JSON through a local blob URL (no network)', async () => {
    await startedApp();
    await collect();
    click(/^Download JSON$/);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('copy/download/save are disabled until something has been collected', async () => {
    await startedApp();
    for (const name of [/^Copy JSON$/, /^Download JSON$/, /^Save snapshot$/]) expect(screen.getByRole('button', { name }).disabled).toBe(true);
  });
});

describe('history: save, view, compare, delete, clear', () => {
  const saveSnapshot = () => click(/^Save snapshot$/);

  it('shows an empty state and the "stays in this browser" explanation', async () => {
    await startedApp();
    goTab('History');
    expect(screen.getByTestId('history-empty')).toBeTruthy();
    expect(screen.getByText(/never uploaded/)).toBeTruthy();
  });

  it('saves a timestamped snapshot to localStorage containing no IP, location or behavioural data', async () => {
    const storage = new MemoryStorage();
    await startedApp(storage);
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    setSwitch('Approximate location from IP', true);
    setSwitch('Behavioural timing', true);
    goTab('Overview');
    await collect();
    saveSnapshot();

    const stored = storage.getItem(HISTORY_KEY);
    expect(stored).not.toBeNull();
    for (const needle of [IP, 'Testville', 'Testland', 'behavioral', 'keyboard', 'sessionId']) expect(stored).not.toContain(needle);
    const [snap] = JSON.parse(stored).snapshots;
    expect(snap.hash).toBe(screen.getByTestId('config-hash').textContent);
    expect(Number.isNaN(Date.parse(snap.savedAt))).toBe(false);

    goTab('History');
    expect(screen.getAllByTestId('snapshot-item')).toHaveLength(1);
  });

  it('views a snapshot, compares two with changed/unchanged signals highlighted, deletes one, and clears all after confirmation', async () => {
    const storage = new MemoryStorage();
    await startedApp(storage);

    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    await collect();
    saveSnapshot();
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(4); // the "browser configuration" changes
    await collect();
    saveSnapshot();

    goTab('History');
    expect(screen.getAllByTestId('snapshot-item')).toHaveLength(2);

    // view
    fireEvent.click(screen.getAllByRole('button', { name: /^View snapshot from/ })[0]);
    expect(screen.getByTestId('snapshot-json').textContent).toContain('signals');

    // compare
    const boxes = screen.getAllByRole('checkbox', { name: /for comparison/ });
    expect(screen.getByRole('button', { name: 'Compare selected' }).disabled).toBe(true);
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Compare selected' }));

    expect(screen.getByTestId('hash-verdict').textContent).toMatch(/differ/);
    expect(screen.getByTestId('diff-hardware.cpuLogicalCores').dataset.status).toBe('changed');
    expect(screen.getByTestId('count-changed').textContent).toMatch(/Changed: 1/);
    expect(screen.getByTestId('count-unchanged').textContent).not.toMatch(/Unchanged: 0/);
    expect(screen.queryByTestId('diff-locale.timeZone')).toBeNull(); // unchanged rows hidden by default
    fireEvent.click(screen.getByRole('checkbox', { name: /Show unchanged signals/ }));
    expect(screen.getByTestId('diff-locale.timeZone').dataset.status).toBe('unchanged');

    // delete one
    fireEvent.click(screen.getAllByRole('button', { name: /^Delete snapshot/ })[0]);
    expect(screen.getAllByTestId('snapshot-item')).toHaveLength(1);
    expect(JSON.parse(storage.getItem(HISTORY_KEY)).snapshots).toHaveLength(1);
    expect(screen.queryByTestId('hash-verdict')).toBeNull(); // comparison closed because a compared snapshot is gone

    // clear all requires confirmation
    fireEvent.click(screen.getByRole('button', { name: 'Clear all history' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByTestId('snapshot-item')).toHaveLength(1); // cancel keeps data

    fireEvent.click(screen.getByRole('button', { name: 'Clear all history' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Yes, delete everything/ }));
    expect(screen.getByTestId('history-empty')).toBeTruthy();
    expect(storage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('history survives a reload', async () => {
    const storage = new MemoryStorage();
    await startedApp(storage);
    await collect();
    saveSnapshot();
    cleanup();
    renderApp(storage);
    goTab('History');
    expect(screen.getAllByTestId('snapshot-item')).toHaveLength(1);
  });

  it('explains a corrupted history and lets the user reset it', () => {
    const storage = new MemoryStorage({ [CONSENT_KEY]: JSON.stringify({ version: 1, acknowledged: true, choices: {} }), [HISTORY_KEY]: '{{{' });
    renderApp(storage);
    goTab('History');
    expect(screen.getByText(/corrupted/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset history' }));
    expect(screen.getByTestId('history-empty')).toBeTruthy();
    expect(storage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('tells the user when storage is full, and does not lose existing snapshots', async () => {
    const storage = new MemoryStorage();
    await startedApp(storage);
    await collect();
    saveSnapshot();
    storage.failWrites = 'quota';
    saveSnapshot();
    expect(await screen.findByText(/storage is full/)).toBeTruthy();
    storage.failWrites = null;
    goTab('History');
    expect(screen.getAllByTestId('snapshot-item')).toHaveLength(1);
  });
});

describe('overall guarantee', () => {
  it('across a full session with everything off, nothing ever left the browser', async () => {
    await startedApp();
    await collect();
    click(/^Save snapshot$/);
    goTab('History');
    goTab('Privacy & consent');
    goTab('Overview');
    await collect();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
