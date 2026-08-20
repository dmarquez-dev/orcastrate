/**
 * Fakes for the two panel ports `IpcHandlerDeps` now declares.
 *
 * WHY FAKES AND NOT THE REAL SERVICES. `src/main/ipc/**` knows Beachcomber and
 * Helm only as the interfaces the frozen contracts declare — that is the whole
 * point of injecting them — so the IPC suite must not import
 * `src/main/beachcomber` or `src/main/helm` either. Doing so would couple this
 * suite to two implementations it is not testing, and would quietly re-open
 * the door to a real `shell.trashItem` in a unit test.
 *
 * These fakes answer contract-valid values, record what they were called with,
 * and can be armed to throw any value at all — which is what the envelope
 * tests need, since the interesting cases are a thrown `IpcFailure` (whose code
 * must survive) and a thrown anything-else (which must become `INTERNAL`).
 */

import type {
  BeachcomberPreview,
  BeachcomberPreviewRequest,
  BeachcomberScan,
  BeachcomberService,
  BeachcomberTrashRequest,
  BeachcomberTrashResult,
} from '../../../src/shared/contracts/beachcomber';
import type {
  HelmChangedPush,
  HelmDocument,
  HelmSaveRequest,
  HelmSaveResult,
  HelmScope,
  HelmScopeId,
  HelmService,
  HelmValidation,
} from '../../../src/shared/contracts/helm';

export const FAKE_SCAN_ID = 'scan-fake-1';

export function fakeScan(): BeachcomberScan {
  return {
    scanId: FAKE_SCAN_ID,
    scannedAt: '2026-08-19T00:00:00.000Z',
    roots: [
      {
        key: 'projects',
        displayPath: '~/.claude/projects',
        present: true,
        entryCount: 1,
        totalBytes: 2048,
        error: null,
      },
      {
        key: 'shellSnapshots',
        displayPath: '~/.claude/shell-snapshots',
        present: true,
        entryCount: 0,
        totalBytes: 0,
        error: null,
      },
      {
        key: 'fileHistory',
        displayPath: '~/.claude/file-history',
        present: true,
        entryCount: 0,
        totalBytes: 0,
        error: null,
      },
      // A missing root is EMPTY, not an error — a user who never pasted an
      // image has no paste-cache.
      {
        key: 'pasteCache',
        displayPath: '~/.claude/paste-cache',
        present: false,
        entryCount: 0,
        totalBytes: 0,
        error: null,
      },
    ],
    entries: [
      {
        id: 'entry-1',
        root: 'projects',
        name: 'C--work-alpha',
        displayPath: 'C:\\work\\alpha',
        pathSource: 'session-record',
        sizeBytes: 2048,
        fileCount: 4,
        lastModified: '2026-08-18T00:00:00.000Z',
        sessionCount: 2,
        orphan: false,
        blocked: null,
        blockedBy: null,
      },
    ],
  };
}

export interface FakeBeachcomberService extends BeachcomberService {
  /** Arm every method to throw this value, whatever it is. */
  throwWith(err: unknown): void;
  /** Back to answering contract-valid values. */
  disarm(): void;
  readonly previewCalls: BeachcomberPreviewRequest[];
  readonly trashCalls: BeachcomberTrashRequest[];
  scanCount(): number;
}

export function fakeBeachcomberService(): FakeBeachcomberService {
  // A BOX, not a bare value. `null` and `undefined` are both legitimate things
  // to throw — the envelope suite throws each of them deliberately — so
  // "armed" cannot be encoded as "the value is not null".
  let armed: { value: unknown } | null = null;
  let scans = 0;
  const previewCalls: BeachcomberPreviewRequest[] = [];
  const trashCalls: BeachcomberTrashRequest[] = [];

  function guard(): void {
    if (armed !== null) throw armed.value;
  }

  return {
    async scan(): Promise<BeachcomberScan> {
      scans += 1;
      guard();
      return fakeScan();
    },
    async preview(req: BeachcomberPreviewRequest): Promise<BeachcomberPreview> {
      previewCalls.push(req);
      guard();
      return { items: [], refused: [], totalBytes: 0, totalFiles: 0 };
    },
    async trash(req: BeachcomberTrashRequest): Promise<BeachcomberTrashResult> {
      trashCalls.push(req);
      guard();
      return { trashed: [...req.ids], failed: [], refused: [], scan: fakeScan() };
    },
    throwWith(err) {
      armed = { value: err };
    },
    disarm() {
      armed = null;
    },
    previewCalls,
    trashCalls,
    scanCount: () => scans,
  };
}

export function fakeHelmScopes(): HelmScope[] {
  return [
    {
      id: 'user',
      kind: 'user',
      podId: null,
      label: 'All projects',
      displayPath: '~/.claude/settings.json',
      exists: true,
    },
    {
      id: 'project:pod-1',
      kind: 'project',
      podId: 'pod-1',
      label: 'Alpha',
      displayPath: 'C:\\work\\alpha\\.claude\\settings.json',
      exists: false,
    },
  ];
}

export function fakeHelmDocument(scopeId: HelmScopeId): HelmDocument {
  const scope = fakeHelmScopes().find((entry) => entry.id === scopeId) ?? fakeHelmScopes()[0];
  return {
    // `fakeHelmScopes()` is a non-empty literal, so index 0 always exists;
    // `noUncheckedIndexedAccess` still wants the fallback spelled out.
    scope: scope ?? {
      id: 'user',
      kind: 'user',
      podId: null,
      label: 'All projects',
      displayPath: '~/.claude/settings.json',
      exists: true,
    },
    revision: { sha256: 'a'.repeat(64), sizeBytes: 42, mtimeMs: 1_700_000_000_000 },
    managed: {
      model: null,
      permissionsAllow: [],
      permissionsDeny: [],
      env: {},
      crossSessionInbound: null,
    },
    unmanaged: {},
    hooksJson: '',
    parseError: null,
  };
}

export interface FakeHelmService extends HelmService {
  throwWith(err: unknown): void;
  disarm(): void;
  readonly saveCalls: HelmSaveRequest[];
  readonly loadCalls: HelmScopeId[];
  scopeCount(): number;
}

export function fakeHelmService(
  emitChanged: (push: HelmChangedPush) => void = () => {},
): FakeHelmService {
  // A BOX, not a bare value. `null` and `undefined` are both legitimate things
  // to throw — the envelope suite throws each of them deliberately — so
  // "armed" cannot be encoded as "the value is not null".
  let armed: { value: unknown } | null = null;
  let scopeCalls = 0;
  const saveCalls: HelmSaveRequest[] = [];
  const loadCalls: HelmScopeId[] = [];

  function guard(): void {
    if (armed !== null) throw armed.value;
  }

  return {
    listScopes(): HelmScope[] {
      scopeCalls += 1;
      guard();
      return fakeHelmScopes();
    },
    async load(scopeId: HelmScopeId): Promise<HelmDocument> {
      loadCalls.push(scopeId);
      guard();
      return fakeHelmDocument(scopeId);
    },
    validate(): HelmValidation {
      return { issues: [] };
    },
    async save(req: HelmSaveRequest): Promise<HelmSaveResult> {
      saveCalls.push(req);
      guard();
      return {
        document: fakeHelmDocument(req.scopeId),
        backupDisplayPath: '~/.claude/settings.json.2026-08-19T000000.bak',
        warnings: [],
      };
    },
    /**
     * Stands in for T3's `fs.watch`. The real service emits when the file moves
     * under it; the fake emits on demand, so the push channel can be proven
     * without a filesystem — and, as the contract insists, without the watcher
     * ever being what makes a safety test pass.
     */
    watch(scopeId: HelmScopeId | null): void {
      if (scopeId === null) return;
      emitChanged({
        scopeId,
        displayPath: fakeHelmDocument(scopeId).scope.displayPath,
        changedAt: '2026-08-19T00:00:01.000Z',
      });
    },
    dispose(): void {},
    throwWith(err) {
      armed = { value: err };
    },
    disarm() {
      armed = null;
    },
    saveCalls,
    loadCalls,
    scopeCount: () => scopeCalls,
  };
}

/** A payload that clears every validator, per channel that takes one. */
export const VALID_PANEL_PAYLOADS = {
  preview: { scanId: FAKE_SCAN_ID, ids: ['entry-1'] } satisfies BeachcomberPreviewRequest,
  trash: { scanId: FAKE_SCAN_ID, ids: ['entry-1'] } satisfies BeachcomberTrashRequest,
  scopeId: 'user' as HelmScopeId,
  save: {
    scopeId: 'user',
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
  } satisfies HelmSaveRequest,
} as const;
