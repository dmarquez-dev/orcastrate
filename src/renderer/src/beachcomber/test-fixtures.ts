/**
 * Fixtures for this directory's own tests.
 *
 * Everything here builds a VIEW MODEL, never a bridge response: the panel is a
 * pure function of `BeachcomberPanelProps`, so its tests need no provider, no
 * stub api and no `window.orcastrate` — which is also the reason the isolation
 * scan has nothing to find in this directory.
 */

import type {
  BeachcomberEntry,
  BeachcomberPreview,
  BeachcomberPreviewItem,
  BeachcomberRootKey,
  BeachcomberScan,
  BeachcomberTrashResult,
} from '@shared/contracts/beachcomber';
import type { IpcError } from '@shared/contracts/ipc';
import type {
  BeachcomberActions,
  BeachcomberGroupVm,
  BeachcomberRowVm,
  BeachcomberView,
} from '../contracts/renderer-panels';

export function makeEntry(overrides: Partial<BeachcomberEntry> = {}): BeachcomberEntry {
  return {
    id: 'entry-1',
    root: 'projects',
    name: 'C--Users-dmarq-Development-Repos-orcastrate',
    displayPath: 'C:\\Users\\dmarq\\Development\\Repos\\orcastrate',
    pathSource: 'session-record',
    sizeBytes: 2048,
    fileCount: 12,
    lastModified: '2026-08-18T09:30:00.000Z',
    sessionCount: 3,
    orphan: false,
    blocked: null,
    blockedBy: null,
    ...overrides,
  };
}

/** A row whose entry is held by an open Pod. The reason is the state layer's
 * own sentence, reproduced here because that is what the panel receives. */
export function makeBlockedRow(overrides: Partial<BeachcomberEntry> = {}): BeachcomberRowVm {
  return {
    entry: makeEntry({
      id: 'entry-blocked',
      blocked: 'pod-cwd',
      blockedBy: { podId: 'pod-1', title: 'Refactor the router' },
      ...overrides,
    }),
    selected: false,
    blockedReason: 'Refactor the router uses this directory. Delete that Pod first.',
  };
}

/** A row whose path came from a lossy directory name, so it is a guess. */
export function makeUnverifiedRow(overrides: Partial<BeachcomberEntry> = {}): BeachcomberRowVm {
  return makeRow(
    makeEntry({
      id: 'entry-unverified',
      pathSource: 'decoded-name',
      // The contract guarantees a decoded-name entry is never an orphan.
      orphan: false,
      ...overrides,
    }),
  );
}

export function makeRow(
  entry: BeachcomberEntry = makeEntry(),
  overrides: Partial<BeachcomberRowVm> = {},
): BeachcomberRowVm {
  return { entry, selected: false, blockedReason: null, ...overrides };
}

export function makeGroup(overrides: Partial<BeachcomberGroupVm> = {}): BeachcomberGroupVm {
  return {
    root: 'projects',
    heading: 'Projects',
    displayPath: '~/.claude/projects',
    rows: [makeRow()],
    totalBytes: 2048,
    error: null,
    ...overrides,
  };
}

export function makeScan(overrides: Partial<BeachcomberScan> = {}): BeachcomberScan {
  return {
    scanId: 'scan-1',
    scannedAt: '2026-08-19T10:00:00.000Z',
    roots: [],
    entries: [],
    ...overrides,
  };
}

export function makePreviewItem(
  overrides: Partial<BeachcomberPreviewItem> = {},
): BeachcomberPreviewItem {
  return {
    id: 'entry-1',
    displayPath: 'C:\\Users\\dmarq\\Development\\Repos\\orcastrate',
    root: 'projects',
    sizeBytes: 2048,
    fileCount: 12,
    sampleNames: ['session-a.jsonl', 'session-b.jsonl'],
    stale: false,
    ...overrides,
  };
}

export function makePreview(overrides: Partial<BeachcomberPreview> = {}): BeachcomberPreview {
  return {
    items: [makePreviewItem()],
    refused: [],
    totalBytes: 2048,
    totalFiles: 12,
    ...overrides,
  };
}

export function makeTrashResult(
  overrides: Partial<BeachcomberTrashResult> = {},
): BeachcomberTrashResult {
  return {
    trashed: ['entry-1'],
    failed: [],
    refused: [],
    scan: makeScan(),
    ...overrides,
  };
}

export function makeError(message: string): IpcError {
  return { code: 'IO', message };
}

export function makeView(overrides: Partial<BeachcomberView> = {}): BeachcomberView {
  return {
    phase: 'ready',
    value: [makeGroup()],
    error: null,
    scan: makeScan(),
    selectedIds: [],
    selectedBytes: 0,
    preview: null,
    previewing: false,
    trashing: false,
    lastResult: null,
    actionError: null,
    ...overrides,
  };
}

export interface RecordedActions extends BeachcomberActions {
  readonly calls: {
    rescan: number;
    toggle: string[];
    toggleGroup: BeachcomberRootKey[];
    clearSelection: number;
    requestPreview: number;
    dismissPreview: number;
    trashPreviewed: number;
  };
}

/**
 * Records what the panel asked for. Hand-rolled rather than `vi.fn()` so the
 * counter object can be read in one assertion — `trashPreviewed` in particular
 * is checked as an exact zero in several tests.
 */
export function recordActions(): RecordedActions {
  const calls: RecordedActions['calls'] = {
    rescan: 0,
    toggle: [],
    toggleGroup: [],
    clearSelection: 0,
    requestPreview: 0,
    dismissPreview: 0,
    trashPreviewed: 0,
  };

  return {
    calls,
    rescan: async () => {
      calls.rescan += 1;
      return { ok: true, value: makeScan() };
    },
    toggle: (id) => {
      calls.toggle.push(id);
    },
    toggleGroup: (root) => {
      calls.toggleGroup.push(root);
    },
    clearSelection: () => {
      calls.clearSelection += 1;
    },
    requestPreview: async () => {
      calls.requestPreview += 1;
      return { ok: true, value: makePreview() };
    },
    dismissPreview: () => {
      calls.dismissPreview += 1;
    },
    trashPreviewed: async () => {
      calls.trashPreviewed += 1;
      return { ok: true, value: makeTrashResult() };
    },
  };
}
