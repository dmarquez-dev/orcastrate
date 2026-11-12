// @vitest-environment jsdom

/**
 * The React half of the state layer: the provider's mount/unmount contract,
 * the seven hooks, and every derivation that turns raw store state into the
 * view models the frozen `renderer-state.ts` declares.
 *
 * The behavioural rules (error discipline, merge, permissions, selection) are
 * asserted against the store in `store.test.ts`; this file asserts that React
 * sees them.
 */

import { useState, type ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';

import type { Lane, NormalizedEvent, Pod, PodStatus } from '@shared/contracts/events';
import type { IpcResult, OrcastrateApi, Unsubscribe } from '@shared/contracts/ipc';
import { EVENT_CHANNELS } from '@shared/contracts/ipc';

import type * as Contract from '../contracts/renderer-state';
import type * as PanelContract from '../contracts/renderer-panels';
import {
  makeStubLane,
  makeStubPod,
  registerWorkspaceProvider,
  renderWithWorkspace,
  resetWorkspaceProvider,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils';

import * as state from './index';
import {
  WorkspaceProvider,
  useComposer,
  useLaneRail,
  usePermissionCards,
  usePodSession,
  usePods,
  useTranscript,
  useWorkspace,
  useWorkspaceActions,
} from './workspace-provider';
import {
  useBeachcomber,
  useBeachcomberActions,
  useHelm,
  useHelmActions,
} from './panel-provider';
import { steerPrefill } from './steer';

const POD = 'pod-1';

beforeAll(() => registerWorkspaceProvider(WorkspaceProvider));
afterAll(() => resetWorkspaceProvider());

// ---------------------------------------------------------------------------
// Criterion 1 — the exported surface IS the contract
// ---------------------------------------------------------------------------

/**
 * A compile-time proof that every declared member exists with the contract's
 * signature. If a signature drifts, `npm run typecheck` fails here rather than
 * in three consumer tasks at once.
 */
const surface: {
  WorkspaceProvider: typeof Contract.WorkspaceProvider;
  useWorkspace: typeof Contract.useWorkspace;
  usePods: typeof Contract.usePods;
  usePodSession: typeof Contract.usePodSession;
  useLaneRail: typeof Contract.useLaneRail;
  useTranscript: typeof Contract.useTranscript;
  useComposer: typeof Contract.useComposer;
  usePermissionCards: typeof Contract.usePermissionCards;
  useWorkspaceActions: typeof Contract.useWorkspaceActions;
  steerPrefill: typeof Contract.steerPrefill;
  // The panel seams, declared by the second frozen contract file. Same rule:
  // the barrel carries exactly what the contracts declare and nothing else.
  useBeachcomber: typeof PanelContract.useBeachcomber;
  useBeachcomberActions: typeof PanelContract.useBeachcomberActions;
  useHelm: typeof PanelContract.useHelm;
  useHelmActions: typeof PanelContract.useHelmActions;
} = {
  WorkspaceProvider,
  useWorkspace,
  usePods,
  usePodSession,
  useLaneRail,
  useTranscript,
  useComposer,
  usePermissionCards,
  useWorkspaceActions,
  steerPrefill,
  useBeachcomber,
  useBeachcomberActions,
  useHelm,
  useHelmActions,
};

const ACTION_NAMES = [
  'refreshPods',
  'createPod',
  'updatePod',
  'reorderPods',
  'deletePod',
  'openPod',
  'closePod',
  'reconnectPod',
  'forkPod',
  'setActivePod',
  'setComposerText',
  'sendComposer',
  'interruptPod',
  'steerFromLane',
  // The pane model: `selectLane`, `pinLane` and `unpinLane` are DELETED and
  // these two replace them (`contracts/renderer-panes.ts` section 2).
  'showLane',
  'hideLane',
  'jumpToLane',
  'retryLanes',
  'loadMoreEvents',
  'retryRoutingMode',
  'respondToPermission',
  'pickDirectory',
] as const;

describe('exported surface (criterion 1)', () => {
  it('exports exactly the contract members, none added and none removed', () => {
    expect(Object.keys(state).sort()).toEqual(Object.keys(surface).sort());
  });

  it('exposes every WorkspaceActions method and nothing else', async () => {
    let actions: Contract.WorkspaceActions | null = null;
    function Probe(): ReactNode {
      actions = useWorkspaceActions();
      return null;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />);
    });
    expect(Object.keys(actions ?? {}).sort()).toEqual([...ACTION_NAMES].sort());
    for (const name of ACTION_NAMES) {
      expect(typeof (actions as unknown as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('keeps the actions object referentially stable across re-renders', async () => {
    const seen: Contract.WorkspaceActions[] = [];
    let bump: (() => void) | null = null;
    function Probe(): ReactNode {
      const [, setTick] = useState(0);
      bump = () => setTick((tick) => tick + 1);
      seen.push(useWorkspaceActions());
      return null;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />);
    });
    await act(async () => {
      bump?.();
    });
    expect(seen.length).toBeGreaterThan(1);
    for (const actions of seen) expect(actions).toBe(seen[0]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — subscribe once on mount, unsubscribe every one on unmount
// ---------------------------------------------------------------------------

interface CountingApi {
  api: StubOrcastrateApi;
  subscribes: Record<string, number>;
  unsubscribes: Record<string, number>;
}

/** Wraps every `on*` so subscribe and unsubscribe calls can be counted. */
function countingApi(): CountingApi {
  const subscribes: Record<string, number> = {};
  const unsubscribes: Record<string, number> = {};
  const base = stubOrcastrateApi();
  // Read off the FROZEN constant rather than listed by hand, so a seventh push
  // channel cannot be added without this guarantee extending to cover it. It is
  // six today: the five workspace channels plus `helmChanged`.
  const names = Object.keys(EVENT_CHANNELS) as (keyof StubOrcastrateApi['on'])[];

  for (const name of names) {
    subscribes[name] = 0;
    unsubscribes[name] = 0;
    const original = base.on[name] as (cb: (payload: never) => void) => Unsubscribe;
    (base.on as Record<string, unknown>)[name] = (cb: (payload: never) => void): Unsubscribe => {
      subscribes[name] = (subscribes[name] ?? 0) + 1;
      const off = original(cb);
      return () => {
        unsubscribes[name] = (unsubscribes[name] ?? 0) + 1;
        off();
      };
    };
  }

  return { api: base, subscribes, unsubscribes };
}

describe('subscription guarantee (criterion 5)', () => {
  it('subscribes once per channel on mount and unsubscribes each exactly once', async () => {
    const { api, subscribes, unsubscribes } = countingApi();
    let renders = 0;
    function Probe(): ReactNode {
      renders += 1;
      const session = usePodSession();
      return <div data-testid="lanes">{session?.lanes.value.length ?? -1}</div>;
    }

    let unmount: (() => void) | null = null;
    await act(async () => {
      unmount = renderWithWorkspace(<Probe />, { api }).unmount;
    });

    for (const name of Object.keys(subscribes)) {
      expect(subscribes[name]).toBe(1);
      expect(api.listenerCount(name as 'podEvent')).toBe(1);
    }

    const rendersBeforeUnmount = renders;
    act(() => unmount?.());

    for (const name of Object.keys(unsubscribes)) {
      expect(unsubscribes[name]).toBe(1);
      expect(api.listenerCount(name as 'podEvent')).toBe(0);
    }

    // A push after unmount reaches nobody, so nothing re-renders.
    act(() => {
      api.emit.laneChanged({ podId: POD, lanes: [makeStubLane()] });
    });
    expect(renders).toBe(rendersBeforeUnmount);
  });
});

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

function ev(seq: number, laneId: string): NormalizedEvent {
  return {
    id: seq,
    podId: POD,
    laneId,
    seq,
    type: 'assistant_text',
    payload: { type: 'assistant_text', text: `#${seq}` },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const MATRIARCH: Lane = makeStubLane({ id: 'lane-matriarch', podId: POD });
const CALF: Lane = makeStubLane({
  id: 'lane-a',
  podId: POD,
  kind: 'calf',
  subagentType: 'explorer',
  description: 'look around',
  agentId: 'agent-7',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:00:05.000Z',
  status: 'done',
});

function podsApi(pods: Pod[]): StubOrcastrateApi {
  return stubOrcastrateApi({ pods: { list: async () => ({ ok: true, value: pods }) } });
}

describe('derived views', () => {
  it('orders the Pod bar and zeroes the active Pod unread count', async () => {
    const api = podsApi([
      makeStubPod({ id: 'second', tabOrder: 1 }),
      makeStubPod({ id: 'first', tabOrder: 0 }),
    ]);
    function Probe(): ReactNode {
      const pods = usePods();
      return (
        <div data-testid="tabs">
          {pods.phase}:{pods.value.map((tab) => `${tab.pod.id}/${tab.unreadEventCount}`).join(',')}
        </div>
      );
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });

    // 'first' is auto-activated, so its unread count stays 0 while 'second'
    // accumulates.
    act(() => {
      api.emit.podEvent({ podId: 'second', events: [ev(1, 'lane-matriarch')] });
      api.emit.podEvent({ podId: 'first', events: [ev(1, 'lane-matriarch')] });
    });

    expect(screen.getByTestId('tabs').textContent).toBe('ready:first/0,second/1');
  });

  it('badges a backgrounded Pod that is waiting on a permission', async () => {
    const api = podsApi([makeStubPod({ id: 'first', tabOrder: 0 }), makeStubPod({ id: 'second', tabOrder: 1 })]);
    function Probe(): ReactNode {
      const pods = usePods();
      return (
        <div data-testid="badges">
          {pods.value.map((tab) => `${tab.pod.id}/${String(tab.awaitingPermission)}/${tab.pendingPermissionCount}`).join(',')}
        </div>
      );
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });

    act(() => {
      api.emit.permissionRequested({
        podId: 'second',
        laneId: 'lane-matriarch',
        requestId: 'r1',
        toolName: 'Bash',
        input: null,
      });
    });

    expect(screen.getByTestId('badges').textContent).toBe('first/false/0,second/true/1');
  });

  it('builds lane rail rows in the guaranteed order with derived columns', async () => {
    const api = podsApi([makeStubPod({ id: POD })]);
    function Probe(): ReactNode {
      const rail = useLaneRail();
      return (
        <ul data-testid="rail">
          {rail.value.map((row) => (
            <li key={row.lane.id}>
              {[
                row.lane.id,
                row.agentType,
                row.description ?? 'null',
                String(row.isMatriarch),
                String(row.inPrimaryPane),
                String(row.inFollowerPane),
                String(row.elapsedMs),
              ].join('|')}
            </li>
          ))}
        </ul>
      );
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });

    act(() => {
      api.emit.laneChanged({ podId: POD, lanes: [CALF, MATRIARCH] });
    });

    const rows = [...screen.getByTestId('rail').querySelectorAll('li')].map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    // The Matriarch is index 0 even though the push delivered it second, and
    // is still running, so its elapsed time is measured against now.
    expect(rows[0]).toMatch(/^lane-matriarch\|matriarch\|null\|true\|true\|false\|\d+$/);
    expect(Number(rows[0]?.split('|').at(-1))).toBeGreaterThan(0);
    // A finished lane's elapsed time is frozen at endedAt - startedAt.
    expect(rows[1]).toBe('lane-a|explorer|look around|false|false|false|5000');
  });

  // -------------------------------------------------------------------------
  // The pane model's THREE surviving `LaneRowVm` fields (renderer-panes.ts
  // section 3, as amended by `lane-pin-removal.ts` section 3).
  //
  // The fourth field — the pin gate — is DELETED with the pin control it
  // gated. The tuple below keeps its full shape minus that field rather than
  // shrinking to a presence check, so a derivation that silently stopped
  // marking the follower still fails.
  // -------------------------------------------------------------------------

  /** Every row as `laneId/inPrimaryPane/inFollowerPane/focusedFollower`. */
  function PaneRowsProbe(): ReactNode {
    const rail = useLaneRail();
    return (
      <div data-testid="panes">
        {rail.value
          .map((row) =>
            [
              row.lane.id,
              String(row.inPrimaryPane),
              String(row.inFollowerPane),
              String(row.focusedFollower),
            ].join('/'),
          )
          .join(',')}
      </div>
    );
  }

  function panesText(): string {
    return screen.getByTestId('panes').textContent ?? '';
  }

  it('marks the primary, the follower and the focused follower', async () => {
    const api = podsApi([makeStubPod({ id: POD })]);
    let actions: Contract.WorkspaceActions | null = null;
    function Probe(): ReactNode {
      actions = useWorkspaceActions();
      return <PaneRowsProbe />;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });
    act(() => {
      api.emit.laneChanged({ podId: POD, lanes: [MATRIARCH, CALF] });
    });

    // Unsplit: the Matriarch holds the primary, nothing is a follower.
    expect(panesText()).toBe('lane-matriarch/true/false/false,lane-a/false/false/false');

    await act(async () => {
      actions?.showLane(POD, 'lane-a');
    });

    // The Calf is now the follower AND the focused one — the pane a further
    // rail click would overwrite. The Matriarch never moved.
    expect(panesText()).toBe('lane-matriarch/true/false/false,lane-a/false/true/true');
  });

  it('marks NO follower in inline routing mode, because showLane opens none', async () => {
    // The rule the deleted pin gate used to carry, now read back through the
    // SAME probe as the test directly above. Only the routing mode differs,
    // and the second `showLane` call is identical — so if step 0 of `showLane`
    // were dropped, this row would read `false/true/true` exactly as the
    // 'lanes' case does.
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [makeStubPod({ id: POD })] }) },
      app: { routingMode: async () => ({ ok: true, value: 'inline' as const }) },
    });
    let actions: Contract.WorkspaceActions | null = null;
    function Probe(): ReactNode {
      actions = useWorkspaceActions();
      return <PaneRowsProbe />;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });
    act(() => {
      api.emit.laneChanged({ podId: POD, lanes: [MATRIARCH, CALF] });
    });

    expect(panesText()).toBe('lane-matriarch/true/false/false,lane-a/false/false/false');

    await act(async () => {
      actions?.showLane(POD, 'lane-a');
    });

    // Not vacuous: BOTH rows are still present and the Matriarch still holds
    // the primary. It is only the follower marking that never appears.
    const rows = panesText().split(',');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe('lane-matriarch/true/false/false');
    expect(rows[1]).toBe('lane-a/false/false/false');
  });

  it('gives an empty idle transcript for a lane with no events, and merges pushes into it', async () => {
    const api = podsApi([makeStubPod({ id: POD })]);
    function Probe(): ReactNode {
      const transcript = useTranscript('lane-a');
      return (
        <div data-testid="transcript">
          {transcript.phase}:{transcript.events.map((e) => e.seq).join(',')}:
          {transcript.highWaterSeq}
        </div>
      );
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });
    expect(screen.getByTestId('transcript').textContent).toBe('idle::0');

    act(() => {
      api.emit.podEvent({ podId: POD, events: [ev(3, 'lane-a'), ev(1, 'lane-a')] });
    });
    expect(screen.getByTestId('transcript').textContent).toBe('ready:1,3:3');
  });

  it('returns permission cards only for the lane that asked', async () => {
    const api = podsApi([makeStubPod({ id: POD })]);
    function Probe(): ReactNode {
      const mine = usePermissionCards('lane-a');
      const other = usePermissionCards('lane-matriarch');
      return <div data-testid="cards">{`${mine.length}/${other.length}`}</div>;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });

    act(() => {
      api.emit.permissionRequested({
        podId: POD,
        laneId: 'lane-a',
        requestId: 'r1',
        toolName: 'Bash',
        input: null,
      });
    });

    expect(screen.getByTestId('cards').textContent).toBe('1/0');
  });

  it('disables the composer with the most specific reason', async () => {
    // CHANGED FIXTURE, NOT A CHANGED ASSERTION. The ladder below is untouched:
    // `not-opened`, then enabled, then `awaiting-permission`, then `beached`.
    // What moved is where the first rung's answer comes from — it used to be a
    // renderer-local `opened: false` default that said "not opened" about an
    // `'idle'` Pod main was holding open, and it is now main's own `status`.
    // So the fixture states the Pod is `'closed'`, which is what it had to
    // have meant all along.
    const api = podsApi([makeStubPod({ id: POD, status: 'closed' })]);
    function Probe(): ReactNode {
      const composer = useComposer();
      const actions = useWorkspaceActions();
      return (
        <button
          data-testid="composer"
          onClick={() => void actions.openPod(POD)}
          type="button"
        >
          {`${String(composer?.disabled)}/${composer?.disabledReason ?? 'null'}`}
        </button>
      );
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });
    expect(screen.getByTestId('composer').textContent).toBe('true/not-opened');

    await act(async () => {
      screen.getByTestId('composer').click();
    });
    expect(screen.getByTestId('composer').textContent).toBe('false/null');

    act(() => {
      api.emit.permissionRequested({
        podId: POD,
        laneId: 'lane-matriarch',
        requestId: 'r1',
        toolName: 'Bash',
        input: null,
      });
    });
    expect(screen.getByTestId('composer').textContent).toBe('true/awaiting-permission');

    act(() => {
      api.emit.podStatus({ podId: POD, status: 'beached', exitCode: 1 });
    });
    expect(screen.getByTestId('composer').textContent).toBe('true/beached');
  });

  it('exposes routingMode unchanged and no session until a Pod is active', async () => {
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [] }) },
      app: { routingMode: async () => ({ ok: true, value: 'inline' }) },
    });
    function Probe(): ReactNode {
      const workspace = useWorkspace();
      return (
        <div data-testid="workspace">
          {`${workspace.routingMode ?? 'null'}/${workspace.activePodId ?? 'null'}/${
            workspace.session === undefined ? 'no-session' : 'session'
          }`}
        </div>
      );
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });

    expect(screen.getByTestId('workspace').textContent).toBe('inline/null/no-session');
  });
});

// ---------------------------------------------------------------------------
// No bridge at all
// ---------------------------------------------------------------------------

describe('missing bridge', () => {
  it('renders children with every Loadable in error rather than throwing', async () => {
    function Probe(): ReactNode {
      const pods = usePods();
      return (
        <div data-testid="pods">{`${pods.phase}/${pods.error?.code ?? 'null'}/${pods.value.length}`}</div>
      );
    }

    // No `api` prop AND no `window.orcastrate`: the hard case the contract
    // spells out. jsdom gives a window with no bridge on it.
    expect((window as Partial<Window>).orcastrate).toBeUndefined();
    await act(async () => {
      renderWithWorkspace(<Probe />, {
        api: undefined as unknown as OrcastrateApi as StubOrcastrateApi,
        provider: ({ children }) => <WorkspaceProvider>{children}</WorkspaceProvider>,
      });
    });

    expect(screen.getByTestId('pods').textContent).toBe('error/INTERNAL/0');
  });
});

// ---------------------------------------------------------------------------
// Openness is DERIVED from `pod.status`
//
// The invariants pinned by section 6 of `contracts/renderer-lifecycle.ts`.
// I1 through I5 and I7 live here; I1's "no `opened` on the runtime record" half
// is asserted against the store itself in `store.test.ts`, and I6 is a lane
// concern that belongs to the views.
// ---------------------------------------------------------------------------

/**
 * The derivation expressed as DATA rather than by importing the implementation,
 * so the test is an independent oracle and not a tautology. It is an exhaustive
 * `Record<PodStatus, boolean>` on purpose: a sixth status added by a later
 * session fails to compile HERE, loudly, instead of quietly rendering as open.
 */
const OPENNESS: Readonly<Record<PodStatus, boolean>> = {
  closed: false,
  idle: true,
  running: true,
  waiting: true,
  beached: false,
};

const OPEN_STATUSES = ['idle', 'running', 'waiting'] as const satisfies readonly PodStatus[];

/** Tabs as `id/status/opened`, plus the active Pod's composer verdict. */
function LifecycleProbe(): ReactNode {
  const pods = usePods();
  const composer = useComposer();
  const actions = useWorkspaceActions();
  return (
    <div>
      <div data-testid="tabs">
        {pods.value.map((tab) => `${tab.pod.id}/${tab.status}/${String(tab.opened)}`).join(',')}
      </div>
      <div data-testid="phase">{pods.phase}</div>
      <button data-testid="composer" type="button" onClick={() => void actions.openPod(POD)}>
        {`${String(composer?.disabled)}/${composer?.disabledReason ?? 'null'}`}
      </button>
    </div>
  );
}

function tabsText(): string {
  return screen.getByTestId('tabs').textContent ?? '';
}

function composerText(): string {
  return screen.getByTestId('composer').textContent ?? '';
}

describe('openness is derived from status (renderer-lifecycle section 6)', () => {
  it('I7: every status derives the openness the contract states, and no other', async () => {
    const pods = (Object.keys(OPENNESS) as PodStatus[]).map((status, index) =>
      makeStubPod({ id: `pod-${status}`, tabOrder: index, status }),
    );
    await act(async () => {
      renderWithWorkspace(<LifecycleProbe />, { api: podsApi(pods) });
    });

    const expected = pods.map((pod) => `${pod.id}/${pod.status}/${String(OPENNESS[pod.status])}`);
    expect(tabsText()).toBe(expected.join(','));
    // Both sides of the derivation are actually present, so the sweep cannot
    // pass by answering one constant.
    expect(expected.some((row) => row.endsWith('/true'))).toBe(true);
    expect(expected.some((row) => row.endsWith('/false'))).toBe(true);
  });

  it.each(OPEN_STATUSES)(
    'I2: a Pod listed as %s has an enabled composer and an open tab, with no pods.open call',
    async (status) => {
      const api = podsApi([makeStubPod({ id: POD, tabOrder: 0, status })]);
      await act(async () => {
        renderWithWorkspace(<LifecycleProbe />, { api });
      });

      // The HMR case: main already holds the runner, and the renderer must not
      // have to ask for it again to believe it.
      expect(composerText()).toBe('false/null');
      expect(tabsText()).toBe(`${POD}/${status}/true`);
      expect(api.calls.podOpen).toHaveLength(0);
    },
  );

  it('I3: a Pod listed as closed is not open, beside a Pod in the same reply that is', async () => {
    const api = podsApi([
      makeStubPod({ id: POD, tabOrder: 0, status: 'closed' }),
      // The second Pod is the point: neither verdict can come from the renderer
      // answering one constant about everything.
      makeStubPod({ id: 'pod-live', tabOrder: 1, status: 'running' }),
    ]);
    await act(async () => {
      renderWithWorkspace(<LifecycleProbe />, { api });
    });

    expect(tabsText()).toBe(`${POD}/closed/false,pod-live/running/true`);
    expect(composerText()).toBe('true/not-opened');
  });

  it('I4: beached yields beached and closed yields not-opened, never confused', async () => {
    const api = podsApi([
      makeStubPod({ id: POD, tabOrder: 0, status: 'beached' }),
      makeStubPod({ id: 'pod-closed', tabOrder: 1, status: 'closed' }),
    ]);
    let actions: Contract.WorkspaceActions | null = null;
    function Probe(): ReactNode {
      actions = useWorkspaceActions();
      return <LifecycleProbe />;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });

    // Both are not-open; the LADDER's order is what separates them, because a
    // beached Pod sent to "not opened" would be sent to the wrong affordance.
    expect(tabsText()).toBe(`${POD}/beached/false,pod-closed/closed/false`);
    expect(composerText()).toBe('true/beached');

    await act(async () => {
      actions?.setActivePod('pod-closed');
    });
    expect(composerText()).toBe('true/not-opened');
  });

  it('I5: a podStatus push carrying closed disables the composer with no pods.list in between', async () => {
    // Counted here rather than read off `api.calls`, because an override
    // replaces the recording wrapper the default channel installs.
    let lists = 0;
    const api = stubOrcastrateApi({
      pods: {
        list: async (): Promise<IpcResult<Pod[]>> => {
          lists += 1;
          return { ok: true, value: [makeStubPod({ id: POD, tabOrder: 0, status: 'running' })] };
        },
      },
    });
    await act(async () => {
      renderWithWorkspace(<LifecycleProbe />, { api });
    });
    expect(composerText()).toBe('false/null');
    expect(lists).toBe(1);

    act(() => {
      api.emit.podStatus({ podId: POD, status: 'closed' });
    });

    expect(tabsText()).toBe(`${POD}/closed/false`);
    expect(composerText()).toBe('true/not-opened');
    // No refetch: the push alone carried the whole answer.
    expect(lists).toBe(1);
  });

  it('I1: openness stays a pure function of status while a refresh is in flight', async () => {
    const pods = [
      makeStubPod({ id: POD, tabOrder: 0, status: 'waiting' }),
      makeStubPod({ id: 'pod-shut', tabOrder: 1, status: 'closed' }),
    ];
    let released: (() => void) | null = null;
    let calls = 0;
    const api = stubOrcastrateApi({
      pods: {
        list: async (): Promise<IpcResult<Pod[]>> => {
          calls += 1;
          if (calls > 1) {
            await new Promise<void>((resolve) => {
              released = resolve;
            });
          }
          return { ok: true, value: pods };
        },
      },
    });
    let actions: Contract.WorkspaceActions | null = null;
    function Probe(): ReactNode {
      actions = useWorkspaceActions();
      return <LifecycleProbe />;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });

    let pending: Promise<unknown> | null = null;
    act(() => {
      pending = actions?.refreshPods() ?? null;
    });

    expect(screen.getByTestId('phase').textContent).toBe('loading');
    expect(tabsText()).toBe(`${POD}/waiting/true,pod-shut/closed/false`);

    await act(async () => {
      released?.();
      await pending;
    });
    expect(screen.getByTestId('phase').textContent).toBe('ready');
    expect(tabsText()).toBe(`${POD}/waiting/true,pod-shut/closed/false`);
  });

  it('does not enable the composer until main answers the open, and enables when it does', async () => {
    // THE ACCEPTED TRADE. The three optimistic `opened: true` patches used to
    // enable the composer on click, before main answered. Openness is now
    // main's answer, so the composer enables when the reply lands instead — an
    // enabled composer over a process that failed to start is the worse error.
    let answer: ((pod: Pod) => void) | null = null;
    // Counted here rather than read off `api.calls`, because an override
    // replaces the recording wrapper the default channel installs.
    let opens = 0;
    const api = stubOrcastrateApi({
      pods: {
        list: async (): Promise<IpcResult<Pod[]>> => ({
          ok: true,
          value: [makeStubPod({ id: POD, tabOrder: 0, status: 'closed' })],
        }),
        open: async (): Promise<IpcResult<Pod>> => {
          opens += 1;
          return new Promise<IpcResult<Pod>>((resolve) => {
            answer = (pod: Pod) => resolve({ ok: true, value: pod });
          });
        },
      },
    });
    await act(async () => {
      renderWithWorkspace(<LifecycleProbe />, { api });
    });
    expect(composerText()).toBe('true/not-opened');

    await act(async () => {
      screen.getByTestId('composer').click();
    });
    // The call is out; main has not answered; the composer is still disabled.
    expect(opens).toBe(1);
    expect(composerText()).toBe('true/not-opened');

    await act(async () => {
      answer?.(makeStubPod({ id: POD, tabOrder: 0, status: 'idle' }));
    });
    expect(composerText()).toBe('false/null');
  });

  it('enables the composer from a podStatus push alone, with no reply at all', async () => {
    const api = podsApi([makeStubPod({ id: POD, tabOrder: 0, status: 'closed' })]);
    await act(async () => {
      renderWithWorkspace(<LifecycleProbe />, { api });
    });
    expect(composerText()).toBe('true/not-opened');

    act(() => {
      api.emit.podStatus({ podId: POD, status: 'idle' });
    });
    expect(composerText()).toBe('false/null');
    expect(api.calls.podOpen).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The Matriarch row reports the POD's status
// (`contracts/lane-row-pod-status.ts` section 2)
//
// `PodStatus.running` is an ACTIVITY flag; `LaneStatus.running` is a LIFETIME
// flag the database enforces with `CHECK ((status = 'running') = (ended_at IS
// NULL))`. The Matriarch's lane is open for the Pod's whole life, so it reads
// `running` throughout — which is why the row needs a SECOND field rather than
// a widened `status`. Every probe below prints BOTH, so a derivation that
// disturbed `status` while adding `podStatus` fails here.
// ---------------------------------------------------------------------------

/** Every row as `laneId/status/podStatus`, with `null` spelled out. */
function PodStatusRowsProbe(): ReactNode {
  const rail = useLaneRail();
  return (
    <div data-testid="pod-status">
      {rail.value
        .map((row) => [row.lane.id, row.status, row.podStatus ?? 'null'].join('/'))
        .join(',')}
    </div>
  );
}

function podStatusText(): string {
  return screen.getByTestId('pod-status').textContent ?? '';
}

/** The whole `PodStatus` union, so no value can be silently unhandled. */
const POD_STATUSES: PodStatus[] = ['closed', 'idle', 'running', 'waiting', 'beached'];

describe('the Pod governs the open Matriarch row (lane-row-pod-status section 2)', () => {
  it('reports every one of the five PodStatus values on an OPEN Matriarch', async () => {
    const api = podsApi([makeStubPod({ id: POD })]);
    await act(async () => {
      renderWithWorkspace(<PodStatusRowsProbe />, { api });
    });
    act(() => {
      api.emit.laneChanged({ podId: POD, lanes: [MATRIARCH] });
    });

    for (const status of POD_STATUSES) {
      act(() => {
        api.emit.podStatus(
          status === 'beached'
            ? { podId: POD, status, exitCode: 1 }
            : { podId: POD, status },
        );
      });
      // The lane's OWN status never moves off `running` — it has not ended —
      // and that is exactly the collision the second field exists to break.
      expect(podStatusText()).toBe(`lane-matriarch/running/${status}`);
    }
  });

  it('leaves a TERMINAL Matriarch on its own lane status while the Pod runs', async () => {
    // The rule the user settled explicitly at Gate 1, and the one most likely
    // to be lost in a later refactor, so it gets its own case: a terminal lane
    // state is a real fact with an `endedAt` behind it and is never overwritten
    // by the Pod's status.
    const api = podsApi([makeStubPod({ id: POD })]);
    await act(async () => {
      renderWithWorkspace(<PodStatusRowsProbe />, { api });
    });
    act(() => {
      api.emit.podStatus({ podId: POD, status: 'running' });
    });

    for (const status of ['stopped', 'done', 'orphaned'] as const) {
      act(() => {
        api.emit.laneChanged({
          podId: POD,
          lanes: [
            makeStubLane({
              id: 'lane-matriarch',
              podId: POD,
              status,
              endedAt: '2026-01-01T00:00:05.000Z',
            }),
          ],
        });
      });
      expect(podStatusText()).toBe(`lane-matriarch/${status}/null`);
    }
  });

  it('leaves EVERY Calf row on its own lane status while the Pod runs', async () => {
    // A Calf is created when dispatched and ends when its subagent finishes,
    // and a subagent never waits on user input, so a `running` Calf genuinely
    // IS working. Asserted over all Calf rows, not over one.
    const api = podsApi([makeStubPod({ id: POD })]);
    const OPEN_CALF: Lane = makeStubLane({
      id: 'lane-open-calf',
      podId: POD,
      kind: 'calf',
      subagentType: 'explorer',
      description: 'still going',
      agentId: 'agent-8',
      startedAt: '2026-01-01T00:00:01.000Z',
      endedAt: null,
      status: 'running',
    });
    await act(async () => {
      renderWithWorkspace(<PodStatusRowsProbe />, { api });
    });
    act(() => {
      // CALF is the ENDED one (`done`, non-null `endedAt`); OPEN_CALF is open.
      api.emit.laneChanged({ podId: POD, lanes: [MATRIARCH, OPEN_CALF, CALF] });
      api.emit.podStatus({ podId: POD, status: 'running' });
    });

    const rows = podStatusText().split(',');
    expect(rows).toHaveLength(3);
    // Not vacuous: the Matriarch in the same rail IS governed by the Pod.
    expect(rows[0]).toBe('lane-matriarch/running/running');
    const calfRows = rows.slice(1);
    expect(calfRows).toHaveLength(2);
    expect(new Set(calfRows)).toEqual(
      new Set(['lane-a/done/null', 'lane-open-calf/running/null']),
    );
  });

  it("falls back to 'closed' when state.pods has no row for the active Pod", async () => {
    // The same fallback `deriveComposer` already takes: a Pod the state layer
    // cannot find is not open. Named as its own case so the fallback is a
    // decision on record rather than an accident of `??`.
    const api = podsApi([makeStubPod({ id: POD })]);
    let actions: Contract.WorkspaceActions | null = null;
    function Probe(): ReactNode {
      actions = useWorkspaceActions();
      return <PodStatusRowsProbe />;
    }
    await act(async () => {
      renderWithWorkspace(<Probe />, { api });
    });
    // 'ghost' has a runtime record but no Pod row, and `onPodStatus` ignores a
    // push for a Pod it cannot find — so nothing can supply a status here.
    await act(async () => {
      actions?.setActivePod('ghost');
    });
    act(() => {
      api.emit.laneChanged({
        podId: 'ghost',
        lanes: [makeStubLane({ id: 'lane-matriarch', podId: 'ghost' })],
      });
      api.emit.podStatus({ podId: 'ghost', status: 'running' });
    });

    expect(podStatusText()).toBe('lane-matriarch/running/closed');
  });
});
