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

import type { Lane, NormalizedEvent, Pod } from '@shared/contracts/events';
import type { OrcastrateApi, Unsubscribe } from '@shared/contracts/ipc';

import type * as Contract from '../contracts/renderer-state';
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
  'setActivePod',
  'setComposerText',
  'sendComposer',
  'interruptPod',
  'setPermissionMode',
  'steerFromLane',
  'selectLane',
  'pinLane',
  'unpinLane',
  'jumpToLane',
  'loadMoreEvents',
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
  const names = [
    'podEvent',
    'podStatus',
    'laneChanged',
    'permissionRequested',
    'permissionResolved',
  ] as const;

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
                String(row.selected),
                String(row.pinned),
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
    const api = podsApi([makeStubPod({ id: POD, status: 'idle' })]);
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
