// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHistory } from '../../src/hooks/useHistory';
import { HISTORY_KEY, MAX_SNAPSHOTS, loadHistory } from '../../src/services/historyStore';
import { MemoryStorage } from '../helpers/memoryStorage';

const report = () => ({
  stableFingerprint: { hash: 'a'.repeat(64), hashInputVersion: 'fp-v1', incomplete: false, signals: { screen: { long: 1 } } },
  details: {},
  volatile: {},
  meta: {},
});

describe('history shared by two tabs', () => {
  it('a stale tab never overwrites snapshots saved by another tab', () => {
    const storage = new MemoryStorage();
    const tabA = renderHook(() => useHistory(storage));
    const tabB = renderHook(() => useHistory(storage)); // loaded when storage was still empty

    act(() => { tabA.result.current.save(report()); });
    act(() => { tabB.result.current.save(report()); }); // tabB's own copy is stale (empty)

    expect(loadHistory(storage).snapshots).toHaveLength(2);
    expect(tabB.result.current.snapshots).toHaveLength(2);
  });

  it('a stale tab deleting a snapshot does not resurrect or drop other tabs\' snapshots', () => {
    const storage = new MemoryStorage();
    const tabA = renderHook(() => useHistory(storage));
    const tabB = renderHook(() => useHistory(storage));
    act(() => { tabA.result.current.save(report()); });
    act(() => { tabA.result.current.save(report()); });
    const [first] = loadHistory(storage).snapshots;

    act(() => { tabB.result.current.remove(first.id); });
    expect(loadHistory(storage).snapshots.map((s) => s.id)).not.toContain(first.id);
    expect(loadHistory(storage).snapshots).toHaveLength(1);
  });

  it('enforces the snapshot limit against what is really stored, not the stale local copy', () => {
    const storage = new MemoryStorage();
    const tabA = renderHook(() => useHistory(storage));
    const tabB = renderHook(() => useHistory(storage));
    for (let i = 0; i < MAX_SNAPSHOTS; i += 1) act(() => { tabA.result.current.save(report()); });

    let outcome;
    act(() => { outcome = tabB.result.current.save(report()); });
    expect(outcome).toMatchObject({ ok: false, reason: 'limit' });
    expect(loadHistory(storage).snapshots).toHaveLength(MAX_SNAPSHOTS);
  });

  it('refreshes the list when another tab changes the history (storage event)', () => {
    const storage = new MemoryStorage();
    const tabA = renderHook(() => useHistory(storage));
    const tabB = renderHook(() => useHistory(storage));
    act(() => { tabA.result.current.save(report()); });
    expect(tabB.result.current.snapshots).toHaveLength(0);

    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: HISTORY_KEY })); });
    expect(tabB.result.current.snapshots).toHaveLength(1);
  });

  it('ignores storage events for unrelated keys', () => {
    const storage = new MemoryStorage();
    const tab = renderHook(() => useHistory(storage));
    storage.setItem(HISTORY_KEY, JSON.stringify({ snapshots: [] }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' })); });
    expect(tab.result.current.snapshots).toHaveLength(0);
  });

  it('falls back to the local list if storage cannot be read, and reports the failed save', () => {
    const storage = new MemoryStorage();
    const tab = renderHook(() => useHistory(storage));
    act(() => { tab.result.current.save(report()); });
    storage.failReads = true;
    storage.failWrites = 'security';
    let outcome;
    act(() => { outcome = tab.result.current.save(report()); });
    expect(outcome.ok).toBe(false);
    expect(tab.result.current.snapshots).toHaveLength(1); // nothing lost from the screen
  });
});
