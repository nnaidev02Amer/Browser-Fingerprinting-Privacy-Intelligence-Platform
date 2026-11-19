// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBehavioralTracking } from '../../src/hooks/useBehavioralTracking';

const key = (type, k, code) => window.dispatchEvent(new KeyboardEvent(type, { key: k, code, bubbles: true }));
const type = (text) => {
  for (const ch of text) {
    key('keydown', ch, `Key${ch.toUpperCase()}`);
    key('keyup', ch, `Key${ch.toUpperCase()}`);
  }
};

afterEach(() => vi.restoreAllMocks());

describe('behavioural tracking: no raw keyboard or text collection', () => {
  it('records keystroke TIMING only; the keys and the typed text never appear in the output', () => {
    const { result } = renderHook(() => useBehavioralTracking(true));
    act(() => type('hunter2pw'));

    const summary = result.current.snapshot();
    const json = JSON.stringify(summary);

    expect(summary.keyboard.keyPresses).toBe(9);
    expect(summary.keyboard.timings.every((t) => Object.keys(t).sort().join() === 'dwellMs,flightMs,t')).toBe(true);
    for (const needle of ['hunter2pw', 'hunter', 'Key', '"key"', '"code"', 'keyCode']) expect(json).not.toContain(needle);
    // Every value in the keyboard section is a number: nothing textual can be a key or a character.
    for (const timing of summary.keyboard.timings) {
      for (const value of Object.values(timing)) expect(value === null || typeof value === 'number').toBe(true);
    }
  });

  it('registers only motion/click/key-timing listeners; never input, change, paste or keypress', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderHook(() => useBehavioralTracking(true));
    const types = add.mock.calls.map((c) => c[0]).filter((t) => ['mousemove', 'click', 'keydown', 'keyup', 'touchmove', 'input', 'change', 'paste', 'keypress', 'copy'].includes(t));
    expect([...new Set(types)].sort()).toEqual(['click', 'keydown', 'keyup', 'mousemove', 'touchmove']);
  });

  it('does not attach ANY listener while consent is off (the default)', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderHook(() => useBehavioralTracking(false));
    const tracked = add.mock.calls.map((c) => c[0]).filter((t) => ['mousemove', 'click', 'keydown', 'keyup', 'touchmove'].includes(t));
    expect(tracked).toEqual([]);
  });

  it('records nothing while disabled', () => {
    const { result } = renderHook(() => useBehavioralTracking(false));
    act(() => type('abc'));
    expect(result.current.snapshot().keyboard.keyPresses).toBe(0);
  });

  it('revocation removes the listeners immediately and discards what was captured', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { result, rerender } = renderHook(({ on }) => useBehavioralTracking(on), { initialProps: { on: true } });
    act(() => type('abc'));

    rerender({ on: false }); // user revokes consent
    expect(remove.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['keydown', 'keyup', 'mousemove', 'click', 'touchmove']));

    act(() => type('more'));
    const after = result.current.snapshot();
    expect(after.keyboard.keyPresses).toBe(0); // earlier data discarded, later keys ignored
  });

  it('snapshot clears the buffers so a later run starts fresh', () => {
    const { result } = renderHook(() => useBehavioralTracking(true));
    act(() => type('ab'));
    expect(result.current.snapshot().keyboard.keyPresses).toBe(2);
    expect(result.current.snapshot().keyboard.keyPresses).toBe(0);
  });

  it('counts real clicks and mouse samples', () => {
    const { result } = renderHook(() => useBehavioralTracking(true));
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
      window.dispatchEvent(new MouseEvent('click'));
    });
    const s = result.current.snapshot();
    expect(s.mouse.samples).toBe(1);
    expect(s.mouse.clicks).toBe(1);
  });
});
