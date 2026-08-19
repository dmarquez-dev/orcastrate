/**
 * Elapsed time, formatted FOR DISPLAY ONLY.
 *
 * This module is a pure function of the milliseconds handed to it. It does not
 * read the clock and it does not schedule anything — `LaneRowVm.elapsedMs` is
 * recomputed on a timer owned by the state layer (frozen `renderer-state.ts`),
 * precisely so a finished lane's row freezes and stops re-rendering. A row
 * that called `Date.now()` would re-render forever and defeat that.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `0s`, `47s`, `2m 05s`, `1h 04m`. Negative and non-finite input read `0s`. */
export function formatElapsed(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return '0s';

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  if (totalMinutes > 0) return `${totalMinutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}
