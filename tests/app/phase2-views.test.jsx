// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { NAV } from '../../src/config/navigation';
import { EXPERIMENTS_KEY } from '../../src/services/experimentStore';
import { MemoryStorage } from '../helpers/memoryStorage';

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: async () => ({ get: async () => ({ visitorId: 'fake-visitor-id', version: 'test', confidence: { score: 0.5 }, components: {} }) }) },
}));

const ORIGINAL_CRYPTO = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'crypto', ORIGINAL_CRYPTO);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const click = (name) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
const goTab = (name) => click(new RegExp(`^${name}$`));
const withCores = (n) => vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(n);
async function start() {
  const storage = new MemoryStorage();
  render(<App storage={storage} />);
  click(/Save choices and continue/);
  return storage;
}

describe('Experiments navigation group', () => {
  it('shows one "Experiments" group with the two experiment pages, and every page is still reachable', async () => {
    await start();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const group = within(nav).getByRole('group', { name: 'Experiments' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Laboratory', 'Protection test']);
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(NAV.map((n) => n.label)); // none lost, same order
    for (const item of NAV) {
      goTab(item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      expect(within(nav).getByRole('button', { name: item.label }).getAttribute('aria-current')).toBe('page');
    }
  });
});

describe('removed pages', () => {
  it('Analytics and the same-origin tracking experiment are not in the navigation, and nothing mentions them', async () => {
    await start();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const labels = within(nav).getAllByRole('button').map((b) => b.textContent);
    expect(labels).not.toContain('Analytics');
    expect(labels.join(' ')).not.toMatch(/tracking/i);
    for (const label of labels) {
      goTab(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      expect(document.body.textContent).not.toMatch(/same-origin|Tracking simulation|Analytics/i);
    }
  });
});

describe('Protection test: optional A3 in the UI', () => {
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

  it('explains how A3 helps and that A-B-A stays standard', async () => {
    await start();
    goTab('Protection test');
    const text = screen.getByTestId('a3-explanation').textContent;
    expect(text).toMatch(/two baselines can agree by chance/);
    expect(text).toMatch(/never attributed to your setting/);
    expect(screen.getByTestId('protection-honesty')).toBeTruthy();
    expect(screen.getByText(/A-B-A remains the standard method/)).toBeTruthy();
  });

  it('is offered only after A2, is optional, and results are complete without it', async () => {
    await start();
    goTab('Protection test');
    create('Optional');
    await screen.findByTestId('step-protect-a1');
    expect(screen.queryByTestId('step-protect-a3')).toBeNull();
    await record('A1', 8);
    await record('B', 2, 'Setting');
    expect(screen.queryByTestId('step-protect-a3')).toBeNull(); // not before A2
    await record('A2', 8);
    expect(screen.getByTestId('step-protect-a3').textContent).toMatch(/Optional/);
    expect(screen.getByTestId('protection-results')).toBeTruthy(); // already complete with A-B-A
    expect(screen.getByTestId('protect-attr-hardware').dataset.outcome).toBe('changed');
    expect(screen.getByTestId('protection-caveats').textContent).toMatch(/Only one repeat baseline \(A2\)/);
  });

  it('recording A3 turns a chance-agreement into "varies on its own" instead of blaming the setting', async () => {
    const storage = await start();
    goTab('Protection test');
    create('Chance');
    await screen.findByTestId('step-protect-a1');
    await record('A1', 8);
    await record('B', 2, 'Setting');
    await record('A2', 8); // agrees with A1 by chance
    expect(screen.getByTestId('protect-attr-hardware').dataset.outcome).toBe('changed'); // A-B-A alone would blame the setting
    await record('A3', 4); // ...but the value does vary
    expect(screen.getByTestId('protect-attr-hardware').dataset.outcome).toBe('unstable-baseline');
    expect(screen.getByTestId('protect-attr-hardware').textContent).toMatch(/No conclusion about the setting can be drawn/);
    expect(screen.getByTestId('protection-results').textContent).toMatch(/Noise floor: the three baselines had different hashes/);
    expect(screen.getByTestId('protection-caveats').textContent).toMatch(/Three baselines/);
    expect(JSON.parse(storage.getItem(EXPERIMENTS_KEY)).experiments[0].runs.map((r) => r.presetId)).toEqual(['protect-a1', 'protect-b', 'protect-a2', 'protect-a3']);
  });
});
