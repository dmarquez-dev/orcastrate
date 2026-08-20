/**
 * The record/rows conversion, on its own. These are the operations that can
 * lose a variable without anyone noticing, so they are tested where the answer
 * is a value rather than a rendering.
 */

import { describe, expect, it } from 'vitest';

import {
  addBlankRow,
  fromRows,
  hasBlankKey,
  removeRow,
  renameKey,
  setValue,
  toRows,
} from './env-rows';

describe('env rows', () => {
  it('round-trips a record through rows in insertion order', () => {
    const env = { B: '2', A: '1' };
    expect(toRows(env)).toEqual([
      { key: 'B', value: '2' },
      { key: 'A', value: '1' },
    ]);
    expect(fromRows(toRows(env))).toEqual(env);
  });

  it('renames a key in place, keeping the row where it was', () => {
    const result = renameKey({ A: '1', B: '2' }, 0, 'C');
    expect(result.ok).toBe(true);
    expect(result.ok ? toRows(result.env) : []).toEqual([
      { key: 'C', value: '1' },
      { key: 'B', value: '2' },
    ]);
  });

  it('REFUSES a rename that would collapse two rows into one', () => {
    const result = renameKey({ A: '1', B: '2' }, 1, 'A');
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it("allows a rename onto the row's own current name", () => {
    expect(renameKey({ A: '1' }, 0, 'A').ok).toBe(true);
  });

  it('sets a value without touching the key', () => {
    expect(setValue({ A: '1', B: '2' }, 1, '9')).toEqual({ A: '1', B: '9' });
  });

  it('removes exactly the row asked for', () => {
    expect(removeRow({ A: '1', B: '2', C: '3' }, 1)).toEqual({ A: '1', C: '3' });
  });

  it('adds one blank row and refuses a second, because a record cannot hold two', () => {
    const once = addBlankRow({ A: '1' });
    expect(hasBlankKey(once)).toBe(true);
    expect(toRows(once).length).toBe(2);

    const twice = addBlankRow(once);
    expect(toRows(twice).length).toBe(2);
  });
});
