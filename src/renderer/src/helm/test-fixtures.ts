/**
 * Fixtures for the Helm suites.
 *
 * The scopes and the document come from `test-utils/stub-api.ts` rather than
 * from literals here, so this directory's tests and the session-wide suite
 * exercise the same document — one with real unmanaged keys and real hooks
 * text, which is what makes a round-trip regression visible.
 *
 * `helmView` starts in the state the panel is in AFTER a scope has been picked
 * and its document has loaded, because that is the state almost every
 * assertion is about; the loading, error and empty states are one override
 * away.
 */

import { vi } from 'vitest';

import type { HelmDocument } from '@shared/contracts/helm';
import type { HelmActions, HelmDraft, HelmView } from '../contracts/renderer-panels';
import { makeStubHelmDocument, makeStubHelmScopes } from '../test-utils';

export function draftOf(document: HelmDocument): HelmDraft {
  return {
    managed: {
      model: document.managed.model,
      permissionsAllow: [...document.managed.permissionsAllow],
      permissionsDeny: [...document.managed.permissionsDeny],
      env: { ...document.managed.env },
      crossSessionInbound: document.managed.crossSessionInbound,
    },
    hooksJson: document.hooksJson,
  };
}

export function helmView(overrides: Partial<HelmView> = {}): HelmView {
  const document = overrides.document ?? makeStubHelmDocument('user');
  return {
    phase: 'ready',
    value: makeStubHelmScopes(),
    error: null,
    selectedScopeId: document.scope.id,
    document,
    loadingDocument: false,
    draft: draftOf(document),
    dirty: false,
    saving: false,
    issues: [],
    blocked: false,
    stale: false,
    conflict: null,
    lastSave: null,
    actionError: null,
    // Added by session 2026-08-31-orcastrate-helm-draft-safety, alongside
    // `HelmActions.compare()`. The default is the state a panel is in before
    // anyone asks for a comparison: nothing fetched, nothing in flight.
    incoming: null,
    comparing: false,
    ...overrides,
  };
}

export function helmActions(overrides: Partial<HelmActions> = {}): HelmActions {
  return {
    selectScope: vi.fn(async () => ({ ok: true as const, value: makeStubHelmDocument('user') })),
    reload: vi.fn(async () => ({ ok: true as const, value: makeStubHelmDocument('user') })),
    // `compare()` resolves the SAME shape as `reload()` but, unlike it, must
    // never be taken as having touched `document` or `draft` — a fixture that
    // returns a document is not a fixture that reseeds one.
    compare: vi.fn(async () => ({ ok: true as const, value: makeStubHelmDocument('user') })),
    edit: vi.fn(),
    discard: vi.fn(),
    save: vi.fn(async () => ({
      ok: true as const,
      value: {
        document: makeStubHelmDocument('user'),
        backupDisplayPath: makeStubHelmScopes()[0]?.displayPath ?? '',
        warnings: [],
      },
    })),
    ...overrides,
  };
}
