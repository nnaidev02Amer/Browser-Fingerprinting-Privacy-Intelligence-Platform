import { describe, expect, it } from 'vitest';
import { DIFF, compareSignals, compareSnapshots, flattenSignals } from '../../src/utils/compare';

const row = (result, path) => result.rows.find((r) => r.path === path);

describe('flattenSignals', () => {
  it('walks objects into dotted paths and treats arrays and primitives as leaves', () => {
    expect(flattenSignals({ a: { b: 1, c: ['x', 'y'] }, d: 'z' })).toEqual({ 'a.b': 1, 'a.c': ['x', 'y'], d: 'z' });
  });
});

describe('compareSignals', () => {
  const older = { screen: { long: 1920, short: 1080 }, fonts: ['Arial', 'Verdana'], hardware: { cpuLogicalCores: 8 }, audio: { hash: 'h1' } };
  const newer = { screen: { long: 1920, short: 1080 }, fonts: ['Arial', 'Georgia'], hardware: { cpuLogicalCores: 4 }, canvas: { hash: 'c1' } };
  const result = compareSignals(older, newer);

  it('marks equal signals as unchanged', () => {
    expect(row(result, 'screen.long').status).toBe(DIFF.UNCHANGED);
    expect(row(result, 'screen.short').status).toBe(DIFF.UNCHANGED);
  });

  it('marks different values as changed, keeping before and after', () => {
    expect(row(result, 'hardware.cpuLogicalCores')).toMatchObject({ status: DIFF.CHANGED, before: 8, after: 4 });
  });

  it('marks signals only in the newer snapshot as added', () => {
    expect(row(result, 'canvas.hash')).toMatchObject({ status: DIFF.ADDED, after: 'c1' });
  });

  it('marks signals only in the older snapshot as removed', () => {
    expect(row(result, 'audio.hash')).toMatchObject({ status: DIFF.REMOVED, before: 'h1' });
  });

  it('describes a changed list as items added and removed (fonts)', () => {
    expect(row(result, 'fonts')).toMatchObject({ status: DIFF.CHANGED, addedItems: ['Georgia'], removedItems: ['Verdana'] });
  });

  it('counts every state', () => {
    expect(result.counts).toEqual({ changed: 2, unchanged: 2, added: 1, removed: 1 });
  });

  it('identical inputs are entirely unchanged', () => {
    const same = compareSignals(older, older);
    expect(same.counts.changed + same.counts.added + same.counts.removed).toBe(0);
  });

  it('handles empty signal sets', () => {
    expect(compareSignals({}, {}).rows).toEqual([]);
    expect(compareSignals({}, { a: { b: 1 } }).counts.added).toBe(1);
  });

  it('detects a signal that became unavailable (status object replaces data)', () => {
    const r = compareSignals({ audio: { hash: 'h1' } }, { audio: { status: 'unsupported' } });
    expect(row(r, 'audio.hash').status).toBe(DIFF.REMOVED);
    expect(row(r, 'audio.status').status).toBe(DIFF.ADDED);
  });
});

describe('compareSnapshots', () => {
  const make = (savedAt, hash, signals) => ({ id: savedAt, savedAt, hash, signals });

  it('orders by time regardless of argument order', () => {
    const early = make('2025-01-01T00:00:00.000Z', 'a'.repeat(64), { x: 1 });
    const late = make('2025-01-02T00:00:00.000Z', 'b'.repeat(64), { x: 2 });
    const r = compareSnapshots(late, early);
    expect([r.older.id, r.newer.id]).toEqual([early.id, late.id]);
    expect(row(r, 'x')).toMatchObject({ before: 1, after: 2 });
  });

  it('reports identical hashes', () => {
    const h = 'c'.repeat(64);
    const r = compareSnapshots(make('2025-01-01T00:00:00.000Z', h, { x: 1 }), make('2025-01-02T00:00:00.000Z', h, { x: 1 }));
    expect(r.sameHash).toBe(true);
  });

  it('never calls two hash-less snapshots "identical"', () => {
    const r = compareSnapshots(make('2025-01-01T00:00:00.000Z', null, {}), make('2025-01-02T00:00:00.000Z', null, {}));
    expect(r.sameHash).toBe(false);
  });
});
