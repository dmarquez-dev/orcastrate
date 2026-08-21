// @vitest-environment jsdom
/**
 * The end-to-end path through the assembled workspace (acceptance criteria 2,
 * 3 and 10).
 *
 * Everything here mounts `main.tsx`'s tree — `<StrictMode><WorkspaceProvider>
 * <App/></WorkspaceProvider></StrictMode>` — against `stubOrcastrateApi`, and
 * drives it only through `TEST_IDS`, roles, and user-visible text. Nothing
 * reads a component's internal state and nothing imports a non-exported
 * symbol.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Unsubscribe } from '@shared/contracts/ipc';
import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import {
  ALPHA_ID,
  BRAVO_ID,
  CALF_EARLY,
  CALF_EARLY_ID,
  CALF_LATE,
  EXPECTED_RAIL_ORDER,
  MATRIARCH,
  MATRIARCH_ID,
  POD_ALPHA,
  POD_BRAVO,
  assistantEvent,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from './harness';

// `mountWorkspace` passes `{ provider: AppRoot }` on every call, so the
// module-level seam is deliberately left unregistered: nothing in this suite
// may fall back to a stand-in provider.
installUnhandledRejectionGuard();

/** Two Pods on the bar, no lanes and no events until a push delivers them. */
function twoPodApi(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_ALPHA, POD_BRAVO] }) },
  });
}

/** The lane ids the rail is currently showing, in DOM order. */
function railOrder(): string[] {
  // Anchored on the colon: `lane-row-unread`, `lane-row-steer` and the row's
  // inner `lane-row-select:<id>` all share the prefix and are NOT rows.
  return screen
    .getAllByTestId(/^lane-row:/)
    .map((row) => row.getAttribute('data-testid')?.slice('lane-row:'.length) ?? '');
}

describe('the assembled workspace', () => {
  it('mounts every region of spec 5.1 from one mount of the app, not from its parts', async () => {
    const api = twoPodApi();
    mountWorkspace(api);

    // The Pod bar and the shell frame arrive together with the panes: this is
    // one tree, mounted once.
    expect(await screen.findByTestId(TEST_IDS.workspace)).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.podBar)).toBeDefined();
    expect(await screen.findByTestId(TEST_IDS.laneRail)).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.transcriptPrimary)).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.composer)).toBeDefined();
  });

  it('switches Pod, then lists the pushed lanes in the guaranteed order and the pushed events in seq order', async () => {
    const user = userEvent.setup();
    const api = twoPodApi();
    mountWorkspace(api);

    // The first list activates the leftmost Pod.
    const alphaTab = await screen.findByTestId(testId(TEST_IDS.podTab, ALPHA_ID));
    expect(alphaTab.getAttribute('aria-current')).toBe('true');

    await user.click(screen.getByTestId(testId(TEST_IDS.podTab, BRAVO_ID)));
    expect(screen.getByTestId(testId(TEST_IDS.podTab, BRAVO_ID)).getAttribute('aria-current')).toBe(
      'true',
    );

    // Bravo's `lanes.list` answered with nothing, so the rail is empty BEFORE
    // the push. Without this the next assertion could pass on a rail that was
    // never driven by `laneChanged` at all.
    await screen.findByTestId(TEST_IDS.laneRail);
    await flushPendingWork();
    expect(screen.queryAllByTestId(/^lane-row:/)).toEqual([]);
    expect(screen.getByText('No lanes yet.')).toBeDefined();

    // A Matriarch and two Calves, pushed in the WRONG order on purpose: the
    // rail must pin the Matriarch to index 0 and sort the Calves by startedAt.
    act(() => {
      api.emit.laneChanged({ podId: BRAVO_ID, lanes: [CALF_LATE, MATRIARCH, CALF_EARLY] });
    });

    expect(railOrder()).toEqual([...EXPECTED_RAIL_ORDER]);

    // Three events, two of them for the selected (Matriarch) lane and pushed
    // with the higher `seq` FIRST, plus one for a Calf that must not leak into
    // the Matriarch's pane.
    act(() => {
      api.emit.podEvent({
        podId: BRAVO_ID,
        events: [
          assistantEvent(2, MATRIARCH_ID, 'second thing'),
          assistantEvent(1, MATRIARCH_ID, 'first thing'),
          assistantEvent(3, CALF_EARLY_ID, 'calf thing'),
        ],
      });
    });

    const primary = screen.getByTestId(TEST_IDS.transcriptPrimary);
    const rendered = within(primary)
      .getAllByTestId(/^transcript-event:/)
      .map((item) => item.getAttribute('data-testid'));
    expect(rendered).toEqual([
      testId(TEST_IDS.transcriptEvent, '1'),
      testId(TEST_IDS.transcriptEvent, '2'),
    ]);

    // ...and in the reader's terms, not just by id.
    const texts = within(primary)
      .getAllByTestId(/^transcript-event:/)
      .map((item) => item.textContent ?? '');
    expect(texts[0]).toContain('first thing');
    expect(texts[1]).toContain('second thing');
    expect(within(primary).queryByText('calf thing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unmount cleanliness (criterion 10)
// ---------------------------------------------------------------------------

interface UnsubRecord {
  channel: string;
  calls: number;
}

/**
 * A stub whose five `on.*` methods delegate to a second stub and wrap the
 * `Unsubscribe` they hand back, so the suite can count how many times each one
 * was called. `base` owns the listener sets, so `base.listenerCount` and
 * `base.emit` are the live view; the app only ever sees `api`.
 */
function trackedApi(): {
  api: StubOrcastrateApi;
  base: StubOrcastrateApi;
  handed: UnsubRecord[];
} {
  const base = stubOrcastrateApi();
  const handed: UnsubRecord[] = [];

  const track = (channel: string, unsubscribe: Unsubscribe): Unsubscribe => {
    const record: UnsubRecord = { channel, calls: 0 };
    handed.push(record);
    return () => {
      record.calls += 1;
      unsubscribe();
    };
  };

  const api = stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_ALPHA] }) },
    on: {
      podEvent: (cb) => track('podEvent', base.on.podEvent(cb)),
      podStatus: (cb) => track('podStatus', base.on.podStatus(cb)),
      laneChanged: (cb) => track('laneChanged', base.on.laneChanged(cb)),
      permissionRequested: (cb) => track('permissionRequested', base.on.permissionRequested(cb)),
      permissionResolved: (cb) => track('permissionResolved', base.on.permissionResolved(cb)),
    },
  });

  return { api, base, handed };
}

describe('unmounting the workspace', () => {
  it('calls every Unsubscribe the stub handed out exactly once, and a later push changes nothing', async () => {
    const { api, base, handed } = trackedApi();
    const { unmount } = mountWorkspace(api);

    await screen.findByTestId(TEST_IDS.laneRail);

    // Subscribed once per channel while mounted — StrictMode's remount does
    // not leave a second live listener behind.
    for (const channel of [
      'podEvent',
      'podStatus',
      'laneChanged',
      'permissionRequested',
      'permissionResolved',
    ] as const) {
      expect(base.listenerCount(channel), `${channel} while mounted`).toBe(1);
    }

    unmount();

    expect(handed.length).toBeGreaterThanOrEqual(5);
    expect(handed.filter((record) => record.calls !== 1)).toEqual([]);
    for (const channel of [
      'podEvent',
      'podStatus',
      'laneChanged',
      'permissionRequested',
      'permissionResolved',
    ] as const) {
      expect(base.listenerCount(channel), `${channel} after unmount`).toBe(0);
    }

    // A push after unmount: no throw, nothing rendered, nothing to update.
    expect(() => {
      base.emit.laneChanged({ podId: ALPHA_ID, lanes: [MATRIARCH] });
      base.emit.podEvent({
        podId: ALPHA_ID,
        events: [assistantEvent(9, MATRIARCH_ID, 'after unmount')],
      });
      base.emit.permissionResolved({ podId: ALPHA_ID, requestId: 'gone', outcome: 'aborted' });
    }).not.toThrow();

    await flushPendingWork();
    expect(screen.queryByTestId(TEST_IDS.workspace)).toBeNull();
    expect(screen.queryByText('after unmount')).toBeNull();
  });
});
