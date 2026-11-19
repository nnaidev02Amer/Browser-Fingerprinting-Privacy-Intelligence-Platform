// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import ErrorBoundary from '../../src/components/ErrorBoundary';
import { MemoryStorage } from '../helpers/memoryStorage';

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: async () => ({ get: async () => ({ visitorId: 'fake-visitor-id', version: 'test', confidence: { score: 0.5 }, components: {} }) }) },
}));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const click = (name) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
const goTab = (name) => click(new RegExp(`^${name}$`));
const idle = () => waitFor(() => expect(screen.queryByText('Collecting…')).toBeNull(), { timeout: 5000 });

describe('switch semantics and labels', () => {
  it('exposes four switches whose names are clean (no On/Off text) and whose state is the checked property', () => {
    render(<App storage={new MemoryStorage()} />);
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    for (const title of ['Extended device & environment details', 'Public IP address lookup', 'Approximate location from IP (geolocation)', 'Behavioural timing']) {
      expect(screen.getByRole('switch', { name: title })).toBeTruthy(); // exact match: no trailing "On"/"Off"
    }
  });

  it('toggling updates the checked state that assistive technology reads', () => {
    render(<App storage={new MemoryStorage()} />);
    const sw = screen.getByRole('switch', { name: 'Public IP address lookup' });
    expect(sw.checked).toBe(false);
    fireEvent.click(sw);
    expect(sw.checked).toBe(true);
  });

  it('every disclosure control has a unique accessible name', () => {
    render(<App storage={new MemoryStorage()} />);
    const names = [...document.querySelectorAll('summary')].map((s) => s.textContent.replace(/\s+/g, ' ').trim());
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.startsWith('What, why and where for '))).toBe(true);
  });

  it('every form control has an accessible name', async () => {
    render(<App storage={new MemoryStorage()} />);
    click(/Save choices and continue/);
    goTab('Privacy & consent');
    const unlabeled = [...document.querySelectorAll('input,select,textarea')].filter(
      (el) => !el.getAttribute('aria-label') && !(el.labels && el.labels.length),
    );
    expect(unlabeled).toEqual([]);
  });

  it('uses landmarks and a single h1 with no skipped heading levels', async () => {
    render(<App storage={new MemoryStorage()} />);
    click(/Save choices and continue/);
    click(/^Collect fingerprint$/);
    await idle();
    // (jsdom maps every <header> to "banner"; the single page-level banner is verified in real Chrome.)
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelectorAll('footer')).toHaveLength(1);
    expect(document.querySelector('body > div header')).not.toBeNull();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    const levels = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    levels.forEach((l, i) => { if (i > 0) expect(l - levels[i - 1]).toBeLessThanOrEqual(1); });
  });

  it('keeps status and error messages in live regions', async () => {
    render(<App storage={new MemoryStorage()} />);
    click(/Save choices and continue/);
    click(/^Collect fingerprint$/);
    await idle();
    click(/^Save snapshot$/);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.getByText(/Snapshot saved/).closest('[role=status]')).not.toBeNull();
  });
});

describe('keyboard focus management', () => {
  it('moves focus into the page content when the first-run screen is dismissed', async () => {
    render(<App storage={new MemoryStorage()} />);
    click(/Save choices and continue/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')));
  });

  const twoSnapshots = async () => {
    render(<App storage={new MemoryStorage()} />);
    click(/Save choices and continue/);
    click(/^Collect fingerprint$/);
    await idle();
    click(/^Save snapshot$/);
    click(/^Refresh$/);
    await idle();
    click(/^Save snapshot$/);
    goTab('History');
  };

  it('history buttons have distinct, contextual names', async () => {
    await twoSnapshots();
    const names = screen.getAllByRole('button', { name: /^View snapshot from/ }).map((b) => b.getAttribute('aria-label'));
    expect(names).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Delete snapshot from/ })).toHaveLength(2);
  });

  it('clear-all confirmation takes focus on the least destructive button, and Escape closes it and restores focus', async () => {
    await twoSnapshots();
    click(/^Clear all history$/);
    const dialog = screen.getByRole('alertdialog');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })));

    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear all history' })));
    expect(screen.getAllByTestId('snapshot-item')).toHaveLength(2); // Escape cancelled; nothing deleted
  });

  it('deleting a snapshot keeps focus inside the page instead of dropping it to <body>', async () => {
    await twoSnapshots();
    fireEvent.click(screen.getAllByRole('button', { name: /^Delete snapshot from/ })[0]);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement.id).toBe('history');
  });

  it('opening a comparison moves focus to the result', async () => {
    await twoSnapshots();
    for (const box of screen.getAllByRole('checkbox', { name: /for comparison/ })) fireEvent.click(box);
    click(/^Compare selected$/);
    await waitFor(() => expect(document.activeElement.id).toBe('comparison'));
  });
});

describe('ErrorBoundary', () => {
  const Boom = () => { throw new Error('render exploded'); };

  it('shows a readable alert with a reload button instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Something went wrong/);
    expect(alert.textContent).toMatch(/Nothing was uploaded/);
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
  });

  it('renders children normally when nothing fails', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
