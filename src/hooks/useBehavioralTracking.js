import { useCallback, useEffect, useRef } from 'react';

const MAX_MOUSE = 200;
const MAX_KEYS = 100;
const MAX_TOUCH = 100;
const MOUSE_INTERVAL_MS = 50;
const TOUCH_INTERVAL_MS = 50;

const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const mean = (values) => (values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null);

function createStore() {
  return {
    startedAt: performance.now(),
    mouse: [],
    keys: [],
    touch: [],
    clicks: 0,
    lastMouseAt: -Infinity,
    lastTouchAt: -Infinity,
    lastKeyDownAt: null,
    pendingKeyDowns: new Map(), // transient: pairs keydown/keyup to get dwell time; never output
  };
}

/**
 * Collect behavioural *timing* signals (mouse movement, click count, key
 * timing, touch movement) while `enabled` is true.
 *
 * PRIVACY: raw keys are never recorded. For keyboard activity only timing is
 * kept (how long a key was held and the gap between key presses). The `code`
 * of a key is used in memory only to pair its keydown with its keyup and is
 * discarded; typed text cannot be reconstructed from the output.
 *
 * Data lives in a ref, so tracking never triggers React re-renders.
 * `snapshot()` returns a summary and clears the buffers for the next run.
 */
export function useBehavioralTracking(enabled) {
  const storeRef = useRef(createStore());

  useEffect(() => {
    if (!enabled) return undefined;
    storeRef.current = createStore();
    const store = storeRef.current;
    const now = () => performance.now() - store.startedAt;

    const onMouseMove = (e) => {
      const t = now();
      if (t - store.lastMouseAt < MOUSE_INTERVAL_MS || store.mouse.length >= MAX_MOUSE) return;
      const prev = store.mouse[store.mouse.length - 1];
      const dt = prev ? (t - prev.t) / 1000 : 0;
      const velocity = prev && dt > 0 ? Math.hypot(e.clientX - prev.x, e.clientY - prev.y) / dt : 0;
      store.lastMouseAt = t;
      store.mouse.push({ t: Math.round(t), x: e.clientX, y: e.clientY, velocity: round(velocity) });
    };

    const onClick = () => {
      store.clicks += 1;
    };

    const onKeyDown = (e) => {
      if (e.repeat || store.pendingKeyDowns.has(e.code)) return;
      store.pendingKeyDowns.set(e.code, { t: now(), flightMs: store.lastKeyDownAt === null ? null : now() - store.lastKeyDownAt });
      store.lastKeyDownAt = now();
    };

    const onKeyUp = (e) => {
      const down = store.pendingKeyDowns.get(e.code);
      if (!down) return;
      store.pendingKeyDowns.delete(e.code);
      if (store.keys.length >= MAX_KEYS) return;
      store.keys.push({
        t: Math.round(down.t),
        dwellMs: Math.round(now() - down.t),
        flightMs: down.flightMs === null ? null : Math.round(down.flightMs),
      });
    };

    const onTouchMove = (e) => {
      const t = now();
      if (t - store.lastTouchAt < TOUCH_INTERVAL_MS || store.touch.length >= MAX_TOUCH || e.touches.length === 0) return;
      const touch = e.touches[0];
      store.lastTouchAt = t;
      store.touch.push({ t: Math.round(t), x: Math.round(touch.clientX), y: Math.round(touch.clientY), force: touch.force || null });
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('click', onClick, { passive: true });
    window.addEventListener('keydown', onKeyDown, { passive: true });
    window.addEventListener('keyup', onKeyUp, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('touchmove', onTouchMove);
      // Revoking (or unmounting) discards everything captured so far.
      store.pendingKeyDowns.clear();
      storeRef.current = createStore();
    };
  }, [enabled]);

  /** Summarise what was captured so far, then clear the buffers. */
  const snapshot = useCallback(() => {
    const s = storeRef.current;
    const velocities = s.mouse.map((m) => m.velocity);
    const summary = {
      sessionDurationMs: Math.round(performance.now() - s.startedAt),
      mouse: {
        samples: s.mouse.length,
        clicks: s.clicks,
        meanVelocityPxPerSec: mean(velocities),
        maxVelocityPxPerSec: velocities.length ? Math.max(...velocities) : null,
        path: s.mouse,
      },
      keyboard: {
        // Timing only: no keys and no text are recorded.
        keyPresses: s.keys.length,
        meanDwellMs: mean(s.keys.map((k) => k.dwellMs)),
        meanFlightMs: mean(s.keys.map((k) => k.flightMs).filter((v) => v !== null)),
        timings: s.keys,
      },
      touch: { samples: s.touch.length, path: s.touch },
    };
    storeRef.current = createStore();
    return summary;
  }, []);

  return { snapshot };
}
