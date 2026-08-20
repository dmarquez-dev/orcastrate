/**
 * The three display formatters. Node environment: no DOM involved.
 *
 * These matter more than they look: a size the user misreads by three orders of
 * magnitude is a size they will delete on.
 */

import { describe, expect, it } from 'vitest';

import { formatBytes, formatCount, formatDay } from './format';

describe('formatBytes', () => {
  it('steps through binary units the way the recycle bin reports them', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 3.25)).toBe('3.3 GB');
  });

  it('never renders a negative or a non-finite size', () => {
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});

describe('formatCount', () => {
  it('agrees with itself about the singular', () => {
    expect(formatCount(0, 'item', 'items')).toBe('0 items');
    expect(formatCount(1, 'item', 'items')).toBe('1 item');
    expect(formatCount(2, 'entry', 'entries')).toBe('2 entries');
  });
});

describe('formatDay', () => {
  it('takes the calendar day off an ISO timestamp without consulting the locale', () => {
    expect(formatDay('2026-08-19T10:00:00.000Z')).toBe('2026-08-19');
  });

  it('passes anything that is not one straight through', () => {
    expect(formatDay('not a timestamp')).toBe('not a timestamp');
  });
});
