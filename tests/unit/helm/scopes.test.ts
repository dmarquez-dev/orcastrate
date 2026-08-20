/**
 * SCOPES ARE NAMED, PATHS ARE NOT (criterion 2).
 *
 * The renderer picks a scope out of `listScopes()`. It cannot name a file, so
 * the interesting case is not "does traversal work" but "is a scopeId ever
 * turned into a path at all" — and the answer has to be no, provably, rather
 * than by inspection. `helmFs` is the module's single filesystem seam, so
 * spying on all of it and asserting zero calls is a real proof that the
 * traversal string was a table miss and nothing more.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { helmFs } from '../../../src/main/helm/fs-ops';

import { cleanupHelm, catchIpcFailure, makeHarness, writeOutOfBand } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupHelm();
});

describe('listScopes', () => {
  it('returns the user scope plus project and projectLocal for each Pod', () => {
    const h = makeHarness();
    h.addPod('pod-a', 'Refactor the router');
    h.addPod('pod-b', 'Ship the panel');

    const scopes = h.service.listScopes();

    expect(scopes.map((scope) => scope.id)).toEqual([
      'user',
      'project:pod-a',
      'projectLocal:pod-a',
      'project:pod-b',
      'projectLocal:pod-b',
    ]);
    expect(scopes.map((scope) => scope.kind)).toEqual([
      'user',
      'project',
      'projectLocal',
      'project',
      'projectLocal',
    ]);
    expect(scopes.map((scope) => scope.podId)).toEqual([null, 'pod-a', 'pod-a', 'pod-b', 'pod-b']);
    expect(scopes.map((scope) => scope.label)).toEqual([
      'All projects',
      'Refactor the router',
      'Refactor the router',
      'Ship the panel',
      'Ship the panel',
    ]);
  });

  it('reports displayPath and exists from a stat', () => {
    const h = makeHarness();
    h.addPod('pod-a');
    writeOutOfBand(h.projectPath('pod-a'), { model: 'sonnet' });

    const byId = new Map(h.service.listScopes().map((scope) => [scope.id, scope]));

    expect(byId.get('user')?.displayPath).toBe(h.userSettingsPath);
    expect(byId.get('project:pod-a')?.displayPath).toBe(h.projectPath('pod-a'));
    expect(byId.get('projectLocal:pod-a')?.displayPath).toBe(h.projectLocalPath('pod-a'));

    // The file that exists is the only one reported as existing.
    expect(byId.get('project:pod-a')?.exists).toBe(true);
    expect(byId.get('user')?.exists).toBe(false);
    expect(byId.get('projectLocal:pod-a')?.exists).toBe(false);
  });

  it('lists a Pod created after the service was constructed', () => {
    const h = makeHarness();
    expect(h.service.listScopes()).toHaveLength(1);
    h.addPod('pod-late');
    expect(h.service.listScopes()).toHaveLength(3);
  });
});

describe('scopeId resolution', () => {
  it('answers NOT_FOUND for an unknown scopeId', async () => {
    const h = makeHarness();
    h.addPod('pod-a');

    const failure = await catchIpcFailure(() => h.service.load('project:pod-nope'));
    expect(failure.code).toBe('NOT_FOUND');
  });

  it('treats a traversal string as a table miss and never touches the filesystem', async () => {
    const h = makeHarness();
    h.addPod('pod-a');

    const spies = (Object.keys(helmFs) as (keyof typeof helmFs)[]).map((key) =>
      vi.spyOn(helmFs, key),
    );

    const failure = await catchIpcFailure(() => h.service.load('project:../../../etc'));

    expect(failure.code).toBe('NOT_FOUND');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();

    // Control: the spies do fire for a scopeId that IS in the table, so the
    // assertion above is about the traversal string and not about broken spies.
    await h.service.load('user');
    expect(spies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
  });

  it('refuses a save for a scopeId it did not mint, before any write', async () => {
    const h = makeHarness();
    const failure = await catchIpcFailure(() =>
      h.service.save({
        scopeId: 'projectLocal:..\\..\\Windows',
        revision: null,
        managed: {
          model: null,
          permissionsAllow: [],
          permissionsDeny: [],
          env: {},
          crossSessionInbound: null,
        },
        unmanaged: {},
        hooksJson: '',
      }),
    );
    expect(failure.code).toBe('NOT_FOUND');
  });
});
