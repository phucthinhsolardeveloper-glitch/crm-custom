import { useState, useEffect, useRef } from 'react';

const FAKE_DURATION_MS = 120_000; // Linear ramp 0 → 99 over 2 minutes
const SMOOTH_FINISH_MS = 1_500; // Ease-out cubic from current → 100

/**
 * Returns a number 0-100 that fakes import progress.
 *
 * Phases:
 *   - !isRunning && !isDone: progress = 0
 *   - isRunning && !isDone:  linear ramp 0 → 99 over 2 minutes (clamps at 99)
 *   - isDone:                ease-out cubic from current value → 100 over 1.5s
 *
 * Pure client-side - no server cost. Tradeoff: a fast job (< 2 min) shows
 * partial progress before snapping to 100; a slow job (> 2 min) parks at 99
 * waiting. Acceptable UX given imports are bursty and users mostly want a
 * "something is happening" signal.
 */
export function useFakeProgress(isRunning: boolean, isDone: boolean): number {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Keep ref in sync so the ease-out animation can read the latest value
  // without triggering a re-render or re-running the effect.
  progressRef.current = progress;

  useEffect(() => {
    function clearTimers() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    if (!isRunning && !isDone) {
      clearTimers();
      setProgress(0);
      return;
    }

    if (isDone) {
      clearTimers();
      const startProgress = progressRef.current;
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / SMOOTH_FINISH_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        setProgress(startProgress + (100 - startProgress) * eased);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };
      rafRef.current = requestAnimationFrame(animate);
      return clearTimers;
    }

    // isRunning + !isDone: linear ramp
    clearTimers();
    const startTime = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(99, (elapsed / FAKE_DURATION_MS) * 99);
      setProgress(pct);
    }, 100);

    return clearTimers;
  }, [isRunning, isDone]);

  return progress;
}
