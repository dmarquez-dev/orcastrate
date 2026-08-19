/**
 * VALIDATION SEPARATES BLOCKING FROM ADVISORY (criterion 14).
 *
 * `error` blocks. `warning` does not. The whole weight of the distinction falls
 * on `crossSessionInbound: 'hold'`: the key is real in CLI 2.1.235 and `accept`
 * and `refuse` were observed there, but `hold` was not. Marking it an error
 * would make Helm less capable than the text editor the user can open the same
 * file in, on the strength of a guess. Marking it fine would be a lie. It is a
 * warning that says which build it was not confirmed in.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { HelmManagedFields, HelmSaveRequest } from '../../../src/shared/contracts/helm';
import { OBSERVED_CLI_VERSION } from '../../../src/main/helm';

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

describe('validate: the hold warning', () => {
  it('marks hold a WARNING, not an error, naming the CLI build it was not confirmed in', () => {
    const h = makeHarness();
    const issues = h.service.validate(
      request({ managed: managed({ crossSessionInbound: 'hold' }) }),
    ).issues;

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.field).toBe('crossSessionInbound');
    expect(issues[0]?.message).toContain(OBSERVED_CLI_VERSION);
    expect(OBSERVED_CLI_VERSION).toBe('2.1.235');
  });

  it('saves anyway, and reports the warning that was accepted', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const doc = await h.service.load('user');
    const result = await h.service.save(
      draftFrom('user', doc, {
        managed: { ...doc.managed, crossSessionInbound: 'hold' },
      }),
    );

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.severity).toBe('warning');
    expect(JSON.parse(readText(h.userSettingsPath))).toMatchObject({ crossSessionInbound: 'hold' });
    expect(result.document.managed.crossSessionInbound).toBe('hold');
  });

  it('produces no issue at all for accept or refuse', () => {
    const h = makeHarness();
    for (const value of ['accept', 'refuse'] as const) {
      expect(
        h.service.validate(request({ managed: managed({ crossSessionInbound: value }) })).issues,
      ).toEqual([]);
    }
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
