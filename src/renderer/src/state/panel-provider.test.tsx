// @vitest-environment jsdom

/**
 * The React half of the panel state layer: the four hooks, every derivation
 * that turns raw panel state into the view models the frozen
 * `renderer-panels.ts` declares, and the two lifecycle guarantees — one scan
 * per panel open, one `helmChanged` subscription per mount.
 *
 * The behavioural rules are asserted against the store in `panel-store.test.ts`;
 * this file asserts that React sees them, and that no derived value is stored.
 */

import { useState, type ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';

import type * as PanelContract from '../contracts/renderer-panels';
import type * as Contract from '../contracts/renderer-state';
import {
  ipcError,
  makeStubBeachcomberScan,
  registerWorkspaceProvider,
  renderWithWorkspace,
  resetWorkspaceProvider,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils';

import {
  BEACHCOMBER_ROOT_HEADINGS,
  useBeachcomber,
  useBeachcomberActions,
  useHelm,
  useHelmActions,
} from './panel-provider';
import { WorkspaceProvider, useWorkspace } from './workspace-provider';

const BLOCKED = 'entry-projects-blocked';
const ORPHAN = 'entry-projects-orphan';
const DECODED = 'entry-projects-decoded';

beforeAll(() => registerWorkspaceProvider(WorkspaceProvider));
afterAll(() => resetWorkspaceProvider());

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface Seen {
  beachcomber: PanelContract.BeachcomberView[];
  beachcomberActions: PanelContract.BeachcomberActions[];
  helm: PanelContract.HelmView[];
  helmActions: PanelContract.HelmActions[];
  renders: number;
  rerender: () => void;
}

/**
 * One probe that reads all four hooks, records every view it was handed, and
 * can be forced to re-render without any state changing — which is how
 * "nothing is fetched in response to a render" is actually proven.
 */
function mountProbe(api: StubOrcastrateApi): { seen: Seen; unmount: () => void } {
  const seen: Seen = {
    beachcomber: [],
    beachcomberActions: [],
    helm: [],
    helmActions: [],
    renders: 0,
    rerender: () => {},
  };

  function Probe(): ReactNode {
    const [, setTick] = useState(0);
    seen.renders += 1;
    seen.rerender = () => setTick((tick) => tick + 1);
    seen.beachcomber.push(useBeachcomber());
    seen.beachcomberActions.push(useBeachcomberActions());
    seen.helm.push(useHelm());
    seen.helmActions.push(useHelmActions());
    return null;
  }

  const { unmount } = renderWithWorkspace(<Probe />, { api });
  return { seen, unmount };
}

function latest<T>(list: T[]): T {
  const value = list[list.length - 1];
  if (value === undefined) throw new Error('the probe never rendered');
  return value;
}

// ---------------------------------------------------------------------------
// Criterion 4 — no bridge means phase 'error', never a throw
// ---------------------------------------------------------------------------

describe('a missing bridge is rendered, not thrown (criterion 4)', () => {
  /**
   * `renderWithWorkspace` supplies a stub when `api` is omitted, so this case
   * mounts the real provider DIRECTLY with no `api` prop and no
   * `window.orcastrate` — the shape of a window whose preload script did not
   * run, which is the only way to reach the null-bridge branch.
   */
  it('puts both views in phase error rather than blanking the window', async () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'orcastrate');
    delete (window as unknown as Record<string, unknown>).orcastrate;

    let beachcomber: PanelContract.BeachcomberView | null = null;
    let helm: PanelContract.HelmView | null = null;
    let actions: PanelContract.BeachcomberActions | null = null;
    let helmActions: PanelContract.HelmActions | null = null;
    function Probe(): ReactNode {
      beachcomber = useBeachcomber();
      helm = useHelm();
      actions = useBeachcomberActions();
      helmActions = useHelmActions();
      return null;
    }

    let threw: unknown = null;
    try {
      await act(async () => {
        render(
          <WorkspaceProvider>
            <Probe />
          </WorkspaceProvider>,
        );
      });
    } catch (cause) {
      threw = cause;
    }

    expect(threw).toBeNull();
    const bc = beachcomber as PanelContract.BeachcomberView | null;
    const hv = helm as PanelContract.HelmView | null;
    expect(bc?.phase).toBe('error');
    expect(bc?.error?.code).toBe('INTERNAL');
    expect(bc?.value).toEqual([]);
    expect(bc?.actionError).not.toBeNull();
    expect(hv?.phase).toBe('error');
    expect(hv?.error?.code).toBe('INTERNAL');
    expect(hv?.value).toEqual([]);

    // And every async action still answers rather than rejecting.
    const answers = await Promise.all([
      (actions as unknown as PanelContract.BeachcomberActions).rescan(),
      (actions as unknown as PanelContract.BeachcomberActions).requestPreview(),
      (actions as unknown as PanelContract.BeachcomberActions).trashPreviewed(),
      (helmActions as unknown as PanelContract.HelmActions).selectScope('user'),
      (helmActions as unknown as PanelContract.HelmActions).reload(),
      (helmActions as unknown as PanelContract.HelmActions).save(),
    ]);
    for (const answer of answers) expect(answer.ok).toBe(false);

    if (previous !== undefined) Object.defineProperty(window, 'orcastrate', previous);
  });
});

// ---------------------------------------------------------------------------
// Criteria 5 and 6 — declared states, and derivation on read
// ---------------------------------------------------------------------------

describe('the Beachcomber view is derived on read (criteria 5, 6)', () => {
  it('reaches ready with groups, headings and a per-root total', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    const view = latest(seen.beachcomber);
    expect(view.phase).toBe('ready');
    expect(view.error).toBeNull();
    expect(view.value.map((group) => group.root)).toEqual([
      'projects',
      'shellSnapshots',
      'fileHistory',
      'pasteCache',
    ]);
    const projects = view.value[0]!;
    expect(projects.heading).toBe(BEACHCOMBER_ROOT_HEADINGS.projects);
    expect(projects.displayPath).toBe('~/.claude/projects');
    expect(projects.rows).toHaveLength(3);
    expect(projects.totalBytes).toBe(4_194_304 + 1_048_576 + 262_144);
    expect(projects.error).toBeNull();
  });

  it('carries the sentence that names the Pod on a blocked row, and nothing on the others', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });

    const rows = latest(probe!.seen.beachcomber).value[0]!.rows;
    const blocked = rows.find((row) => row.entry.id === BLOCKED)!;
    const free = rows.find((row) => row.entry.id === ORPHAN)!;

    expect(blocked.blockedReason).toBe('Stub Pod uses this directory. Delete that Pod first.');
    expect(free.blockedReason).toBeNull();
  });

  it('renders a root that alone failed to read, without costing the other groups', async () => {
    const scan = makeStubBeachcomberScan();
    const api = stubOrcastrateApi({
      beachcomber: {
        scan: async () => ({
          ok: true,
          value: {
            ...scan,
            roots: scan.roots.map((root) =>
              root.key === 'fileHistory'
                ? { ...root, error: 'EACCES: permission denied' }
                : root,
            ),
          },
        }),
      },
    });
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });

    const view = latest(probe!.seen.beachcomber);
    expect(view.phase).toBe('ready');
    expect(view.value.find((group) => group.root === 'fileHistory')?.error).toBe(
      'EACCES: permission denied',
    );
    expect(view.value.find((group) => group.root === 'projects')?.error).toBeNull();
  });

  it('reaches ready with an EMPTY group list on a scan with zero entries', async () => {
    const api = stubOrcastrateApi({
      beachcomber: {
        scan: async () => ({ ok: true, value: makeStubBeachcomberScan({ entries: [] }) }),
      },
    });
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });

    const view = latest(probe!.seen.beachcomber);
    expect(view.phase).toBe('ready');
    expect(view.value).toEqual([]);
  });

  it('surfaces a failed scan as phase error with a message on actionError', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('beachcomberScan', ipcError('IO', 'EPERM: operation not permitted'));
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });

    const view = latest(probe!.seen.beachcomber);
    expect(view.phase).toBe('error');
    expect(view.error?.message).toBe('EPERM: operation not permitted');
    expect(view.actionError).toBe('EPERM: operation not permitted');
  });

  it('recomputes selectedBytes and row.selected from a toggle, with no setter for either', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;
    expect(latest(seen.beachcomber).selectedBytes).toBe(0);

    await act(async () => {
      latest(seen.beachcomberActions).toggle(ORPHAN);
    });

    const view = latest(seen.beachcomber);
    expect(view.selectedIds).toEqual([ORPHAN]);
    expect(view.selectedBytes).toBe(1_048_576);
    expect(view.value[0]!.rows.find((row) => row.entry.id === ORPHAN)?.selected).toBe(true);
    expect(view.value[0]!.rows.find((row) => row.entry.id === DECODED)?.selected).toBe(false);
  });

  it('follows the underlying scan: a rescan that drops a selected row recomputes selectedBytes', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    await act(async () => {
      latest(seen.beachcomberActions).toggle(ORPHAN);
      latest(seen.beachcomberActions).toggle(DECODED);
    });
    expect(latest(seen.beachcomber).selectedBytes).toBe(1_048_576 + 262_144);

    const thinner = makeStubBeachcomberScan({
      scanId: 'stub-scan-2',
      entries: makeStubBeachcomberScan().entries.filter((entry) => entry.id !== ORPHAN),
    });
    api.beachcomber.scan = async () => ({ ok: true, value: thinner });
    await act(async () => {
      await latest(seen.beachcomberActions).rescan();
    });

    const view = latest(seen.beachcomber);
    expect(view.selectedIds).toEqual([DECODED]);
    expect(view.selectedBytes).toBe(262_144);
  });
});

describe('the Helm view is derived on read (criteria 5, 6)', () => {
  it('reaches ready with the scope list, and is not dirty or blocked before an edit', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    expect(latest(seen.helm).phase).toBe('ready');
    expect(latest(seen.helm).value.map((scope) => scope.id)).toEqual([
      'user',
      'project:pod-1',
      'projectLocal:pod-1',
    ]);

    await act(async () => {
      await latest(seen.helmActions).selectScope('user');
    });

    const view = latest(seen.helm);
    expect(view.dirty).toBe(false);
    expect(view.blocked).toBe(false);
    expect(view.issues).toEqual([]);
    expect(view.draft?.managed).toEqual(view.document?.managed);
  });

  it('follows the draft: dirty and blocked change with no setter for either', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;
    await act(async () => {
      await latest(seen.helmActions).selectScope('user');
    });

    await act(async () => {
      latest(seen.helmActions).edit({ hooksJson: '{ not json' });
    });

    const view = latest(seen.helm);
    expect(view.dirty).toBe(true);
    expect(view.blocked).toBe(true);
    expect(view.issues.some((issue) => issue.field === 'hooksJson')).toBe(true);

    await act(async () => {
      latest(seen.helmActions).discard();
    });

    expect(latest(seen.helm).dirty).toBe(false);
    expect(latest(seen.helm).blocked).toBe(false);
  });

  it('surfaces a failed scope list as phase error', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('helmScopes', ipcError('IO', 'cannot stat ~/.claude'));
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });

    const view = latest(probe!.seen.helm);
    expect(view.phase).toBe('error');
    expect(view.error?.message).toBe('cannot stat ~/.claude');
    expect(view.value).toEqual([]);
  });

  it('sets stale from a helmChanged push for the open scope only', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;
    await act(async () => {
      await latest(seen.helmActions).selectScope('user');
    });

    await act(async () => {
      api.emit.helmChanged({
        scopeId: 'project:pod-1',
        displayPath: 'C:\\stub\\workspace\\.claude\\settings.json',
        changedAt: '2026-01-03T00:00:00.000Z',
      });
    });
    expect(latest(seen.helm).stale).toBe(false);

    await act(async () => {
      api.emit.helmChanged({
        scopeId: 'user',
        displayPath: '~/.claude/settings.json',
        changedAt: '2026-01-03T00:00:00.000Z',
      });
    });
    expect(latest(seen.helm).stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion 12 — one subscription per mount, released on unmount
// ---------------------------------------------------------------------------

describe('the sixth push channel is subscribed by the provider (criterion 12)', () => {
  it('subscribes once on mount and unsubscribes on unmount', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });

    expect(api.listenerCount('helmChanged')).toBe(1);

    act(() => probe!.unmount());

    expect(api.listenerCount('helmChanged')).toBe(0);
  });

  it('does not add a second subscription when a consumer re-renders', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });

    await act(async () => {
      probe!.seen.rerender();
    });

    expect(api.listenerCount('helmChanged')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Criterion 13 — client interaction state stays out of the store
// ---------------------------------------------------------------------------

describe('which panel is open is not workspace state (criterion 13)', () => {
  it('WorkspaceStore has no field naming an open panel', async () => {
    let store: Contract.WorkspaceStore | null = null;
    function Probe(): ReactNode {
      store = useWorkspace();
      return null;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />);
    });

    const keys = Object.keys(store ?? {});
    expect(keys.sort()).toEqual([
      'actions',
      'activePodId',
      'pods',
      'routingMode',
      'routingModeError',
      'session',
    ]);
    // Spelled out as well as counted, because the failure this guards against
    // is a field ADDED here that also lives in `App.tsx` — two owners of one
    // fact, which disagree the moment either one moves.
    for (const forbidden of ['panel', 'openPanel', 'activePanel', 'panelKey', 'panelOpen']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// A failed routing-mode load reaches the hook, not only the store
// ---------------------------------------------------------------------------

describe('useWorkspace().routingModeError', () => {
  it('carries the IpcError a failed app.routingMode() answered', async () => {
    const api = stubOrcastrateApi();
    const error = ipcError('INTERNAL', 'routing probe unavailable');
    api.failInvoke('appRoutingMode', error);
    // A holder rather than a `let`: TypeScript does not see the assignment
    // inside `Probe`, and would narrow a bare `let` to `null` here.
    const latest: { store: Contract.WorkspaceStore | null } = { store: null };
    function Probe(): ReactNode {
      latest.store = useWorkspace();
      return null;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });

    const seen = latest.store;
    if (seen === null) throw new Error('Probe never read useWorkspace()');
    expect(seen.routingModeError).toBe(error);
    expect(seen.routingMode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 14 — nothing is fetched in response to a render
// ---------------------------------------------------------------------------

describe('re-rendering fetches nothing (criterion 14)', () => {
  it('issues one scan and one listScopes per mount, whatever the render count', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    expect(api.calls.beachcomberScan).toHaveLength(1);
    expect(api.calls.helmScopes).toHaveLength(1);
    const rendersAfterMount = seen.renders;

    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        seen.rerender();
      });
    }

    expect(seen.renders).toBeGreaterThan(rendersAfterMount);
    expect(api.calls.beachcomberScan).toHaveLength(1);
    expect(api.calls.helmScopes).toHaveLength(1);
  });

  it('issues exactly one more scan on an explicit rescan', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    await act(async () => {
      await latest(seen.beachcomberActions).rescan();
    });

    expect(api.calls.beachcomberScan).toHaveLength(2);
  });

  it('keeps both action objects referentially stable across re-renders', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    await act(async () => {
      seen.rerender();
    });

    expect(seen.beachcomberActions.length).toBeGreaterThan(1);
    for (const actions of seen.beachcomberActions) expect(actions).toBe(seen.beachcomberActions[0]);
    for (const actions of seen.helmActions) expect(actions).toBe(seen.helmActions[0]);
  });
});

// ---------------------------------------------------------------------------
// `incoming` and `comparing` reach React from the store, and only from there
// ---------------------------------------------------------------------------

describe('the comparison fields are passed through, never re-derived', () => {
  it('starts null and false, and shows what compare() put in the store', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    expect(latest(seen.helm).incoming).toBeNull();
    expect(latest(seen.helm).comparing).toBe(false);

    await act(async () => {
      await latest(seen.helmActions).selectScope('user');
    });
    await act(async () => {
      await latest(seen.helmActions).compare();
    });

    const view = latest(seen.helm);
    expect(view.incoming?.scope.id).toBe('user');
    expect(view.comparing).toBe(false);
    // NOT seeded into the working copy: the two halves of the comparison stay
    // apart.
    expect(view.draft).not.toBe(view.incoming);
  });

  it('does not cache them across a render that changed nothing', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    await act(async () => {
      await latest(seen.helmActions).selectScope('user');
    });
    await act(async () => {
      await latest(seen.helmActions).compare();
    });
    expect(latest(seen.helm).incoming).not.toBeNull();

    // A clearing event in the store must be visible on the next render; a
    // value cached at this layer would go stale silently.
    await act(async () => {
      latest(seen.helmActions).discard();
    });
    await act(async () => {
      seen.rerender();
    });

    expect(latest(seen.helm).incoming).toBeNull();
  });

  it('reaches compare() only from an explicit action, never from mount or render', async () => {
    const api = stubOrcastrateApi();
    let probe: { seen: Seen; unmount: () => void } | null = null;
    await act(async () => {
      probe = mountProbe(api);
    });
    const seen = probe!.seen;

    await act(async () => {
      await latest(seen.helmActions).selectScope('user');
    });
    const loadsAfterSelect = api.calls.helmLoad.length;

    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        seen.rerender();
      });
    }

    expect(api.calls.helmLoad).toHaveLength(loadsAfterSelect);
    expect(latest(seen.helm).incoming).toBeNull();
  });
});
