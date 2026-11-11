// @vitest-environment jsdom
/**
 * Which outcome raises which notification: one test per row of the frozen
 * `contracts/action-messages.md` (session 20261111-0156-message-alerting).
 *
 * Every test mounts the whole app through `mountWorkspace`, drives the
 * affordance a user would, and reads the result out of the notification
 * viewport (`contracts/notifications.ts`, DOM guarantees). Each `it` title
 * begins with the row id it checks.
 *
 * THE WORDINGS ARE LOCAL LITERALS, ON PURPOSE. The contract says so, and the
 * reason is the one this file exists for: a test that imports the string it
 * checks agrees with the product whatever the product says, so it cannot
 * detect a wording change. Nothing below imports a message from a product
 * module. Error messages are not wordings at all — each one is the failing
 * stub's own `IpcError.message`, unique to its test, and the assertion is that
 * it arrives verbatim.
 *
 * WHAT IS DELIBERATELY NOT HERE. The contract's "outcomes reported where the
 * user acted" list (create failure, pick-directory failure, delete failure,
 * send, permission respond, Helm, Beachcomber) raises no notification and has
 * no row; `failure-paths.e2e.test.tsx` pins where each of those lands.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { NormalizedEvent, Pod } from '@shared/contracts/events';
import type { IpcError, IpcResult, UpdatePodRequest } from '@shared/contracts/ipc';
// RELATIVE, NOT `@shared/...`. `hygiene.test.ts` (criterion 11) allows a bare
// `@shared/` specifier in this directory only under `@shared/contracts/`, and
// this marker is a runtime value outside it. Importing it rather than copying
// it is the point: R1 must stage the subtype the producer actually writes.
import { STARTUP_RECONCILIATION_SUBTYPE } from '../../../shared/startup-reconciliation-notice';
import { TEST_IDS } from '../contracts/renderer-view';
import { NOTIFICATION_TEST_IDS, type NotificationKind } from '../notifications';
import { PODS_CHROME_TEST_ID } from '../pods/PodsChrome';
import { DELETE_POD_TEST_IDS } from '../pods/DeletePodDialog';
import {
  POD_TAB_DELETE_TEST_ID,
  POD_TAB_FORK_TEST_ID,
  POD_TAB_OPEN_TEST_ID,
  POD_TAB_STOP_TEST_ID,
} from '../pods/PodTab';
import { testId } from '../shell/contract-runtime';
import {
  ipcError,
  makeStubPod,
  stubOrcastrateApi,
  type InvokeChannelKey,
  type StubOrcastrateApi,
} from '../test-utils';

import {
  ALPHA_ID,
  BRAVO_ID,
  MATRIARCH,
  MATRIARCH_ID,
  POD_ALPHA,
  POD_BRAVO,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// Reading the viewport
// ---------------------------------------------------------------------------

/** The message element's role for each kind (`contracts/notifications.ts`). */
function roleFor(kind: NotificationKind): 'alert' | 'status' {
  return kind === 'error' ? 'alert' : 'status';
}

/** Every live item in the viewport, as `kind: message` lines, for a failure message. */
function describeViewport(viewport: HTMLElement): string {
  const items = within(viewport).queryAllByTestId(NOTIFICATION_TEST_IDS.item);
  if (items.length === 0) return 'no items';
  return items
    .map((item) => `${item.getAttribute('data-kind') ?? '?'}: ${JSON.stringify(item.textContent)}`)
    .join('; ');
}

/** The items of one kind whose message element reads exactly `message`. */
function matchingItems(viewport: HTMLElement, kind: NotificationKind, message: string): HTMLElement[] {
  return within(viewport)
    .queryAllByTestId(NOTIFICATION_TEST_IDS.item)
    .filter(
      (item) =>
        item.getAttribute('data-kind') === kind &&
        within(item)
          .queryAllByRole(roleFor(kind))
          .some((element) => element.textContent === message),
    );
}

/**
 * Waits for an item of `kind` INSIDE THE VIEWPORT whose message element — the
 * `role="alert"` one for an error, `role="status"` otherwise — has exactly
 * `message` as its `textContent`. A message rendered anywhere else does not
 * count, which is what makes every test here red until the region is mounted
 * and the action raises into it.
 */
async function expectNotification(kind: NotificationKind, message: string): Promise<HTMLElement> {
  return waitFor(() => {
    const viewport = screen.getByTestId(NOTIFICATION_TEST_IDS.viewport);
    const [item] = matchingItems(viewport, kind, message);
    if (item === undefined) {
      throw new Error(
        `expected a ${kind} notification reading ${JSON.stringify(message)}; the viewport holds ${describeViewport(viewport)}`,
      );
    }
    return item;
  });
}

/** Waits until the viewport (which must exist) holds no error item reading `message`. */
async function expectNoErrorNotification(message: string): Promise<void> {
  await waitFor(() => {
    const viewport = screen.getByTestId(NOTIFICATION_TEST_IDS.viewport);
    expect(matchingItems(viewport, 'error', message), describeViewport(viewport)).toEqual([]);
  });
}

/** The Pod header carries no alert of its own once the viewport carries the error (E1-E6). */
function expectNoAlertInPodHeader(): void {
  expect(within(screen.getByTestId(PODS_CHROME_TEST_ID)).queryAllByRole('alert')).toEqual([]);
}

// ---------------------------------------------------------------------------
// Fixtures and drivers
// ---------------------------------------------------------------------------

/** One running Pod with a Matriarch, so its composer is mounted. */
const RUNNING_BRAVO: Pod = { ...POD_BRAVO, status: 'running' };

/** A closed Pod with a conversation: the one state the Fork control acts in. */
const FORKABLE_ALPHA: Pod = { ...POD_ALPHA, ccSessionId: 'cc-alpha' };

/** What a successful fork of Alpha resolves. Its title is S3's `{title}`. */
const ALPHA_FORK: Pod = makeStubPod({
  id: 'pod-alpha-fork',
  title: 'Alpha (fork)',
  ccSessionId: 'cc-alpha-fork',
  tabOrder: 2,
  status: 'closed',
  forkedFromPodId: ALPHA_ID,
  forkedFromCcSessionId: 'cc-alpha',
});

const BEACHED_ALPHA: Pod = { ...POD_ALPHA, status: 'beached' };

function listing(...pods: Pod[]): { list: () => Promise<IpcResult<Pod[]>> } {
  return { list: async () => ({ ok: true, value: pods }) };
}

/**
 * `pods.update` that answers with the Pod it was asked about, keeping its
 * title, so a reorder does not rename the tabs it moved.
 */
function updateKeeping(...pods: Pod[]): {
  invoke: (req: UpdatePodRequest) => Promise<IpcResult<Pod>>;
  readonly requests: UpdatePodRequest[];
} {
  const requests: UpdatePodRequest[] = [];
  return {
    requests,
    invoke: async (req) => {
      requests.push(req);
      const pod =
        pods.find((candidate) => candidate.id === req.podId) ?? makeStubPod({ id: req.podId });
      return {
        ok: true,
        value: { ...pod, ...(req.tabOrder === undefined ? {} : { tabOrder: req.tabOrder }) },
      };
    },
  };
}

/**
 * A channel whose FIRST call fails with `error` and whose second call stays
 * in flight until `release()`. That second, held call is what lets E2 and E4
 * look at the viewport after the next activation has STARTED but before it
 * has settled — the moment the contract says the standing error is cleared.
 */
interface FailThenHold<T> {
  invoke(): Promise<IpcResult<T>>;
  release(): void;
  readonly calls: number;
}

function failThenHold<T>(error: IpcError, eventual: T): FailThenHold<T> {
  let release: () => void = () => {};
  const held = new Promise<IpcResult<T>>((resolve) => {
    release = () => {
      resolve({ ok: true, value: eventual });
    };
  });
  const channel = {
    calls: 0,
    invoke: async (): Promise<IpcResult<T>> => {
      channel.calls += 1;
      if (channel.calls === 1) return { ok: false, error };
      return held;
    },
    release: () => {
      release();
    },
  };
  return channel;
}

/**
 * The channel was actually called. Without this a test whose drive never
 * reached its action would fail for the wrong reason before the region exists
 * and could pass for the wrong reason after; with it, the red run says the
 * drive landed and only the notification is missing.
 */
async function expectInvoked(api: StubOrcastrateApi, channel: InvokeChannelKey): Promise<void> {
  await waitFor(() => {
    expect(api.calls[channel].length, `${channel} was never invoked`).toBeGreaterThan(0);
  });
}

async function mount(api: StubOrcastrateApi): Promise<UserEvent> {
  const user = userEvent.setup();
  mountWorkspace(api);
  await screen.findByTestId(TEST_IDS.workspace);
  return user;
}

/** Ctrl+ArrowRight on Alpha's focused tab: the keyboard reorder path. */
async function moveAlphaRight(user: UserEvent): Promise<void> {
  await user.click(await screen.findByTestId(testId(TEST_IDS.podTab, ALPHA_ID)));
  await user.keyboard('{Control>}{ArrowRight}{/Control}');
  await flushPendingWork();
}

/** Esc in the active Pod's composer: the interrupt path. */
async function pressEscapeInComposer(user: UserEvent): Promise<void> {
  await user.type(await screen.findByTestId(TEST_IDS.composerInput), '{Escape}');
  await flushPendingWork();
}

// ---------------------------------------------------------------------------
// Table A: a data-altering action succeeds
// ---------------------------------------------------------------------------

describe('a data-altering action that succeeds raises one transient notification', () => {
  it('S1 raises a success notification naming the Pod when createPod resolves ok', async () => {
    const api = stubOrcastrateApi();
    const user = await mount(api);

    await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
    await user.type(screen.getByTestId(TEST_IDS.newPodTitleInput), 'Charlie');
    await user.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await user.click(await screen.findByTestId(TEST_IDS.newPodSubmit));

    await expectInvoked(api, 'podCreate');
    await expectNotification('success', 'Pod created: Charlie');
  });

  it('S2 raises a success notification naming the Pod when deletePod resolves ok without a failed session', async () => {
    const api = stubOrcastrateApi({ pods: listing(POD_ALPHA) });
    const user = await mount(api);

    await user.click(await screen.findByTestId(testId(POD_TAB_DELETE_TEST_ID, ALPHA_ID)));
    const dialog = await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
    await user.click(within(dialog).getByTestId(DELETE_POD_TEST_IDS.confirm));

    await expectInvoked(api, 'podDelete');
    await expectNotification('success', 'Pod deleted: Alpha');
  });

  it('S3 raises a success notification naming the NEW Pod when forkPod resolves ok', async () => {
    let forks = 0;
    const user = await mount(
      stubOrcastrateApi({
        pods: {
          ...listing(FORKABLE_ALPHA),
          fork: async () => {
            forks += 1;
            return { ok: true, value: ALPHA_FORK };
          },
        },
      }),
    );

    await user.click(await screen.findByTestId(testId(POD_TAB_FORK_TEST_ID, ALPHA_ID)));

    expect(forks).toBe(1);
    await expectNotification('success', 'Pod forked: Alpha (fork)');
  });

  it('S4 raises an info notification naming the Pod when openPod resolves ok', async () => {
    let opens = 0;
    const user = await mount(
      stubOrcastrateApi({
        pods: {
          ...listing(POD_ALPHA),
          open: async () => {
            opens += 1;
            return { ok: true, value: { ...POD_ALPHA, status: 'running' } };
          },
        },
      }),
    );

    await user.click(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID)));

    expect(opens).toBe(1);
    await expectNotification('info', 'Pod started: Alpha');
  });

  it('S5 raises an info notification naming the Pod when reconnectPod resolves ok', async () => {
    let reconnects = 0;
    const user = await mount(
      stubOrcastrateApi({
        pods: {
          ...listing(BEACHED_ALPHA),
          reconnect: async () => {
            reconnects += 1;
            return { ok: true, value: { ...POD_ALPHA, status: 'running' } };
          },
        },
      }),
    );

    const control = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID));
    expect(control.getAttribute('data-verb')).toBe('reconnect');
    await user.click(control);

    expect(reconnects).toBe(1);
    await expectNotification('info', 'Pod reconnected: Alpha');
  });

  it('S6 raises an info notification naming the Pod when closePod resolves ok', async () => {
    const api = stubOrcastrateApi({ pods: listing({ ...POD_ALPHA, status: 'running' }) });
    const user = await mount(api);

    await user.click(await screen.findByTestId(testId(POD_TAB_STOP_TEST_ID, ALPHA_ID)));

    await expectInvoked(api, 'podClose');
    await expectNotification('info', 'Pod stopped: Alpha');
  });

  it('S7 raises a success notification when reorderPods resolves ok', async () => {
    const update = updateKeeping(POD_ALPHA, POD_BRAVO);
    const user = await mount(
      stubOrcastrateApi({ pods: { ...listing(POD_ALPHA, POD_BRAVO), update: update.invoke } }),
    );

    await moveAlphaRight(user);

    // One `pods.update` per Pod: the whole order was committed.
    expect(update.requests).toEqual([
      { podId: BRAVO_ID, tabOrder: 0 },
      { podId: ALPHA_ID, tabOrder: 1 },
    ]);
    await expectNotification('success', 'Pod order saved');
  });

  it('S8 raises an info notification when interruptPod resolves ok', async () => {
    const api = stubOrcastrateApi({
      pods: listing(RUNNING_BRAVO),
      lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
    });
    const user = await mount(api);

    await pressEscapeInComposer(user);

    await expectInvoked(api, 'podInterrupt');
    expect(api.calls.podInterrupt).toEqual([[BRAVO_ID]]);
    await expectNotification('info', 'Interrupt sent');
  });
});

// ---------------------------------------------------------------------------
// Table B: an unrecoverable failure
// ---------------------------------------------------------------------------

describe('an unrecoverable failure raises an error notification carrying main\'s message verbatim', () => {
  it('E1 raises the pods.list failure in the viewport and leaves no alert in the Pod header', async () => {
    const message = 'E1: the Pod list could not be read';
    const api = stubOrcastrateApi();
    api.failInvoke('podList', ipcError('IO', message));
    await mount(api);

    await expectInvoked(api, 'podList');
    await expectNotification('error', message);
    expectNoAlertInPodHeader();
  });

  it('E2 raises the openPod failure in the viewport, leaves no alert in the Pod header, and clears it once the next run-control activation starts', async () => {
    const message = 'E2: the CLI would not start';
    const open = failThenHold<Pod>(ipcError('SPAWN_FAILED', message), {
      ...POD_ALPHA,
      status: 'running',
    });
    const user = await mount(
      stubOrcastrateApi({ pods: { ...listing(POD_ALPHA), open: open.invoke } }),
    );

    const control = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID));
    await user.click(control);
    await expectNotification('error', message);
    expectNoAlertInPodHeader();

    // The next activation starts and is held in flight: the standing error
    // must already be gone, before anything has settled.
    await user.click(screen.getByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID)));
    expect(open.calls).toBe(2);
    await expectNoErrorNotification(message);

    open.release();
    await flushPendingWork();
  });

  it('E3 raises the reconnectPod failure in the viewport and leaves no alert in the Pod header', async () => {
    const message = 'E3: the session could not be resumed';
    const api = stubOrcastrateApi({ pods: listing(BEACHED_ALPHA) });
    api.failInvoke('podReconnect', ipcError('SPAWN_FAILED', message));
    const user = await mount(api);

    const control = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID));
    expect(control.getAttribute('data-verb')).toBe('reconnect');
    await user.click(control);

    await expectInvoked(api, 'podReconnect');
    await expectNotification('error', message);
    expectNoAlertInPodHeader();
  });

  it('E4 raises the forkPod failure in the viewport, leaves no alert in the Pod header, and clears it once the next Fork activation starts', async () => {
    const message = 'E4: the session could not be forked';
    const fork = failThenHold<Pod>(ipcError('IO', message), ALPHA_FORK);
    const user = await mount(
      stubOrcastrateApi({ pods: { ...listing(FORKABLE_ALPHA), fork: fork.invoke } }),
    );

    await user.click(await screen.findByTestId(testId(POD_TAB_FORK_TEST_ID, ALPHA_ID)));
    await expectNotification('error', message);
    expectNoAlertInPodHeader();

    await user.click(screen.getByTestId(testId(POD_TAB_FORK_TEST_ID, ALPHA_ID)));
    expect(fork.calls).toBe(2);
    await expectNoErrorNotification(message);

    fork.release();
    await flushPendingWork();
  });

  it('E5 raises the reorderPods failure in the viewport and leaves no alert in the Pod header', async () => {
    const message = 'E5: the new order could not be saved';
    const api = stubOrcastrateApi({ pods: listing(POD_ALPHA, POD_BRAVO) });
    api.failInvoke('podUpdate', ipcError('IO', message));
    const user = await mount(api);

    await moveAlphaRight(user);

    await expectInvoked(api, 'podUpdate');
    await expectNotification('error', message);
    expectNoAlertInPodHeader();
  });

  it('E6 raises the closePod failure in the viewport and leaves no alert in the Pod header', async () => {
    const message = 'E6: the Pod would not stop';
    const api = stubOrcastrateApi({ pods: listing({ ...POD_ALPHA, status: 'running' }) });
    api.failInvoke('podClose', ipcError('IO', message));
    const user = await mount(api);

    await user.click(await screen.findByTestId(testId(POD_TAB_STOP_TEST_ID, ALPHA_ID)));

    await expectInvoked(api, 'podClose');
    await expectNotification('error', message);
    expectNoAlertInPodHeader();
  });

  it('E7 raises the interruptPod failure in the viewport', async () => {
    const message = 'E7: the interrupt never reached the Pod';
    const api = stubOrcastrateApi({
      pods: listing(RUNNING_BRAVO),
      lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
    });
    api.failInvoke('podInterrupt', ipcError('NOT_RUNNING', message));
    const user = await mount(api);

    await pressEscapeInComposer(user);

    await expectInvoked(api, 'podInterrupt');
    await expectNotification('error', message);
  });

  it('E8 raises the active Pod\'s lanes.list failure in the viewport', async () => {
    const message = 'E8: the lane registry could not be read';
    const api = stubOrcastrateApi({ pods: listing(POD_BRAVO) });
    api.failInvoke('laneList', ipcError('IO', message));
    await mount(api);

    await expectInvoked(api, 'laneList');
    await expectNotification('error', message);
  });

  it('E9 raises the active Pod\'s events.read backfill failure in the viewport', async () => {
    const message = 'E9: the transcript could not be read';
    const api = stubOrcastrateApi({
      pods: listing(POD_BRAVO),
      lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
    });
    api.failInvoke('eventsRead', ipcError('IO', message));
    await mount(api);

    await expectInvoked(api, 'eventsRead');
    await expectNotification('error', message);
  });

  it('E10 raises the app.routingMode failure in the viewport', async () => {
    const message = 'E10: the routing mode could not be read';
    const api = stubOrcastrateApi({ pods: listing(POD_BRAVO) });
    api.failInvoke('appRoutingMode', ipcError('INTERNAL', message));
    await mount(api);

    await expectInvoked(api, 'appRoutingMode');
    await expectNotification('error', message);
  });
});

// ---------------------------------------------------------------------------
// Table C: what stays quiet
// ---------------------------------------------------------------------------

/** The reconciliation notice as the boot sweep writes it, on Bravo's Matriarch. */
const RECONCILIATION_SEQ = 7;

const RECONCILIATION_EVENT: NormalizedEvent = {
  id: RECONCILIATION_SEQ,
  podId: BRAVO_ID,
  laneId: MATRIARCH_ID,
  seq: RECONCILIATION_SEQ,
  type: 'system',
  payload: {
    type: 'system',
    subtype: STARTUP_RECONCILIATION_SUBTYPE,
    data: {
      subtypeMarker: STARTUP_RECONCILIATION_SUBTYPE,
      reason:
        'Orcastrate restarted while this Pod was still open. No Claude Code process ' +
        'survives an application restart, so lanes left running were marked ' +
        'Orphaned. Press Open to start this Pod again.',
      statusBefore: 'running',
      statusAfter: 'closed',
      orphanedLaneIds: [MATRIARCH_ID],
      at: '2026-01-02T00:00:00.000Z',
    },
  },
  createdAt: '2026-01-02T00:00:00.000Z',
};

describe('what stays quiet', () => {
  it('R1 raises no notification for a backfill carrying the startup-reconciliation notice', async () => {
    const api = stubOrcastrateApi({
      pods: listing(POD_BRAVO),
      lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
      events: {
        read: async () => ({ ok: true, value: { events: [RECONCILIATION_EVENT], hasMore: false } }),
      },
    });
    await mount(api);

    // The notice reached the transcript: the quiet case is a rendered row, not
    // a backfill that never landed.
    const primary = await screen.findByTestId(TEST_IDS.transcriptPrimary);
    await within(primary).findByTestId(
      testId(TEST_IDS.transcriptEvent, String(RECONCILIATION_SEQ)),
    );
    await flushPendingWork();

    // `getByTestId` throws when the region is absent, so this cannot pass on
    // an app that never mounted the viewport.
    const viewport = screen.getByTestId('notification-viewport');
    expect(within(viewport).queryAllByTestId(NOTIFICATION_TEST_IDS.item)).toEqual([]);
  });
});
