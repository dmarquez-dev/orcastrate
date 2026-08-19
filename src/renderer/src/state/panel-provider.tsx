/**
 * `PanelProvider` and the four panel hooks the frozen `renderer-panels.ts`
 * declares. T6 and T7 import these from the `state/` barrel and never touch the
 * bridge themselves — that is the whole point of this seam.
 *
 * WHAT LIVES WHERE, exactly as `workspace-provider.tsx` splits it:
 *   - `panel-store.ts` holds RAW state and owns every IPC call.
 *   - this file DERIVES on each render — the group list, `selectedIds`,
 *     `selectedBytes`, `dirty`, `issues`, `blocked`. None is stored, so none
 *     can go stale.
 *
 * WHICH PANEL IS OPEN IS NOT HERE, and that is deliberate. It is client
 * interaction state with exactly one owner: `App.tsx` local state. A copy in
 * this store would be a second owner, and two owners of one fact disagree.
 * What this file DOES know is that a panel hook mounting means the panel
 * opened, which is why the scan hangs off a mount effect and not off a render.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type {
  BeachcomberEntry,
  BeachcomberEntryId,
  BeachcomberRootKey,
  BeachcomberScan,
} from '@shared/contracts/beachcomber';
import { BEACHCOMBER_ROOTS } from '@shared/contracts/beachcomber';
import type { OrcastrateApi } from '@shared/contracts/ipc';

import type {
  BeachcomberActions,
  BeachcomberGroupVm,
  BeachcomberRowVm,
  BeachcomberView,
  HelmActions,
  HelmView,
} from '../contracts/renderer-panels';

import {
  PanelStateStore,
  isDirty,
  isSelectable,
  validateDraft,
  type BeachcomberPanelState,
  type HelmPanelState,
  type PanelState,
} from './panel-store';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * The four headings, in the order `BEACHCOMBER_ROOTS` declares. Sentence case
 * matches the rest of the app's headings; the wording is the design's own
 * (`~/.claude/shell-snapshots`, `file-history`, `paste-cache`) read back as
 * prose, so the heading and the `displayPath` beneath it agree.
 */
export const BEACHCOMBER_ROOT_HEADINGS: Readonly<Record<BeachcomberRootKey, string>> = {
  projects: 'Projects',
  shellSnapshots: 'Shell snapshots',
  fileHistory: 'File history',
  pasteCache: 'Paste cache',
};

/**
 * THE SENTENCE THE USER READS, and it names the Pod. Per the accessibility
 * floor the disabled state is carried by this text (and by `aria-disabled`),
 * never by color alone.
 */
export function blockedReasonFor(entry: BeachcomberEntry): string | null {
  if (entry.blocked === null) return null;
  const title = entry.blockedBy?.title ?? 'An open Pod';
  return `${title} uses this directory. Delete that Pod first.`;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PanelContext = createContext<PanelStateStore | null>(null);

export interface PanelProviderProps {
  children: ReactNode;
  /**
   * Already resolved by `WorkspaceProvider`. This component NEVER reads
   * `window.orcastrate` itself — the bridge is named exactly once in the whole
   * state layer, and that once is `workspace-provider.tsx`.
   */
  api: OrcastrateApi | null;
}

export function PanelProvider({ children, api }: PanelProviderProps): ReactNode {
  const store = useMemo(() => new PanelStateStore(api), [api]);

  useEffect(() => {
    // The sixth push channel, subscribed exactly once on mount and released
    // exactly once on unmount.
    store.start();
    return () => {
      store.stop();
    };
  }, [store]);

  return <PanelContext.Provider value={store}>{children}</PanelContext.Provider>;
}

function usePanelStore(): PanelStateStore {
  const store = useContext(PanelContext);
  if (store === null) {
    throw new Error(
      'The panel hooks must be rendered inside <WorkspaceProvider>. See ' +
        'src/renderer/src/state/panel-provider.tsx.',
    );
  }
  return store;
}

function usePanelState(): PanelState {
  const store = usePanelStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

// ---------------------------------------------------------------------------
// Beachcomber
// ---------------------------------------------------------------------------

export function useBeachcomber(): BeachcomberView {
  const store = usePanelStore();
  const state = usePanelState();

  // NOTHING IS FETCHED IN RESPONSE TO A RENDER. Opening the panel mounts this
  // hook, and that mount is the event that issues the one scan.
  useEffect(() => store.retainBeachcomber(), [store]);

  return useMemo(() => deriveBeachcomber(state.beachcomber), [state.beachcomber]);
}

export function useBeachcomberActions(): BeachcomberActions {
  return usePanelStore().beachcomberActions;
}

export function deriveBeachcomber(state: BeachcomberPanelState): BeachcomberView {
  const scan = state.scan;
  // Derived on read, so a rescan that drops a row drops it from the selection
  // and from `selectedBytes` with no setter call anywhere.
  const selectedIds = state.selection.filter((id) => isSelectable(scan, id));
  const selectedSet = new Set(selectedIds);

  return {
    phase: state.phase,
    value: deriveGroups(scan, selectedSet),
    error: state.error,
    scan,
    selectedIds,
    selectedBytes: selectedBytesOf(scan, selectedSet),
    preview: state.preview,
    previewing: state.previewing,
    trashing: state.trashing,
    lastResult: state.lastResult,
    actionError: state.actionError,
  };
}

/**
 * One group per root that has something to say. A root with no rows and no
 * error contributes nothing, so a scan of an untouched machine reaches `ready`
 * with an EMPTY list rather than four empty headings the user has to read past.
 */
function deriveGroups(
  scan: BeachcomberScan | null,
  selected: ReadonlySet<BeachcomberEntryId>,
): BeachcomberGroupVm[] {
  if (scan === null) return [];
  const groups: BeachcomberGroupVm[] = [];

  for (const root of BEACHCOMBER_ROOTS) {
    const summary = scan.roots.find((candidate) => candidate.key === root);
    // Entry order is the contract's: root order, then `sizeBytes` descending.
    const rows = scan.entries
      .filter((entry) => entry.root === root)
      .map<BeachcomberRowVm>((entry) => ({
        entry,
        selected: selected.has(entry.id),
        blockedReason: blockedReasonFor(entry),
      }));
    const error = summary?.error ?? null;
    if (rows.length === 0 && error === null) continue;

    groups.push({
      root,
      heading: BEACHCOMBER_ROOT_HEADINGS[root],
      displayPath: summary?.displayPath ?? '',
      rows,
      // Main's own total for the root, which counts what the scan summarised
      // rather than what happened to survive into `entries`.
      totalBytes: summary?.totalBytes ?? rows.reduce((sum, row) => sum + row.entry.sizeBytes, 0),
      error,
    });
  }

  return groups;
}

function selectedBytesOf(
  scan: BeachcomberScan | null,
  selected: ReadonlySet<BeachcomberEntryId>,
): number {
  if (scan === null) return 0;
  return scan.entries.reduce(
    (sum, entry) => (selected.has(entry.id) ? sum + entry.sizeBytes : sum),
    0,
  );
}

// ---------------------------------------------------------------------------
// Helm
// ---------------------------------------------------------------------------

export function useHelm(): HelmView {
  const store = usePanelStore();
  const state = usePanelState();

  useEffect(() => store.retainHelm(), [store]);

  return useMemo(() => deriveHelm(state.helm), [state.helm]);
}

export function useHelmActions(): HelmActions {
  return usePanelStore().helmActions;
}

export function deriveHelm(state: HelmPanelState): HelmView {
  const issues = validateDraft(state.draft, state.document);

  return {
    phase: state.phase,
    value: state.scopes,
    error: state.error,
    selectedScopeId: state.selectedScopeId,
    document: state.document,
    loadingDocument: state.loadingDocument,
    draft: state.draft,
    dirty: isDirty(state.document, state.draft),
    saving: state.saving,
    issues,
    blocked: issues.some((issue) => issue.severity === 'error'),
    stale: state.stale,
    conflict: state.conflict,
    lastSave: state.lastSave,
    actionError: state.actionError,
  };
}
