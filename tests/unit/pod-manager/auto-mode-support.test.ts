/**
 * `autoModeSupportOf`: a session's auto-mode answer from its raw
 * `supportedModels()` answer and its latest `system`/`init` `model`.
 */

import { describe, expect, it } from 'vitest';

import { autoModeSupportOf } from '../../../src/main/pod-manager';

describe('autoModeSupportOf: a matching entry decides', () => {
  it('answers true for a value match whose supportsAutoMode is true', () => {
    expect(
      autoModeSupportOf([{ value: 'sonnet', resolvedModel: 'claude-sonnet-x', supportsAutoMode: true }], 'sonnet'),
    ).toBe(true);
  });

  it('answers false for a resolvedModel match whose supportsAutoMode is false', () => {
    expect(
      autoModeSupportOf(
        [{ value: 'default', resolvedModel: 'claude-opus-x', supportsAutoMode: false }],
        'claude-opus-x',
      ),
    ).toBe(false);
  });

  it('answers true when two entries match and one says true while the other says false', () => {
    expect(
      autoModeSupportOf(
        [
          { value: 'opus', supportsAutoMode: false },
          { value: 'opus', supportsAutoMode: true },
        ],
        'opus',
      ),
    ).toBe(true);
  });
});

describe('autoModeSupportOf: undefined when nothing decides', () => {
  it('answers undefined when no entry matches the model', () => {
    expect(
      autoModeSupportOf([{ value: 'sonnet', resolvedModel: 'claude-sonnet-x', supportsAutoMode: true }], 'haiku'),
    ).toBeUndefined();
  });

  it('answers undefined when the matching entry lacks supportsAutoMode', () => {
    expect(autoModeSupportOf([{ value: 'sonnet' }], 'sonnet')).toBeUndefined();
  });

  it('answers undefined when models is not an array', () => {
    expect(autoModeSupportOf({ value: 'sonnet', supportsAutoMode: true }, 'sonnet')).toBeUndefined();
    expect(autoModeSupportOf(null, 'sonnet')).toBeUndefined();
  });

  it('answers undefined when model is not a string', () => {
    expect(autoModeSupportOf([{ value: 'sonnet', supportsAutoMode: true }], undefined)).toBeUndefined();
    expect(autoModeSupportOf([{ value: 'sonnet', supportsAutoMode: true }], 7)).toBeUndefined();
  });

  it('skips a non-object array entry without throwing', () => {
    expect(() => autoModeSupportOf(['sonnet', null, 3], 'sonnet')).not.toThrow();
    expect(autoModeSupportOf(['sonnet', null, 3], 'sonnet')).toBeUndefined();
    // The skip does not stop the scan: a later object entry still decides.
    expect(autoModeSupportOf(['sonnet', null, { value: 'sonnet', supportsAutoMode: false }], 'sonnet')).toBe(
      false,
    );
  });
});
