/**
 * Display formatting for the Beachcomber panel. Pure string functions, no
 * React, no locale lookup — a size or a count that renders differently on two
 * machines is a size two people cannot talk about.
 *
 * NOTHING HERE PARSES A PATH. `displayPath` is prose (`beachcomber.ts`
 * header): it is passed through untouched and never split, joined or resolved.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Windows-style binary steps, because the recycle bin the user checks after
 * this operation reports the same way. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  let value = bytes;
  let step = 0;
  while (value >= 1024 && step < BYTE_UNITS.length - 1) {
    value /= 1024;
    step += 1;
  }

  const rounded = step === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded)} ${BYTE_UNITS[step] ?? 'B'}`;
}

/** `2 files`, `1 file`. The plural is spelled out rather than suffixed so a
 * caller can pass an irregular one. */
export function formatCount(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

/**
 * The calendar day of an ISO-8601 timestamp, as written. Deliberately NOT
 * `toLocaleDateString`: the panel is a comparison table, and a value that
 * depends on the host locale cannot be compared across screenshots or asserted
 * in a test.
 */
export function formatDay(timestamp: string): string {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(timestamp);
  return match === null ? timestamp : match[0];
}
