/**
 * VALIDATION SEPARATES BLOCKING FROM ADVISORY (criterion 14).
 *
 * `error` blocks. `warning` does not. `crossSessionInbound` takes one of
 * `accept`, `hold` and `refuse` — the value set CLI 2.1.318's binary declares
 * for the setting — and each of the three validates with no issue at all, so a
 * save with `hold` returns no warnings. A value outside the three is still an
 * error that blocks the save.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { HelmManagedFields, HelmSaveRequest } from '../../../src/shared/contracts/helm';

import {
  catchIpcFailure,
  cleanupHelm,
  draftFrom,
  makeHarness,
  readText,
  writeOutOfBand,
} from './helpers';

afterEach(cleanupHelm);

function managed(overrides: Partial<HelmManagedFields> = {}): HelmManagedFields {
  return {
    model: null,
    permissionsAllow: [],
    permissionsDeny: [],
    env: {},
    crossSessionInbound: null,
    ...overrides,
  };
}

function request(overrides: Partial<HelmSaveRequest> = {}): HelmSaveRequest {
  return {
    scopeId: 'user',
    revision: null,
    managed: managed(),
    unmanaged: {},
    hooksJson: '',
    ...overrides,
  };
}

describe('validate: errors', () => {
  it('rejects hooksJson that is not valid JSON', () => {
    const h = makeHarness();
    const issues = h.service.validate(request({ hooksJson: '{ "PreToolUse": [ }' })).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'hooksJson', severity: 'error' });
  });

  it('rejects a non-string env value', () => {
    const h = makeHarness();
    const issues = h.service.validate(
      request({ managed: managed({ env: { PORT: 8080 as unknown as string } }) }),
    ).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'env', severity: 'error' });
    expect(issues[0]?.message).toContain('PORT');
  });

  it('rejects a crossSessionInbound outside CROSS_SESSION_INBOUND_VALUES', () => {
    const h = makeHarness();
    const issues = h.service.validate(
      request({
        managed: managed({
          crossSessionInbound: 'queue' as HelmManagedFields['crossSessionInbound'],
        }),
      }),
    ).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'crossSessionInbound', severity: 'error' });
  });

  it('blocks the save and writes nothing when there is an error', async () => {
    const h = makeHarness();
    const original = writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const doc = await h.service.load('user');
    const failure = await catchIpcFailure(() =>
      h.service.save(draftFrom('user', doc, { hooksJson: 'not json' })),
    );

    expect(failure.code).toBe('INVALID_ARGUMENT');
    expect(readText(h.userSettingsPath)).toBe(original);
  });
});

describe('validate: crossSessionInbound values', () => {
  it.each(['accept', 'hold', 'refuse'] as const)(
    'produces no issue at all for crossSessionInbound: %s',
    (value) => {
      const h = makeHarness();
      expect(
        h.service.validate(request({ managed: managed({ crossSessionInbound: value }) })).issues,
      ).toEqual([]);
    },
  );

  it('saves hold, writes it to the file, and returns no warnings', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const doc = await h.service.load('user');
    const result = await h.service.save(
      draftFrom('user', doc, {
        managed: { ...doc.managed, crossSessionInbound: 'hold' },
      }),
    );

    expect(result.warnings).toEqual([]);
    expect(JSON.parse(readText(h.userSettingsPath))).toMatchObject({ crossSessionInbound: 'hold' });
    expect(result.document.managed.crossSessionInbound).toBe('hold');
  });

  it('produces no issue for a fully valid draft', () => {
    const h = makeHarness();
    expect(
      h.service.validate(
        request({
          managed: managed({
            model: 'opus',
            permissionsAllow: ['Bash(npm test)'],
            permissionsDeny: ['Bash(rm:*)'],
            env: { FOO: 'bar' },
            crossSessionInbound: 'refuse',
          }),
          hooksJson: '{ "PreToolUse": [] }',
        }),
      ).issues,
    ).toEqual([]);
  });
});
