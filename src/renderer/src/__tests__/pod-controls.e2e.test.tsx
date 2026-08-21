// @vitest-environment jsdom
/**
 * THE POD TAB'S TWO CONTROLS, AND THE TWO INVOKE CHANNELS THAT NOW HAVE A
 * CALLER (`contracts/pod-deletion.ts`, `contracts/pod-verbs.ts`).
 *
 * Three claims, driven through the assembled app against the stub bridge:
 *
 *   1. DELETING A STOPPED POD REMOVES IT, END TO END. The red control on a
 *      stopped Pod's tab opens the confirmation; confirming with the session
 *      box ticked sends `{ deleteSession: true }` over the bridge and the tab
 *      leaves the bar. The SAME test asserts the control is ABSENT on an
 *      opened Pod's tab and that a second Pod's tab survives — a delete that
 *      takes the wrong tab is the failure this dialog exists to prevent.
 *   2. `pods.delete` AND `pods.reconnect` ARE REACHABLE FROM RENDERED UI. The
 *      backlog's standing claim that both are invoke channels with no
 *      affordance calling them is falsified here, by driving each one from a
 *      button a user can see.
 *   3. CREATE IS A TWO-STEP FLOW. Creating a Pod records `pods.create` and no
 *      `pods.open`; the tab it produces carries a working play control named
 *      "Open <title>", and clicking that control records `pods.open`. BOTH
 *      HALVES IN ONE TEST, so the flow is proved to end somewhere usable
 *      rather than merely proved to stop.
 *
 * Every assertion is on `api.calls.*` — the IPC the actions issue — or on a
 * rendered `data-testid`. Nothing here spies on a component prop.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Pod } from '@shared/contracts/events';
import { TEST_IDS } from '../contracts/renderer-view';
import { DELETE_POD_TEST_IDS } from '../pods/DeletePodDialog';
import {
  POD_TAB_DELETE_TEST_ID,
  POD_TAB_OPEN_TEST_ID,
  POD_TAB_STOP_TEST_ID,
} from '../pods/PodTab';
import { testId } from '../shell/contract-runtime';
import {
  makeStubPod,
  stubOrcastrateApi,
  type InvokeChannelKey,
  type StubOrcastrateApi,
} from '../test-utils';

import { installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * The Pod that survives. `'running'` means main holds a live process for it,
 * so `opened` is true, the run control is in its STOP mode, and there is no
 * delete control on its tab at all.
 */
const KEEP: Pod = makeStubPod({ id: 'pod-keep', title: 'Keep', tabOrder: 0, status: 'running' });

/**
 * The Pod that gets deleted. Stopped, and it reached its first turn — so
 * `ccSessionId` is non-null and the confirmation offers the session checkbox.
 */
const GONE: Pod = makeStubPod({
  id: 'pod-gone',
  title: 'Gone',
  tabOrder: 1,
  status: 'closed',
  ccSessionId: 'cc-session-gone',
});

/** A Pod whose process stopped WITH a recorded cause: the Reconnect branch. */
const BEACHED: Pod = makeStubPod({
  id: 'pod-beached',
  title: 'Beached',
  tabOrder: 2,
  status: 'beached',
});

function podApi(pods: Pod[]): StubOrcastrateApi {
  return stubOrcastrateApi({ pods: { list: async () => ({ ok: true, value: pods }) } });
}

const podTab = (podId: string): string => testId(TEST_IDS.podTab, podId);
const deleteControl = (podId: string): string => testId(POD_TAB_DELETE_TEST_ID, podId);
const runControl = (podId: string): string => testId(POD_TAB_OPEN_TEST_ID, podId);
const stopControl = (podId: string): string => testId(POD_TAB_STOP_TEST_ID, podId);

// ---------------------------------------------------------------------------
// 1. Deleting a stopped Pod
// ---------------------------------------------------------------------------

describe('deleting a stopped Pod from its tab', () => {
  it('confirms with the session box ticked, sends deleteSession true, and removes only that tab', async () => {
    const user = userEvent.setup();
    const api = podApi([KEEP, GONE]);
    mountWorkspace(api);

    await screen.findByTestId(podTab(GONE.id));

    /*
     * THE TWO-CONTROL SPLIT, PROVED END TO END rather than only in the unit
     * suite. The opened Pod offers stop and NO delete — absent, not disabled,
     * because a Pod with a live process must not be one click from deletion.
     * The stopped Pod offers run and delete, and offers no stop at all.
     */
    expect(screen.getByTestId(stopControl(KEEP.id))).toBeDefined();
    expect(screen.queryByTestId(deleteControl(KEEP.id))).toBeNull();
    expect(screen.queryByTestId(runControl(KEEP.id))).toBeNull();

    expect(screen.getByTestId(runControl(GONE.id))).toBeDefined();
    expect(screen.queryByTestId(stopControl(GONE.id))).toBeNull();

    const red = screen.getByTestId(deleteControl(GONE.id));
    expect(red.getAttribute('aria-label')).toBe(`Delete ${GONE.title}`);
    await user.click(red);

    // Nothing is deleted by opening the confirmation.
    const dialog = await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
    expect(api.calls.podDelete).toEqual([]);
    // The Pod's title, so a mis-click on the wrong tab is visible.
    expect(within(dialog).getByText(GONE.title)).toBeDefined();

    const box = within(dialog).getByTestId(DELETE_POD_TEST_IDS.session) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await user.click(box);
    await user.click(within(dialog).getByTestId(DELETE_POD_TEST_IDS.confirm));

    // The REQUEST OBJECT is asserted, not merely that a delete happened: a
    // second positional boolean is exactly what the contract replaced.
    await waitFor(() => {
      expect(api.calls.podDelete).toEqual([[{ podId: GONE.id, deleteSession: true }]]);
    });

    await waitFor(() => {
      expect(screen.queryByTestId(podTab(GONE.id))).toBeNull();
    });
    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
    // The other Pod is untouched — the failure this dialog exists to prevent.
    expect(screen.getByTestId(podTab(KEEP.id))).toBeDefined();
    expect(screen.getByTestId(stopControl(KEEP.id))).toBeDefined();
  });

  it('leaves the checkbox off by default, so an unticked confirm sends deleteSession false', async () => {
    const user = userEvent.setup();
    const api = podApi([KEEP, GONE]);
    mountWorkspace(api);

    await user.click(await screen.findByTestId(deleteControl(GONE.id)));
    const dialog = await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
    await user.click(within(dialog).getByTestId(DELETE_POD_TEST_IDS.confirm));

    await waitFor(() => {
      expect(api.calls.podDelete).toEqual([[{ podId: GONE.id, deleteSession: false }]]);
    });
  });

  it('offers no session checkbox for a Pod that never reached its first turn', async () => {
    const user = userEvent.setup();
    const never = makeStubPod({ id: 'pod-fresh', title: 'Fresh', status: 'closed', ccSessionId: null });
    const api = podApi([never]);
    mountWorkspace(api);

    await user.click(await screen.findByTestId(deleteControl(never.id)));
    const dialog = await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
    // ABSENT, not disabled: there is nothing on disk, and an unchecked box
    // implying otherwise is a lie about state.
    expect(within(dialog).queryByTestId(DELETE_POD_TEST_IDS.session)).toBeNull();
  });

  it('cancels without sending anything and leaves the tab in place', async () => {
    const user = userEvent.setup();
    const api = podApi([KEEP, GONE]);
    mountWorkspace(api);

    await user.click(await screen.findByTestId(deleteControl(GONE.id)));
    const dialog = await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
    await user.click(within(dialog).getByTestId(DELETE_POD_TEST_IDS.cancel));

    expect(api.calls.podDelete).toEqual([]);
    expect(screen.getByTestId(podTab(GONE.id))).toBeDefined();
    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. The invoke channels the backlog said nothing called
// ---------------------------------------------------------------------------

/**
 * THE BACKLOG'S STANDING CLAIM, FALSIFIED BY EXPERIMENT.
 *
 * Four invoke channels were recorded as having no affordance calling them:
 * `podUpdate`, `podDelete`, `podSetPermissionMode` and `podReconnect`. Two of
 * the four now have one, and this table names WHICH affordance reaches each —
 * so a later reader does not have to trust the sentence above.
 *
 * The drive for each is a real click on a rendered control, reached by the
 * control's own test id. A drive that merely called the action would prove
 * nothing about reachability, which is the entire question.
 */
interface Affordance {
  channel: InvokeChannelKey;
  /** Where a user finds it, in the terms the UI presents. */
  affordance: string;
  drive(user: UserEvent): Promise<void>;
}

const CLOSED_CHANNELS: readonly Affordance[] = [
  {
    channel: 'podDelete',
    affordance: "the stopped Pod tab's red delete control, then the confirmation's Delete",
    async drive(user) {
      await user.click(await screen.findByTestId(deleteControl(GONE.id)));
      const dialog = await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
      await user.click(within(dialog).getByTestId(DELETE_POD_TEST_IDS.confirm));
    },
  },
  {
    channel: 'podReconnect',
    affordance: "the beached Pod tab's run control",
    async drive(user) {
      await user.click(await screen.findByTestId(runControl(BEACHED.id)));
    },
  },
];

describe('the invoke channels with no affordance', () => {
  it('names exactly the two that gained one, and no channel twice', () => {
    // Vacuity guards. An empty or duplicated table would make the walk below
    // trivially green.
    expect(CLOSED_CHANNELS).toHaveLength(2);
    expect(CLOSED_CHANNELS.map((entry) => entry.channel)).toEqual(['podDelete', 'podReconnect']);
    for (const entry of CLOSED_CHANNELS) {
      expect(entry.affordance.length, entry.channel).toBeGreaterThan(10);
    }
  });

  it.each(CLOSED_CHANNELS)(
    'reaches $channel from rendered UI, via $affordance',
    async ({ channel, drive }) => {
      const user = userEvent.setup();
      const api = podApi([KEEP, GONE, BEACHED]);
      mountWorkspace(api);

      await screen.findByTestId(podTab(GONE.id));
      // Not yet: the affordance has to be the thing that does it.
      expect(api.calls[channel]).toEqual([]);

      await drive(user);

      await waitFor(() => {
        expect(api.calls[channel].length, `${channel} was never invoked`).toBe(1);
      });
    },
  );

  it('routes the beached Pod to reconnect and the stopped one to open, from the same list reply', async () => {
    const user = userEvent.setup();
    const api = podApi([KEEP, GONE, BEACHED]);
    mountWorkspace(api);

    // Two not-open Pods in ONE reply, so neither verb can come from a constant.
    const beached = await screen.findByTestId(runControl(BEACHED.id));
    const stopped = screen.getByTestId(runControl(GONE.id));
    expect(beached.getAttribute('data-verb')).toBe('reconnect');
    expect(stopped.getAttribute('data-verb')).toBe('open');

    await user.click(beached);
    await waitFor(() => {
      expect(api.calls.podReconnect).toEqual([[BEACHED.id]]);
    });
    expect(api.calls.podOpen).toEqual([]);

    await user.click(stopped);
    await waitFor(() => {
      expect(api.calls.podOpen).toEqual([[GONE.id]]);
    });
    expect(api.calls.podReconnect).toEqual([[BEACHED.id]]);
  });
});

// ---------------------------------------------------------------------------
// 3. Create, then Open
// ---------------------------------------------------------------------------

const CREATED_ID = 'pod-charlie';

/**
 * A main process that answers with the row it actually persisted: born
 * `'closed'`, exactly as `sqlite-event-store.ts` creates it. The default stub's
 * `create` would hand back the DEFAULT id, which would let the second half of
 * the test below pass against a Pod nobody created.
 */
interface CreatingWorld {
  api: StubOrcastrateApi;
  /**
   * Every `pods.create` request, recorded here rather than read from
   * `api.calls.podCreate`: an explicit `overrides` entry replaces a channel
   * WHOLESALE, call recording included, so the stub's own counter would stay
   * at zero and "no open was made" would be provable while "a create was
   * made" was not.
   */
  createRequests: unknown[];
  /** Every `pods.open` request, recorded for the same reason. */
  openRequests: string[];
}

function creatingApi(): CreatingWorld {
  let created: Pod | null = null;
  const createRequests: unknown[] = [];
  const openRequests: string[] = [];
  const api = stubOrcastrateApi({
    pods: {
      list: async () => ({ ok: true, value: created === null ? [] : [created] }),
      create: async (req) => {
        createRequests.push(req);
        created = makeStubPod({
          id: CREATED_ID,
          title: req.title,
          cwd: req.cwd,
          permissionMode: req.permissionMode,
          status: 'closed',
        });
        return { ok: true, value: created };
      },
      open: async (podId) => {
        openRequests.push(podId);
        return {
        ok: true,
        value:
          created !== null && created.id === podId
            ? { ...created, status: 'running' }
            : makeStubPod({ id: podId, status: 'running' }),
        };
      },
    },
  });
  return { api, createRequests, openRequests };
}

describe('creating a Pod', () => {
  it('records pods.create and no pods.open, then opens from the tab’s own play control', async () => {
    const user = userEvent.setup();
    const { api, createRequests, openRequests } = creatingApi();
    mountWorkspace(api);

    await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
    await user.type(screen.getByTestId(TEST_IDS.newPodTitleInput), 'Charlie');
    await user.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await user.click(screen.getByTestId(TEST_IDS.newPodSubmit));

    // HALF ONE: the row exists and NOTHING started. This is the whole of
    // item 7, and it is observable exactly here.
    const tab = await screen.findByTestId(podTab(CREATED_ID));
    expect(createRequests).toHaveLength(1);
    expect(openRequests).toEqual([]);
    expect(screen.queryByTestId(TEST_IDS.newPodDialog)).toBeNull();
    expect(tab.getAttribute('aria-current')).toBe('true');

    // The composer's not-opened sentence is the onboarding line for a freshly
    // created Pod, and it renders without the user clicking anything.
    expect(screen.getByTestId('composer-disabled-note').textContent).toContain(
      'This Pod is not running. Open it before sending a message.',
    );

    // HALF TWO: the way forward is on the tab that just appeared — a play
    // glyph whose NAME says which verb it will perform.
    const run = screen.getByTestId(runControl(CREATED_ID));
    expect(run.tagName).toBe('BUTTON');
    expect(run.getAttribute('aria-label')).toBe('Open Charlie');
    expect(run.getAttribute('data-verb')).toBe('open');
    expect(within(run).getByText('▶').getAttribute('data-icon')).toBe('play');

    await user.click(run);

    await waitFor(() => {
      expect(openRequests).toEqual([CREATED_ID]);
    });
    // ...and the flow ends somewhere usable: the composer is live.
    await waitFor(() => {
      expect(screen.queryByTestId('composer-disabled-note')).toBeNull();
    });
    expect(screen.getByTestId(TEST_IDS.composerSend).hasAttribute('disabled')).toBe(false);
  });
});
