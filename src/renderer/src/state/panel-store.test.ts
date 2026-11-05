/**
 * The panel state layer's behavioural contract, driven through the store
 * itself. Everything here is a rule rather than a rendering, so React is not
 * involved; `panel-provider.test.tsx` covers the derivation and the hooks.
 *
 * Node environment (the repo default): `../test-utils/stub-api` is imported
 * DIRECTLY rather than through the `test-utils` barrel, because the barrel
 * pulls in React Testing Library and its `afterEach(cleanup)`.
 */

import { describe, expect, it } from 'vitest';

import type { BeachcomberScan } from '@shared/contracts/beachcomber';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@shared/contracts/ipc';

import {
  ipcError,
  makeStubBeachcomberScan,
  makeStubHelmDocument,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils/stub-api';

import {
  NO_PREVIEW_MESSAGE,
  NO_SCOPE_MESSAGE,
  PanelStateStore,
  isDirty,
  validateDraft,
} from './panel-store';

const BLOCKED = 'entry-projects-blocked';
const ORPHAN = 'entry-projects-orphan';
const DECODED = 'entry-projects-decoded';
const SHELL = 'entry-shell-1';

function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

function makeStore(api: StubOrcastrateApi | null): PanelStateStore {
  return new PanelStateStore(api);
}

function beachcomber(store: PanelStateStore) {
  return store.getState().beachcomber;
}

function helm(store: PanelStateStore) {
  return store.getState().helm;
}

// ---------------------------------------------------------------------------
// Criterion 4 — every action resolves, and nothing ever rejects
// ---------------------------------------------------------------------------

/**
 * All THIRTEEN entry points on the two frozen action interfaces — twelve, plus
 * `compare()`, added to `HelmActions` by session
 * `2026-08-31-orcastrate-helm-draft-safety`. The three that are declared `void`
 * are here too: "never throws" is the guarantee, and a synchronous throw
 * white-screens a renderer just as thoroughly as a rejection.
 */
const EVERY_ACTION: { name: string; run: (store: PanelStateStore) => unknown }[] = [
  { name: 'rescan', run: (s) => s.beachcomberActions.rescan() },
  { name: 'toggle', run: (s) => s.beachcomberActions.toggle(ORPHAN) },
  { name: 'toggleGroup', run: (s) => s.beachcomberActions.toggleGroup('projects') },
  { name: 'clearSelection', run: (s) => s.beachcomberActions.clearSelection() },
  { name: 'requestPreview', run: (s) => s.beachcomberActions.requestPreview() },
  { name: 'dismissPreview', run: (s) => s.beachcomberActions.dismissPreview() },
  { name: 'trashPreviewed', run: (s) => s.beachcomberActions.trashPreviewed() },
  { name: 'selectScope', run: (s) => s.helmActions.selectScope('user') },
  { name: 'reload', run: (s) => s.helmActions.reload() },
  { name: 'compare', run: (s) => s.helmActions.compare() },
  { name: 'edit', run: (s) => s.helmActions.edit({ hooksJson: '{}' }) },
  { name: 'discard', run: (s) => s.helmActions.discard() },
  { name: 'save', run: (s) => s.helmActions.save() },
];

/** The ten that answer with an `ActionResult`. The other two return `void`. */
const RESOLVING_ACTIONS = EVERY_ACTION.filter(
  (action) => !['toggle', 'toggleGroup', 'clearSelection', 'dismissPreview', 'edit', 'discard'].includes(action.name),
);

describe('every action resolves and never rejects (criterion 4)', () => {
  it('reports phase error on both views when the bridge is absent, without throwing', () => {
    const store = makeStore(null);
    expect(store.hasBridge).toBe(false);
    expect(beachcomber(store).phase).toBe('error');
    expect(beachcomber(store).error?.code).toBe('INTERNAL');
    expect(helm(store).phase).toBe('error');
    expect(helm(store).error?.code).toBe('INTERNAL');
  });

  for (const action of EVERY_ACTION) {
    it(`${action.name}: does not throw with a null bridge`, () => {
      const store = makeStore(null);
      expect(() => action.run(store)).not.toThrow();
    });
  }

  for (const action of RESOLVING_ACTIONS) {
    it(`${action.name}: resolves { ok: false } with a message and no bridge`, async () => {
      const store = makeStore(null);
      const result = (await action.run(store)) as
        | { ok: true }
        | { ok: false; error: { code: string; message: string } };
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.message.length).toBeGreaterThan(0);
    });
  }

  it('drives every action against a bridge that fails everything without rejecting', async () => {
    const api = stubOrcastrateApi();
    api.failAllInvokes(ipcError('IO', 'the disk is on fire'));
    const store = makeStore(api);

    for (const action of EVERY_ACTION) {
      const answer = action.run(store);
      if (answer instanceof Promise) {
        const result = (await answer) as { ok: boolean };
        expect(result.ok).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — loading, error and empty are all declared
// ---------------------------------------------------------------------------

describe('loading, error and empty states (criterion 5)', () => {
  it('walks Beachcomber idle -> loading -> ready', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    const phases = [beachcomber(store).phase];
    store.subscribe(() => phases.push(beachcomber(store).phase));

    await store.beachcomberActions.rescan();

    expect(phases[0]).toBe('idle');
    expect(phases).toContain('loading');
    expect(beachcomber(store).phase).toBe('ready');
  });

  it('walks Helm idle -> loading -> ready', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    const phases = [helm(store).phase];
    store.subscribe(() => phases.push(helm(store).phase));

    await store.refreshScopes();

    expect(phases[0]).toBe('idle');
    expect(phases).toContain('loading');
    expect(helm(store).phase).toBe('ready');
  });

  it('puts a non-null message on actionError when a scan answers { ok: false }', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('beachcomberScan', ipcError('IO', '~/.claude is unreadable'));
    const store = makeStore(api);

    await store.beachcomberActions.rescan();

    expect(beachcomber(store).phase).toBe('error');
    expect(beachcomber(store).actionError).toBe('~/.claude is unreadable');
    expect(beachcomber(store).error?.message).toBe('~/.claude is unreadable');
  });

  it('puts a non-null message on actionError when a helm load answers { ok: false }', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('helmLoad', ipcError('IO', 'EACCES: permission denied'));
    const store = makeStore(api);

    await store.helmActions.selectScope('user');

    expect(helm(store).actionError).toBe('EACCES: permission denied');
    expect(helm(store).loadingDocument).toBe(false);
  });

  it('reaches ready on a scan with zero entries rather than sitting in loading', async () => {
    const api = stubOrcastrateApi({
      beachcomber: {
        scan: async () => ({ ok: true, value: makeStubBeachcomberScan({ entries: [] }) }),
      },
    });
    const store = makeStore(api);

    await store.beachcomberActions.rescan();

    expect(beachcomber(store).phase).toBe('ready');
    expect(beachcomber(store).scan?.entries).toEqual([]);
    expect(beachcomber(store).error).toBeNull();
  });

  it('keeps Loadable.error null unless the phase is error', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('beachcomberScan', ipcError('IO', 'first attempt failed'));
    const store = makeStore(api);
    await store.beachcomberActions.rescan();
    expect(beachcomber(store).error).not.toBeNull();

    api.clearInvokeFailure('beachcomberScan');
    await store.beachcomberActions.rescan();

    expect(beachcomber(store).phase).toBe('ready');
    expect(beachcomber(store).error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criteria 7, 8, 9, 10 — selection, blocking and the preview gate
// ---------------------------------------------------------------------------

describe('selection survives a rescan only for ids the new scan mints (criterion 7)', () => {
  it('drops a selected id the second scan no longer carries', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.beachcomberActions.rescan();

    store.beachcomberActions.toggle(ORPHAN);
    store.beachcomberActions.toggle(SHELL);
    expect([...beachcomber(store).selection]).toEqual([ORPHAN, SHELL]);

    const thinner: BeachcomberScan = makeStubBeachcomberScan({
      scanId: 'stub-scan-2',
      entries: makeStubBeachcomberScan().entries.filter((entry) => entry.id !== ORPHAN),
    });
    api.beachcomber.scan = async () => ({ ok: true, value: thinner });
    await store.beachcomberActions.rescan();

    expect([...beachcomber(store).selection]).toEqual([SHELL]);
  });
});

describe('a blocked row can never be selected (criterion 8)', () => {
  it('makes toggle on a blocked id a no-op', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.beachcomberActions.rescan();

    store.beachcomberActions.toggle(BLOCKED);

    expect([...beachcomber(store).selection]).toEqual([]);
  });

  it('skips blocked rows in toggleGroup', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.beachcomberActions.rescan();

    store.beachcomberActions.toggleGroup('projects');

    const selection = [...beachcomber(store).selection];
    expect(selection).toContain(ORPHAN);
    expect(selection).toContain(DECODED);
    expect(selection).not.toContain(BLOCKED);
  });

  it('toggles a fully selected group back off', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.beachcomberActions.rescan();

    store.beachcomberActions.toggleGroup('projects');
    store.beachcomberActions.toggleGroup('projects');

    expect([...beachcomber(store).selection]).toEqual([]);
  });

  it('ignores an id no scan ever minted', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.beachcomberActions.rescan();

    store.beachcomberActions.toggle('entry-that-does-not-exist');

    expect([...beachcomber(store).selection]).toEqual([]);
  });
});

describe('any selection change clears the preview (criterion 9)', () => {
  it('clears it on toggle', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggle(ORPHAN);
    await store.beachcomberActions.requestPreview();
    expect(beachcomber(store).preview).not.toBeNull();

    store.beachcomberActions.toggle(SHELL);

    expect(beachcomber(store).preview).toBeNull();
  });

  it('clears it on toggleGroup and on clearSelection', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggle(ORPHAN);

    await store.beachcomberActions.requestPreview();
    store.beachcomberActions.toggleGroup('pasteCache');
    expect(beachcomber(store).preview).toBeNull();

    await store.beachcomberActions.requestPreview();
    store.beachcomberActions.clearSelection();
    expect(beachcomber(store).preview).toBeNull();
  });

  it('clears it on a rescan, whose ids are a different namespace entirely', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggle(ORPHAN);
    await store.beachcomberActions.requestPreview();

    await store.beachcomberActions.rescan();

    expect(beachcomber(store).preview).toBeNull();
  });
});

describe('trashPreviewed never acts without a preview (criterion 10)', () => {
  it('refuses and never reaches the bridge', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggle(ORPHAN);

    const result = await store.beachcomberActions.trashPreviewed();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe(NO_PREVIEW_MESSAGE);
    expect(api.calls.beachcomberTrash).toHaveLength(0);
    expect(beachcomber(store).actionError).toBe(NO_PREVIEW_MESSAGE);
  });

  it('sends only the ids the preview accepted, never the refused ones', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggleGroup('projects');
    await store.beachcomberActions.requestPreview();
    // The blocked row was never selectable, so the preview only ever saw two.
    expect(beachcomber(store).preview?.items).toHaveLength(2);

    await store.beachcomberActions.trashPreviewed();

    const sent = api.calls.beachcomberTrash[0]?.[0] as { ids: string[] };
    expect(sent.ids).toEqual([ORPHAN, DECODED]);
    expect(sent.ids).not.toContain(BLOCKED);
  });

  it('replaces the scan from the trash result and clears the preview', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggle(ORPHAN);
    await store.beachcomberActions.requestPreview();

    const result = await store.beachcomberActions.trashPreviewed();

    expect(result.ok).toBe(true);
    expect(beachcomber(store).preview).toBeNull();
    expect(beachcomber(store).lastResult?.trashed).toEqual([ORPHAN]);
    expect(beachcomber(store).scan?.entries.some((e) => e.id === ORPHAN)).toBe(false);
    // The id is gone from the new scan, so the selection is gone with it.
    expect([...beachcomber(store).selection]).toEqual([]);
  });

  it('reports a stale id as a NOT_FOUND failure rather than acting on it', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggle(ORPHAN);
    await store.beachcomberActions.requestPreview();
    // What the shipped service does for an id from a superseded scan.
    api.failInvoke('beachcomberTrash', ipcError('NOT_FOUND', 'That scan is no longer current.'));

    const result = await store.beachcomberActions.trashPreviewed();

    expect(result.ok).toBe(false);
    expect(beachcomber(store).actionError).toBe('That scan is no longer current.');
    expect(beachcomber(store).trashing).toBe(false);
  });

  it('surfaces a partial failure as a value, not as an error', async () => {
    const api = stubOrcastrateApi({
      beachcomber: {
        trash: async () => ({
          ok: true,
          value: {
            trashed: [SHELL],
            failed: [{ id: ORPHAN, displayPath: 'C:\\stub\\deleted-project', message: 'EBUSY: resource busy or locked' }],
            refused: [],
            scan: makeStubBeachcomberScan({ scanId: 'stub-scan-3' }),
          },
        }),
      },
    });
    const store = makeStore(api);
    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggle(ORPHAN);
    await store.beachcomberActions.requestPreview();

    const result = await store.beachcomberActions.trashPreviewed();

    expect(result.ok).toBe(true);
    expect(beachcomber(store).lastResult?.failed).toHaveLength(1);
    expect(beachcomber(store).actionError).toBe('EBUSY: resource busy or locked');
  });

  it('refuses a preview with nothing selected without reaching the bridge', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.beachcomberActions.rescan();

    const result = await store.beachcomberActions.requestPreview();

    expect(result.ok).toBe(false);
    expect(api.calls.beachcomberPreview).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Criterion 11 — the Helm form's lifecycle
// ---------------------------------------------------------------------------

describe('Helm load, edit, discard and save (criterion 11)', () => {
  it('selectScope loads the document and seeds the draft from it', async () => {
    const store = makeStore(stubOrcastrateApi());

    const result = await store.helmActions.selectScope('user');

    expect(result.ok).toBe(true);
    const state = helm(store);
    expect(state.selectedScopeId).toBe('user');
    expect(state.document?.scope.id).toBe('user');
    expect(state.draft?.managed).toEqual(state.document?.managed);
    expect(state.draft?.hooksJson).toBe(state.document?.hooksJson);
    expect(isDirty(state.document, state.draft)).toBe(false);
  });

  it('seeds the draft as a COPY, so editing it cannot mutate the document', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.helmActions.selectScope('user');
    const loaded = helm(store).document;

    store.helmActions.edit({
      managed: { ...helm(store).draft!.managed, permissionsAllow: ['Bash(ls:*)'] },
    });

    expect(loaded?.managed.permissionsAllow).toEqual([
      'Bash(npm run test:*)',
      'Read(~/.claude/**)',
    ]);
  });

  it('edit makes the form dirty; discard restores the loaded values and clears it', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.helmActions.selectScope('user');

    store.helmActions.edit({ managed: { ...helm(store).draft!.managed, model: 'claude-opus-5' } });
    expect(isDirty(helm(store).document, helm(store).draft)).toBe(true);

    store.helmActions.discard();

    expect(helm(store).draft?.managed.model).toBe('claude-sonnet-4-6');
    expect(isDirty(helm(store).document, helm(store).draft)).toBe(false);
  });

  it('a CONFLICT keeps the draft intact, leaves it dirty, and sets conflict and stale', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ managed: { ...helm(store).draft!.managed, model: 'claude-opus-5' } });

    api.failInvoke(
      'helmSave',
      ipcError('CONFLICT', '~/.claude/settings.json changed on disk. Nothing was written.'),
    );
    const result = await store.helmActions.save();

    expect(result.ok).toBe(false);
    const state = helm(store);
    expect(state.conflict).toBe('~/.claude/settings.json changed on disk. Nothing was written.');
    expect(state.stale).toBe(true);
    expect(state.saving).toBe(false);
    // THE DRAFT SURVIVES, and `document` never moved, so it is still dirty.
    expect(state.draft?.managed.model).toBe('claude-opus-5');
    expect(isDirty(state.document, state.draft)).toBe(true);
  });

  it('a successful save adopts the returned document and clears dirty, stale and conflict', async () => {
    const store = makeStore(stubOrcastrateApi());
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ managed: { ...helm(store).draft!.managed, model: 'claude-opus-5' } });

    const result = await store.helmActions.save();

    expect(result.ok).toBe(true);
    const state = helm(store);
    expect(state.document?.managed.model).toBe('claude-opus-5');
    expect(isDirty(state.document, state.draft)).toBe(false);
    expect(state.stale).toBe(false);
    expect(state.conflict).toBeNull();
    expect(state.lastSave?.backupDisplayPath.length).toBeGreaterThan(0);
  });

  it('hands back the loaded revision and the unmanaged keys verbatim', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    const loaded = helm(store).document!;

    await store.helmActions.save();

    const sent = api.calls.helmSave[0]?.[0] as {
      revision: unknown;
      unmanaged: Record<string, unknown>;
    };
    expect(sent.revision).toBe(loaded.revision);
    expect(sent.unmanaged).toBe(loaded.unmanaged);
  });

  it('reload re-reads from disk and discards the draft', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ hooksJson: '{"PreToolUse":[]}' });

    await store.helmActions.reload();

    expect(isDirty(helm(store).document, helm(store).draft)).toBe(false);
    expect(api.calls.helmLoad).toHaveLength(2);
  });

  it('refuses to save a file it could not parse, and never reaches the bridge', async () => {
    const api = stubOrcastrateApi({
      helm: {
        load: async () => ({
          ok: true,
          value: makeStubHelmDocument('user', { parseError: 'Unexpected token } at line 4' }),
        }),
      },
    });
    const store = makeStore(api);
    await store.helmActions.selectScope('user');

    const result = await store.helmActions.save();

    expect(result.ok).toBe(false);
    expect(api.calls.helmSave).toHaveLength(0);
  });

  it('refuses to save while a validation error stands, and never reaches the bridge', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ hooksJson: '{ this is not json' });

    const result = await store.helmActions.save();

    expect(result.ok).toBe(false);
    expect(api.calls.helmSave).toHaveLength(0);
  });

  it('reload with no scope selected refuses without reaching the bridge', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    const result = await store.helmActions.reload();

    expect(result.ok).toBe(false);
    expect(api.calls.helmLoad).toHaveLength(0);
  });
});

describe('validation is derived from the draft', () => {
  it('flags unparseable hooks as an error', () => {
    const document = makeStubHelmDocument('user');
    const issues = validateDraft({ managed: document.managed, hooksJson: '{oops' }, document);
    expect(issues.some((issue) => issue.field === 'hooksJson' && issue.severity === 'error')).toBe(
      true,
    );
  });

  it('accepts an absent hooks key', () => {
    const document = makeStubHelmDocument('user');
    expect(validateDraft({ managed: document.managed, hooksJson: '' }, document)).toEqual([]);
  });

  it('raises no issue, not even a warning, when the draft sets crossSessionInbound to hold', () => {
    const document = makeStubHelmDocument('user');
    const issues = validateDraft(
      {
        managed: { ...document.managed, crossSessionInbound: 'hold' },
        hooksJson: document.hooksJson,
      },
      document,
    );
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 12 — the helmChanged push
// ---------------------------------------------------------------------------

describe('the helmChanged push (criterion 12)', () => {
  it('subscribes exactly once on start and releases it exactly once on stop', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    store.start();
    store.start();
    expect(api.listenerCount('helmChanged')).toBe(1);

    store.stop();
    expect(api.listenerCount('helmChanged')).toBe(0);
  });

  it('sets stale when the push names the selected scope', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    await store.helmActions.selectScope('user');

    api.emit.helmChanged({
      scopeId: 'user',
      displayPath: '~/.claude/settings.json',
      changedAt: '2026-01-03T00:00:00.000Z',
    });

    expect(helm(store).stale).toBe(true);
    store.stop();
  });

  it('ignores a push naming any other scope', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    await store.helmActions.selectScope('user');

    api.emit.helmChanged({
      scopeId: 'project:pod-1',
      displayPath: 'C:\\stub\\workspace\\.claude\\settings.json',
      changedAt: '2026-01-03T00:00:00.000Z',
    });

    expect(helm(store).stale).toBe(false);
    store.stop();
  });

  it('ignores a push arriving before any scope is selected', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();

    api.emit.helmChanged({
      scopeId: 'user',
      displayPath: '~/.claude/settings.json',
      changedAt: '2026-01-03T00:00:00.000Z',
    });

    expect(helm(store).stale).toBe(false);
    store.stop();
  });

  it('reaches nobody after stop', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    await store.helmActions.selectScope('user');
    store.stop();

    api.emit.helmChanged({
      scopeId: 'user',
      displayPath: '~/.claude/settings.json',
      changedAt: '2026-01-03T00:00:00.000Z',
    });

    expect(helm(store).stale).toBe(false);
  });

  it('subscribes to helmChanged and nothing else — the other five are the workspace store\'s', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();

    for (const key of Object.keys(EVENT_CHANNELS)) {
      const expected = key === 'helmChanged' ? 1 : 0;
      expect(api.listenerCount(key as 'helmChanged')).toBe(expected);
    }
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// Criterion 14 — nothing is fetched in response to a render
// ---------------------------------------------------------------------------

describe('fetching belongs to the lifecycle, not the render (criterion 14)', () => {
  it('issues one scan per panel open, and one more per explicit rescan', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    const release = store.retainBeachcomber();
    await flush();
    expect(api.calls.beachcomberScan).toHaveLength(1);

    // A second consumer of the same open panel joins the first scan.
    const second = store.retainBeachcomber();
    await flush();
    expect(api.calls.beachcomberScan).toHaveLength(1);

    await store.beachcomberActions.rescan();
    expect(api.calls.beachcomberScan).toHaveLength(2);

    // Close, then reopen: the disk has moved on, so a fresh scan is issued —
    // and the ids of the old one are dead anyway.
    second();
    release();
    store.retainBeachcomber();
    await flush();
    expect(api.calls.beachcomberScan).toHaveLength(3);
  });

  it('issues one listScopes per Helm open', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    const release = store.retainHelm();
    await flush();
    expect(api.calls.helmScopes).toHaveLength(1);

    release();
    store.retainHelm();
    await flush();
    expect(api.calls.helmScopes).toHaveLength(2);
  });

  it('de-duplicates two rescans issued before the first lands', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    await Promise.all([
      store.beachcomberActions.rescan(),
      store.beachcomberActions.rescan(),
    ]);

    expect(api.calls.beachcomberScan).toHaveLength(1);
  });

  it('closing Beachcomber drops the scan, so no stale id can be acted on later', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    const release = store.retainBeachcomber();
    await flush();
    store.beachcomberActions.toggle(ORPHAN);

    release();

    expect(beachcomber(store).scan).toBeNull();
    expect([...beachcomber(store).selection]).toEqual([]);
    expect(beachcomber(store).phase).toBe('idle');
  });

  it('closing Helm drops the document and any unsaved draft', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    const release = store.retainHelm();
    await flush();
    await store.helmActions.selectScope('user');

    release();

    expect(helm(store).document).toBeNull();
    expect(helm(store).draft).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The store reaches only the six channels it owns
// ---------------------------------------------------------------------------

describe('the panel store touches only the panel channels', () => {
  it('never invokes a workspace channel', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();

    await store.beachcomberActions.rescan();
    store.beachcomberActions.toggle(ORPHAN);
    await store.beachcomberActions.requestPreview();
    await store.beachcomberActions.trashPreviewed();
    await store.refreshScopes();
    await store.helmActions.selectScope('user');
    await store.helmActions.save();
    store.stop();

    const panelChannels = new Set([
      'beachcomberScan',
      'beachcomberPreview',
      'beachcomberTrash',
      'helmScopes',
      'helmLoad',
      'helmSave',
    ]);
    for (const key of Object.keys(INVOKE_CHANNELS)) {
      const calls = api.calls[key as keyof typeof api.calls];
      if (panelChannels.has(key)) expect(calls.length).toBeGreaterThan(0);
      else expect(calls).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// A failed load must not discard a draft it did not replace (item 1)
// ---------------------------------------------------------------------------

describe('a failed load keeps the draft when the scope did not change (item 1)', () => {
  it('retains document and draft, verbatim, when a reload of the SAME scope fails', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ hooksJson: '{"PreToolUse":[]}' });
    const editedDraft = helm(store).draft;
    const loadedDocument = helm(store).document;

    api.failInvoke('helmLoad', ipcError('IO', 'EACCES: permission denied'));
    const result = await store.helmActions.reload();

    expect(result.ok).toBe(false);
    const state = helm(store);
    // The read wrote nothing, so there is nothing for the draft to be stale
    // against — losing it here would be pure data loss.
    expect(state.draft).toEqual(editedDraft);
    expect(state.document).toEqual(loadedDocument);
    expect(state.actionError).toBe('EACCES: permission denied');
    expect(state.loadingDocument).toBe(false);
  });

  it('still clears document and draft when the FAILED load targets a different scope', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ hooksJson: '{"PreToolUse":[]}' });

    api.failInvoke('helmLoad', ipcError('IO', 'EACCES: permission denied'));
    const result = await store.helmActions.selectScope('project:pod-1');

    expect(result.ok).toBe(false);
    const state = helm(store);
    // Showing the user scope's typed values under the project scope's name is
    // worse than losing them.
    expect(state.document).toBeNull();
    expect(state.draft).toBeNull();
    expect(state.selectedScopeId).toBe('project:pod-1');
    expect(state.actionError).toBe('EACCES: permission denied');
    expect(state.loadingDocument).toBe(false);
  });

  it('leaves the success path alone: a later successful reload still re-seeds the draft', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ managed: { ...helm(store).draft!.managed, model: 'claude-opus-5' } });

    api.failInvoke('helmLoad', ipcError('IO', 'EACCES: permission denied'));
    await store.helmActions.reload();
    api.clearInvokeFailure('helmLoad');
    await store.helmActions.reload();

    expect(helm(store).draft?.managed.model).toBe('claude-sonnet-4-6');
    expect(isDirty(helm(store).document, helm(store).draft)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// compare(): the comparison-capable read (item 2)
// ---------------------------------------------------------------------------

describe('compare fetches the current contents without touching the working copy (item 2)', () => {
  it('lands the fresh document in incoming and leaves document and draft untouched', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ managed: { ...helm(store).draft!.managed, model: 'claude-opus-5' } });
    const editedDraft = helm(store).draft;
    const loadedDocument = helm(store).document;

    const result = await store.helmActions.compare();

    expect(result.ok).toBe(true);
    const state = helm(store);
    expect(state.incoming?.scope.id).toBe('user');
    expect(state.comparing).toBe(false);
    expect(state.draft).toBe(editedDraft);
    expect(state.document).toBe(loadedDocument);
    expect(isDirty(state.document, state.draft)).toBe(true);
  });

  it('clears incoming to null when the read fails, and reports the verbatim message', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    await store.helmActions.compare();
    expect(helm(store).incoming).not.toBeNull();
    const loadedDocument = helm(store).document;
    const draft = helm(store).draft;

    api.failInvoke('helmLoad', ipcError('IO', 'EACCES: permission denied'));
    const result = await store.helmActions.compare();

    expect(result.ok).toBe(false);
    const state = helm(store);
    // A comparison against contents no longer known to be current is worse
    // than no comparison at all.
    expect(state.incoming).toBeNull();
    expect(state.comparing).toBe(false);
    expect(state.actionError).toBe('EACCES: permission denied');
    expect(state.document).toBe(loadedDocument);
    expect(state.draft).toBe(draft);
  });

  it('refuses with NO_SCOPE_MESSAGE and never reaches the bridge when no scope is selected', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    const result = await store.helmActions.compare();

    expect(result.ok).toBe(false);
    expect(api.calls.helmLoad).toHaveLength(0);
    const state = helm(store);
    expect(state.actionError).toBe(NO_SCOPE_MESSAGE);
    expect(state.incoming).toBeNull();
    expect(state.comparing).toBe(false);
  });

  it('fails closed with no bridge, without throwing', async () => {
    const store = makeStore(null);

    const result = await store.helmActions.compare();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
    expect(helm(store).incoming).toBeNull();
    expect(helm(store).comparing).toBe(false);
  });
});

describe('incoming is cleared by exactly the four events that make it meaningless', () => {
  async function withComparison(api: StubOrcastrateApi): Promise<PanelStateStore> {
    const store = makeStore(api);
    await store.helmActions.selectScope('user');
    store.helmActions.edit({ managed: { ...helm(store).draft!.managed, model: 'claude-opus-5' } });
    await store.helmActions.compare();
    expect(helm(store).incoming).not.toBeNull();
    return store;
  }

  it('selectScope clears it', async () => {
    const store = await withComparison(stubOrcastrateApi());
    await store.helmActions.selectScope('project:pod-1');
    expect(helm(store).incoming).toBeNull();
  });

  it('reload clears it', async () => {
    const store = await withComparison(stubOrcastrateApi());
    await store.helmActions.reload();
    expect(helm(store).incoming).toBeNull();
  });

  it('discard clears it', async () => {
    const store = await withComparison(stubOrcastrateApi());
    store.helmActions.discard();
    expect(helm(store).incoming).toBeNull();
  });

  it('a successful save clears it', async () => {
    const store = await withComparison(stubOrcastrateApi());
    const result = await store.helmActions.save();
    expect(result.ok).toBe(true);
    expect(helm(store).incoming).toBeNull();
  });

  it('a FAILED save leaves it intact, because a conflict is what it exists for', async () => {
    const api = stubOrcastrateApi();
    const store = await withComparison(api);
    const compared = helm(store).incoming;

    api.failInvoke(
      'helmSave',
      ipcError('CONFLICT', '~/.claude/settings.json changed on disk. Nothing was written.'),
    );
    const result = await store.helmActions.save();

    expect(result.ok).toBe(false);
    expect(helm(store).incoming).toBe(compared);
    expect(helm(store).draft?.managed.model).toBe('claude-opus-5');
  });

  it('an edit and a helmChanged push both leave it alone', async () => {
    const api = stubOrcastrateApi();
    const store = await withComparison(api);
    store.start();
    const compared = helm(store).incoming;

    store.helmActions.edit({ hooksJson: '{"PreToolUse":[]}' });
    api.emit.helmChanged({
      scopeId: 'user',
      displayPath: '~/.claude/settings.json',
      changedAt: '2026-01-03T00:00:00.000Z',
    });
    store.stop();

    expect(helm(store).incoming).toBe(compared);
    expect(helm(store).stale).toBe(true);
  });
});
