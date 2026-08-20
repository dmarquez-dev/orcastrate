/**
 * AN ABSENT FILE IS A NORMAL STATE (criterion 3), and HELM NEVER OVERWRITES A
 * FILE IT COULD NOT READ (criterion 13).
 *
 * Both absences the spec observed in the real world are exercised: a project
 * with no `.claude/` directory at all — which is this repository — and a user
 * scope whose file exists but has no `permissions` key, which is the machine's
 * own `settings.json`.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { catchIpcFailure, cleanupHelm, draftFrom, makeHarness, readText, writeOutOfBand } from './helpers';

afterEach(cleanupHelm);

describe('load, absent file', () => {
  it('reports a project with no .claude/ as a normal empty document', async () => {
    const h = makeHarness();
    h.addPod('pod-a');

    const doc = await h.service.load('project:pod-a');

    expect(doc.scope.exists).toBe(false);
    expect(doc.revision).toBeNull();
    expect(doc.managed).toEqual({
      model: null,
      permissionsAllow: [],
      permissionsDeny: [],
      env: {},
      crossSessionInbound: null,
    });
    expect(doc.unmanaged).toEqual({});
    expect(doc.hooksJson).toBe('');
    expect(doc.parseError).toBeNull();
  });

  it('reports an absent user settings file the same way', async () => {
    const h = makeHarness();
    const doc = await h.service.load('user');
    expect(doc.scope.exists).toBe(false);
    expect(doc.revision).toBeNull();
    expect(doc.parseError).toBeNull();
  });

  it('reports a file with no permissions key as empty permissions, not an error', async () => {
    const h = makeHarness();
    // Shaped after the machine's own `~/.claude/settings.json`: real content,
    // no `permissions` key anywhere in it.
    writeOutOfBand(h.userSettingsPath, {
      model: 'sonnet',
      statusLine: { type: 'command', command: 'ccstatus' },
    });

    const doc = await h.service.load('user');

    expect(doc.parseError).toBeNull();
    expect(doc.scope.exists).toBe(true);
    expect(doc.managed.permissionsAllow).toEqual([]);
    expect(doc.managed.permissionsDeny).toEqual([]);
    expect(doc.managed.model).toBe('sonnet');
    expect(doc.unmanaged).toEqual({ statusLine: { type: 'command', command: 'ccstatus' } });
  });
});

describe('load, unparseable file', () => {
  it('returns the parser message with empty managed fields', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, '{ "model": "sonnet", }  // trailing comma\n');

    const doc = await h.service.load('user');

    expect(doc.parseError).not.toBeNull();
    // The parser's own words, not a rewrite of them.
    let expected: string;
    try {
      JSON.parse('{ "model": "sonnet", }  // trailing comma\n');
      throw new Error('fixture is parseable; the test proves nothing');
    } catch (err) {
      expected = (err as Error).message;
    }
    expect(doc.parseError).toBe(expected);

    expect(doc.managed.model).toBeNull();
    expect(doc.managed.permissionsAllow).toEqual([]);
    expect(doc.unmanaged).toEqual({});
    expect(doc.hooksJson).toBe('');
    // The revision is still reported: the form is read-only, not blind.
    expect(doc.revision).not.toBeNull();
  });

  it('reports a JSON array as unparseable rather than editing it', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, '["not", "an", "object"]\n');
    const doc = await h.service.load('user');
    expect(doc.parseError).toBe('Settings must be a JSON object.');
  });

  it('refuses to save over it, leaving the bytes untouched', async () => {
    const h = makeHarness();
    const original = writeOutOfBand(h.userSettingsPath, '{ "model": "sonnet", }\n');

    const doc = await h.service.load('user');
    const failure = await catchIpcFailure(() => h.service.save(draftFrom('user', doc)));

    expect(failure.code).toBe('INVALID_ARGUMENT');
    expect(failure.message).toContain(h.userSettingsPath);
    expect(readText(h.userSettingsPath)).toBe(original);
  });
});
