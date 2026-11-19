// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { CONSENT_KEY, defaultConsent, saveConsent } from '../../src/services/consentStore';
import { MemoryStorage } from '../helpers/memoryStorage';

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: async () => ({ get: async () => ({ visitorId: 'fake-visitor-id', version: 'test', confidence: { score: 0.5 }, components: {} }) }) },
}));

const IP = '203.0.113.9';
const ORIGINAL_CRYPTO = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const json = (body) => ({ ok: true, status: 200, json: async () => body });

/** A fetch whose ipify response is held back until the test releases it. */
let fetchMock;
let inflight; // { signal, release(), failed }

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  inflight = null;
  fetchMock = vi.fn((url, init) => {
    if (!String(url).startsWith('https://api.ipify.org')) return Promise.resolve(json({}));
    return new Promise((resolve, reject) => {
      inflight = { signal: init.signal, release: () => resolve(json({ ip: IP })) };
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  });
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
const sw = (title) => screen.getByRole('switch', { name: title });
const setSwitch = (title, on) => { if (sw(title).checked !== on) fireEvent.click(sw(title)); };
const hash = () => screen.getByTestId('config-hash').textContent;
const idle = () => waitFor(() => expect(screen.queryByText('Collecting…')).toBeNull(), { timeout: 5000 });

async function startApp(storage = new MemoryStorage()) {
  render(<App storage={storage} />);
  click(/Save choices and continue/);
  return storage;
}

/** Collect once with everything off; returns the stable hash. */
async function baselineHash() {
  click(/^Collect fingerprint$/);
  await idle();
  return (await screen.findByTestId('config-hash')).textContent;
}

async function beginIpCollection() {
  goTab('Privacy & consent');
  setSwitch('Public IP address lookup', true);
  goTab('Overview');
  click(/^(Collect fingerprint|Refresh)$/); // "Collect" on a first run, "Refresh" once a result exists
  await waitFor(() => expect(inflight).not.toBeNull()); // the ipify request is now in flight
}

describe('revoking consent while a collection is running (full UI, real collectors)', () => {
  it('aborts the request, finishes promptly, shows no IP anywhere, and keeps the same stable hash', async () => {
    await startApp();
    const h0 = await baselineHash();
    await beginIpCollection();
    expect(inflight.signal.aborted).toBe(false);

    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', false); // revoke mid-request
    expect(inflight.signal.aborted).toBe(true);
    goTab('Overview');

    await idle(); // the run ends although ipify never answered
    expect(document.body.textContent).not.toContain(IP);
    expect(screen.getByTestId('report-json').textContent).not.toContain(IP);
    expect(hash()).toBe(h0);
    expect(JSON.parse(screen.getByTestId('report-json').textContent).volatile.publicIp).toBeUndefined();
  });

  it('a response that arrives AFTER revocation is discarded', async () => {
    await startApp();
    await beginIpCollection();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', false);
    goTab('Overview');

    inflight.release(); // too late: the late answer must not surface
    await idle();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain(IP);
  });

  it('revoke then re-grant during the run still discards that run\'s IP, and does not silently re-request', async () => {
    await startApp();
    await beginIpCollection();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', false);
    setSwitch('Public IP address lookup', true); // changed their mind
    goTab('Overview');
    inflight.release();
    await idle();

    expect(document.body.textContent).not.toContain(IP);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no automatic second request
  });

  it('after revocation the next Refresh makes no request', async () => {
    await startApp();
    await beginIpCollection();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', false);
    goTab('Overview');
    await idle();
    const calls = fetchMock.mock.calls.length;

    click(/^Refresh$/);
    await idle();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('"Revoke all optional consent" mid-run cancels every category', async () => {
    await startApp();
    await beginIpCollection();
    goTab('Privacy & consent');
    click(/Revoke all optional consent/);
    expect(inflight.signal.aborted).toBe(true);
    goTab('Overview');
    await idle();
    expect(document.body.textContent).not.toContain(IP);
  });
});

describe('consent changed in another tab', () => {
  const otherTabWrites = (storage, mutate) => {
    const next = { ...defaultConsent(), acknowledged: true };
    mutate(next);
    saveConsent(next, storage);
    window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }));
  };

  it('a revocation made elsewhere applies here: switch turns off and the data disappears', async () => {
    fetchMock.mockImplementation(async (url) => (String(url).startsWith('https://api.ipify.org') ? json({ ip: IP }) : json({})));
    const storage = await startApp();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    goTab('Overview');
    click(/^(Collect fingerprint|Refresh)$/);
    await idle();
    await screen.findByText(IP);

    otherTabWrites(storage, (c) => { c.choices.publicIp = false; }); // revoked in another tab
    await waitFor(() => expect(document.body.textContent).not.toContain(IP));

    goTab('Privacy & consent');
    expect(sw('Public IP address lookup').checked).toBe(false);
    const calls = fetchMock.mock.calls.length;
    goTab('Overview');
    click(/^Refresh$/);
    await idle();
    expect(fetchMock.mock.calls.length).toBe(calls); // and no new request here either
  });

  it('a revocation made elsewhere cancels a request that is in flight here', async () => {
    const storage = await startApp();
    await beginIpCollection();
    otherTabWrites(storage, (c) => { c.choices.publicIp = false; });
    await waitFor(() => expect(inflight.signal.aborted).toBe(true));
    await idle();
    expect(document.body.textContent).not.toContain(IP);
  });

  it('storage cleared elsewhere returns this tab to the first-run screen with everything off', async () => {
    const storage = await startApp();
    storage.removeItem(CONSENT_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }));
    expect(await screen.findByText('Before you start')).toBeTruthy();
    expect(sw('Public IP address lookup').checked).toBe(false);
  });

  it('unrelated storage events are ignored', async () => {
    const storage = await startApp();
    goTab('Privacy & consent');
    setSwitch('Public IP address lookup', true);
    await waitFor(() => expect(JSON.parse(storage.getItem(CONSENT_KEY)).choices.publicIp).toBe(true));
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-app-key' }));
    expect(sw('Public IP address lookup').checked).toBe(true);
  });
});
