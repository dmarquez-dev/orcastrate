/**
 * Shared harness for the renderer INTEGRATION suite (T8).
 *
 * Not a test file: it holds no `it`, and `vitest.config.ts` only collects
 * `*.test.{ts,tsx}`. Everything here exists so each suite file can mount the
 * whole app in one line and drive it through the frozen `TEST_IDS`.
 *
 * WHAT "THE WHOLE APP" MEANS HERE. `main.tsx` renders
 *
 *     <StrictMode>
 *       <WorkspaceProvider>      // no api prop: reads the preload bridge
 *         <App />
 *       </WorkspaceProvider>
 *     </StrictMode>
 *
 * and cannot be imported directly, because its module body calls
 * `createRoot(document.getElementById('root'))` and imports `global.css` for
 * its side effect. `AppRoot` below reproduces that tree's COMPONENTS — same
 * nesting, same order — with the provider's declared test seam (`api`)
 * supplying a stub in place of the bridge. The one thing it does not reproduce
 * is `main.tsx`'s `import './styles/global.css'`: that import exists for its
 * stylesheet side effect, which jsdom does not apply and no assertion here
 * depends on. StrictMode is kept rather than dropped: it is what
 * makes the provider mount, unmount and remount, which is precisely the
 * subscribe/unsubscribe path acceptance criterion 10 is about.
 *
 * No suite in this directory imports a non-exported symbol, reads a
 * component's internal state, or renders a component below `App`.
 */

import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, expect } from 'vitest';

import type {
  Lane,
  LaneId,
  NormalizedEvent,
  Pod,
  PodId,
  Seq,
} from '@shared/contracts/events';
import type { WorkspaceProviderProps } from '../contracts/renderer-state';

import { App } from '../App';
import { WorkspaceProvider } from '../state';
import {
  makeStubLane,
  makeStubPod,
  renderWithWorkspace,
  type RenderWithWorkspaceResult,
  type StubOrcastrateApi,
} from '../test-utils';

// ---------------------------------------------------------------------------
// Mounting the assembled app
// ---------------------------------------------------------------------------

/**
 * `main.tsx`'s tree, with the provider's `api` seam threaded through. Shaped as
 * a `WorkspaceProviderComponent` so it can be handed to `renderWithWorkspace`
 * as `{ provider }` — that is the only way to get StrictMode OUTSIDE the
 * provider, which is where `main.tsx` puts it.
 */
export function AppRoot({ children, api }: WorkspaceProviderProps): ReactNode {
  return (
    <StrictMode>
      <WorkspaceProvider api={api}>{children}</WorkspaceProvider>
    </StrictMode>
  );
}

/** Mount the assembled workspace against `api`. */
export function mountWorkspace(
  api: StubOrcastrateApi,
): RenderWithWorkspaceResult<StubOrcastrateApi> {
  return renderWithWorkspace<StubOrcastrateApi>(<App />, { api, provider: AppRoot });
}

// ---------------------------------------------------------------------------
// Unhandled rejection guard (acceptance criterion 6)
// ---------------------------------------------------------------------------

/**
 * `process` is untyped in this tree: `tsconfig.web.json` sets `"types": []` on
 * purpose. Declaring the two members used here keeps `typecheck:web` honest
 * without pulling `@types/node` into the renderer.
 */
declare const process: {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
};

export interface RejectionGuard {
  /** Every rejection seen since the current test began. */
  readonly seen: unknown[];
}

/**
 * Lets microtasks and the current macrotask queue drain, so a rejection
 * scheduled by a click handler has actually been reported before anything
 * asserts on it. This is a tick, not a sleep: it waits on the queue emptying,
 * with no duration to tune.
 */
export async function flushPendingWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Installs a `window.onunhandledrejection` spy for the whole suite and fails
 * the test if it ever fires.
 *
 * Both channels are watched. `window.onunhandledrejection` is the one the
 * criterion names and the one jsdom raises for rejections originating in page
 * code; Node's `process` 'unhandledRejection' is where a rejection created by
 * a promise the jsdom window never saw surfaces instead. Watching only one
 * would leave a real unhandled rejection able to slip past.
 */
export function installUnhandledRejectionGuard(): RejectionGuard {
  const seen: unknown[] = [];
  const guard: RejectionGuard = { seen };

  const onProcess = (reason: unknown): void => {
    seen.push(reason);
  };

  beforeEach(() => {
    seen.length = 0;
    window.onunhandledrejection = (event) => {
      seen.push(event.reason);
    };
    process.on('unhandledRejection', onProcess);
  });

  afterEach(async () => {
    await flushPendingWork();
    window.onunhandledrejection = null;
    process.off('unhandledRejection', onProcess);
    expect(seen, 'the app produced an unhandled promise rejection').toEqual([]);
  });

  return guard;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const ALPHA_ID: PodId = 'pod-alpha';
export const BRAVO_ID: PodId = 'pod-bravo';

/** Two Pods, deliberately in tabOrder so the bar's order is not in question. */
export const POD_ALPHA: Pod = makeStubPod({
  id: ALPHA_ID,
  title: 'Alpha',
  tabOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
});

export const POD_BRAVO: Pod = makeStubPod({
  id: BRAVO_ID,
  title: 'Bravo',
  tabOrder: 1,
  createdAt: '2026-01-01T00:00:01.000Z',
});

export const MATRIARCH_ID: LaneId = 'lane-matriarch';
export const CALF_EARLY_ID: LaneId = 'lane-calf-early';
export const CALF_LATE_ID: LaneId = 'lane-calf-late';

/**
 * Deliberately started BETWEEN the two Calves (:05 < :07 < :09).
 *
 * This is load-bearing, not arbitrary. If the Matriarch started first, a plain
 * `startedAt` sort would produce `EXPECTED_RAIL_ORDER` on its own and the
 * Matriarch PIN — the thing the guaranteed order actually turns on — would
 * never be exercised: deleting the pin from `orderLanes` would leave the rail
 * assertion green. With :07, the pin is the only thing that can lift the
 * Matriarch above `CALF_EARLY`, and the Calves' `startedAt` sort stays
 * load-bearing underneath it.
 */
export const MATRIARCH: Lane = makeStubLane({
  id: MATRIARCH_ID,
  podId: BRAVO_ID,
  kind: 'matriarch',
  startedAt: '2026-01-01T00:00:07.000Z',
});

/** Started BEFORE the Matriarch, and still below it: the pin outranks time. */
export const CALF_EARLY: Lane = makeStubLane({
  id: CALF_EARLY_ID,
  podId: BRAVO_ID,
  kind: 'calf',
  toolUseId: 'toolu-early',
  agentId: 'agent-early',
  parentLaneId: MATRIARCH_ID,
  depth: 1,
  subagentType: 'explorer',
  description: 'Read the lane router',
  startedAt: '2026-01-01T00:00:05.000Z',
});

/** Started SECOND, and carries no `agentId`: Steer must not be offered here. */
export const CALF_LATE: Lane = makeStubLane({
  id: CALF_LATE_ID,
  podId: BRAVO_ID,
  kind: 'calf',
  toolUseId: 'toolu-late',
  agentId: null,
  parentLaneId: MATRIARCH_ID,
  depth: 1,
  subagentType: 'reviewer',
  description: 'Review the diff',
  startedAt: '2026-01-01T00:00:09.000Z',
});

/**
 * The guaranteed rail order for the three lanes above.
 *
 * Note this is NOT `startedAt` ascending (that would be early, matriarch,
 * late). Only "Matriarch pinned to index 0, Calves by `startedAt`" produces
 * it, so the assertion distinguishes the guarantee from a plain time sort.
 */
export const EXPECTED_RAIL_ORDER: readonly LaneId[] = [
  MATRIARCH_ID,
  CALF_EARLY_ID,
  CALF_LATE_ID,
];

/** One assistant message. `text` is what the transcript is asserted on. */
export function assistantEvent(seq: Seq, laneId: LaneId, text: string): NormalizedEvent {
  return {
    id: seq,
    podId: BRAVO_ID,
    laneId,
    seq,
    type: 'assistant_text',
    payload: { type: 'assistant_text', text },
    createdAt: '2026-01-01T00:01:00.000Z',
  };
}
