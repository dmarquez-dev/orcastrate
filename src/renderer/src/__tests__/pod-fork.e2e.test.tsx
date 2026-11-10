// @vitest-environment jsdom
/**
 * The Fork control and a fork's ancestry, through the assembled app: the real
 * `WorkspaceProvider`, the real state layer, and a stub preload bridge.
 *
 * Every "no `pods.fork` call" below is read off the stub's own call record
 * (`api.calls.podFork`) or a recording override, never off a component
 * callback — the question is whether the CHANNEL was reached.
 */

import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { Pod, PodId, PodStatus } from '@shared/contracts/events';
import type { IpcResult } from '@shared/contracts/ipc';
import { App } from '../App';
import type { WorkspaceActions } from '../contracts/renderer-state';
import { TEST_IDS } from '../contracts/renderer-view';
import { PODS_CHROME_TEST_ID } from '../pods/PodsChrome';
import { POD_TAB_FORK_TEST_ID, POD_TAB_OPEN_TEST_ID } from '../pods/PodTab';
import { renderedPodIds } from '../pods/test-fixtures';
import { testId } from '../shell/contract-runtime';
import { useWorkspaceActions } from '../state';
import {
  ipcError,
  makeStubPod,
  renderWithWorkspace,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils';

import { AppRoot, flushPendingWork, installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

/**
 * The five statuses of `POD_STATUSES` (`src/main/store/schema.ts`), restated:
 * the renderer cannot import from `src/main`. The two type-level checks below
 * make the list exhaustive over `PodStatus` and admit nothing outside it, so a
 * status added to the union fails the typecheck here instead of going
 * untested.
 */
const STATUSES = ['idle', 'running', 'waiting', 'closed', 'beached'] as const satisfies readonly PodStatus[];
type UncoveredStatus = Exclude<PodStatus, (typeof STATUSES)[number]>;
const EVERY_STATUS_COVERED: [UncoveredStatus] extends [never] ? true : false = true;
void EVERY_STATUS_COVERED;

const ALPHA: PodId = 'pod-alpha';
const BRAVO: PodId = 'pod-bravo';
const FORK: PodId = 'pod-alpha-fork';

/** Closed, with a conversation: the eligible case. */
const ALPHA_POD = makeStubPod({
  id: ALPHA,
  title: 'Alpha',
  tabOrder: 0,
  status: 'closed',
  ccSessionId: 'cc-alpha',
});
const BRAVO_POD = makeStubPod({
  id: BRAVO,
  title: 'Bravo',
  tabOrder: 1,
  status: 'closed',
  ccSessionId: 'cc-bravo',
});

/** What main resolves for a fork of Alpha: closed, last in tab order, ancestry set. */
const FORK_POD = makeStubPod({
  id: FORK,
  title: 'Alpha (fork)',
  tabOrder: 2,
  status: 'closed',
  ccSessionId: 'cc-alpha-fork',
  forkedFromPodId: ALPHA,
  forkedFromCcSessionId: 'cc-alpha',
});

function listing(pods: Pod[]): Partial<StubOrcastrateApi['pods']> {
  return { list: async () => ({ ok: true, value: pods }) };
}

/**
 * A stub whose `pods.fork` resolves `FORK_POD` and records each call. An
 * override replaces the default channel's own recording, so this keeps its
 * own.
 */
function forkingApi(pods: Pod[]): { api: StubOrcastrateApi; forkCalls: PodId[] } {
  const forkCalls: PodId[] = [];
  const api = stubOrcastrateApi({
    pods: {
      ...listing(pods),
      fork: async (podId: PodId): Promise<IpcResult<Pod>> => {
        forkCalls.push(podId);
        return { ok: true, value: FORK_POD };
      },
    },
  });
  return { api, forkCalls };
}

function forkControl(podId: PodId): HTMLElement {
  return screen.getByTestId(testId(POD_TAB_FORK_TEST_ID, podId));
}

function podTab(podId: PodId): HTMLElement {
  return screen.getByTestId(testId(TEST_IDS.podTab, podId));
}

/** The accessible description, read through `aria-describedby` as AT reads it. */
function descriptionOf(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id !== '')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

async function mountWith(api: StubOrcastrateApi): Promise<void> {
  mountWorkspace(api);
  await screen.findByTestId(TEST_IDS.workspace);
  await flushPendingWork();
}

// ---------------------------------------------------------------------------
// Criterion 5 — the control is on every tab
// ---------------------------------------------------------------------------

describe('every Pod tab carries a Fork control', () => {
  it.each(STATUSES)('renders a control named "Fork Alpha" on a %s Pod', async (status) => {
    const api = stubOrcastrateApi({
      pods: listing([makeStubPod({ id: ALPHA, title: 'Alpha', status, ccSessionId: 'cc-alpha' })]),
    });
    await mountWith(api);

    // Present-first, by NAME — the accessible name is the criterion.
    const control = screen.getByRole('button', { name: 'Fork Alpha' });
    expect(control).toBe(forkControl(ALPHA));
  });
});

// ---------------------------------------------------------------------------
// Criteria 6-9, 14 — forking an eligible Pod
// ---------------------------------------------------------------------------

describe('forking a closed Pod that has a conversation', () => {
  it('calls pods.fork exactly once, with that Pod id', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({ pods: listing([ALPHA_POD, BRAVO_POD]) });
    await mountWith(api);

    await user.click(forkControl(ALPHA));
    await flushPendingWork();

    expect(api.calls.podFork).toEqual([[ALPHA]]);
  });

  it('renders the new Pod tab in the last position of the Pod bar', async () => {
    const user = userEvent.setup();
    const { api } = forkingApi([ALPHA_POD, BRAVO_POD]);
    await mountWith(api);
    expect(renderedPodIds(screen.getByTestId(TEST_IDS.podBar))).toEqual([ALPHA, BRAVO]);

    await user.click(forkControl(ALPHA));
    await screen.findByTestId(testId(TEST_IDS.podTab, FORK));

    expect(renderedPodIds(screen.getByTestId(TEST_IDS.podBar))).toEqual([ALPHA, BRAVO, FORK]);
  });

  it('makes the new Pod tab the active tab', async () => {
    const user = userEvent.setup();
    const { api } = forkingApi([ALPHA_POD, BRAVO_POD]);
    await mountWith(api);
    // The first listed Pod is active at startup, so the parent starts active
    // and the assertion below is a move, not a coincidence.
    expect(podTab(ALPHA).getAttribute('aria-current')).toBe('true');

    await user.click(forkControl(ALPHA));
    await screen.findByTestId(testId(TEST_IDS.podTab, FORK));
    await flushPendingWork();

    expect(podTab(FORK).getAttribute('aria-current')).toBe('true');
    expect(podTab(ALPHA).getAttribute('aria-current')).toBeNull();
  });

  it('moves keyboard focus to the new Pod tab', async () => {
    const user = userEvent.setup();
    const { api } = forkingApi([ALPHA_POD, BRAVO_POD]);
    await mountWith(api);

    await user.click(forkControl(ALPHA));
    // Focus starts on the control that was pressed.
    await screen.findByTestId(testId(TEST_IDS.podTab, FORK));
    await flushPendingWork();

    expect(document.activeElement).toBe(podTab(FORK));
  });

  it('forks on Enter and on Space', async () => {
    const user = userEvent.setup();
    const { api, forkCalls } = forkingApi([ALPHA_POD, BRAVO_POD]);
    await mountWith(api);

    forkControl(BRAVO).focus();
    await user.keyboard('{Enter}');
    await flushPendingWork();
    expect(forkCalls).toEqual([BRAVO]);

    forkControl(BRAVO).focus();
    await user.keyboard(' ');
    await flushPendingWork();
    expect(forkCalls).toEqual([BRAVO, BRAVO]);
  });

  it('reports aria-busy on that tab Fork control while the fork is in flight, and clears it after', async () => {
    const user = userEvent.setup();
    let settle: (result: IpcResult<Pod>) => void = () => {};
    const api = stubOrcastrateApi({
      pods: {
        ...listing([ALPHA_POD, BRAVO_POD]),
        fork: () =>
          new Promise<IpcResult<Pod>>((resolve) => {
            settle = resolve;
          }),
      },
    });
    await mountWith(api);
    expect(forkControl(ALPHA).getAttribute('aria-busy')).toBeNull();

    await user.click(forkControl(ALPHA));
    await flushPendingWork();

    expect(forkControl(ALPHA).getAttribute('aria-busy')).toBe('true');
    // THAT tab's control, not every tab's.
    expect(forkControl(BRAVO).getAttribute('aria-busy')).toBeNull();

    await act(async () => {
      settle({ ok: true, value: FORK_POD });
      await flushPendingWork();
    });

    expect(forkControl(ALPHA).getAttribute('aria-busy')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criteria 10-12 — an ineligible Pod
// ---------------------------------------------------------------------------

describe('a Pod that cannot be forked', () => {
  it('says there is no conversation to fork yet, and makes no pods.fork call on click or Enter', async () => {
    const user = userEvent.setup();
    const fresh = makeStubPod({ id: ALPHA, title: 'Alpha', status: 'closed', ccSessionId: null });
    const api = stubOrcastrateApi({ pods: listing([fresh]) });
    await mountWith(api);

    const control = forkControl(ALPHA);
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(descriptionOf(control).toLowerCase()).toContain('no conversation to fork yet');

    await user.click(control);
    control.focus();
    await user.keyboard('{Enter}');
    await flushPendingWork();

    expect(api.calls.podFork).toEqual([]);
  });

  it.each(['running', 'waiting'] as const)(
    'says a %s Pod is mid-turn, and makes no pods.fork call on click or Enter',
    async (status) => {
      const user = userEvent.setup();
      const busy = makeStubPod({ id: ALPHA, title: 'Alpha', status, ccSessionId: 'cc-alpha' });
      const api = stubOrcastrateApi({ pods: listing([busy]) });
      await mountWith(api);

      const control = forkControl(ALPHA);
      expect(control.getAttribute('aria-disabled')).toBe('true');
      expect(descriptionOf(control)).toContain('mid-turn');

      await user.click(control);
      control.focus();
      await user.keyboard('{Enter}');
      await flushPendingWork();

      expect(api.calls.podFork).toEqual([]);
    },
  );

  it('carries no disabled attribute and is reached by Tab, so its reason is reachable by keyboard', async () => {
    const user = userEvent.setup();
    const fresh = makeStubPod({ id: ALPHA, title: 'Alpha', status: 'closed', ccSessionId: null });
    const api = stubOrcastrateApi({ pods: listing([fresh]) });
    await mountWith(api);

    const control = forkControl(ALPHA);
    expect(control.hasAttribute('disabled')).toBe(false);

    // From the run control, the very next Tab stop is the Fork control.
    screen.getByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA)).focus();
    await user.tab();
    expect(document.activeElement).toBe(control);
    expect(descriptionOf(control)).not.toBe('');
  });
});

// ---------------------------------------------------------------------------
// Criterion 15 — the failure path
// ---------------------------------------------------------------------------

describe('a fork that main refuses', () => {
  it('shows main message verbatim in an alert and adds no tab', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({ pods: listing([ALPHA_POD, BRAVO_POD]) });
    const message = 'fork of pod-alpha failed: the SDK could not fork the session';
    api.failInvoke('podFork', ipcError('IO', message));
    await mountWith(api);

    await user.click(forkControl(ALPHA));
    await flushPendingWork();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(api.calls.podFork).toEqual([[ALPHA]]);
    expect(renderedPodIds(screen.getByTestId(TEST_IDS.podBar))).toEqual([ALPHA, BRAVO]);
    // The selection did not move either.
    expect(podTab(ALPHA).getAttribute('aria-current')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Dismissing the fork-error alert
// ---------------------------------------------------------------------------

const FORK_FAILURE = 'fork of pod-alpha failed: the SDK could not fork the session';
const DISMISS_NAME = 'Dismiss fork error';

/** Every `role="alert"` element whose text is exactly main's fork message. */
function forkAlerts(): HTMLElement[] {
  return screen.queryAllByRole('alert').filter((alert) => alert.textContent === FORK_FAILURE);
}

/** Mounts Alpha and Bravo, fails a fork of Alpha, and waits for the alert. */
async function failOneFork(): Promise<void> {
  const user = userEvent.setup();
  const api = stubOrcastrateApi({ pods: listing([ALPHA_POD, BRAVO_POD]) });
  api.failInvoke('podFork', ipcError('IO', FORK_FAILURE));
  await mountWith(api);

  await user.click(forkControl(ALPHA));
  await flushPendingWork();
  await screen.findByRole('alert');
  expect(forkAlerts()).toHaveLength(1);
}

describe('the fork-error alert can be dismissed', () => {
  it('renders a native button named "Dismiss fork error" with the alert', async () => {
    await failOneFork();

    const dismiss = screen.getByRole('button', { name: DISMISS_NAME });
    expect(dismiss.tagName).toBe('BUTTON');
    expect(dismiss.getAttribute('type')).toBe('button');
  });

  it('shows the × glyph in an aria-hidden element inside the dismiss button', async () => {
    await failOneFork();

    const dismiss = screen.getByRole('button', { name: DISMISS_NAME });
    const hidden = [...dismiss.querySelectorAll('[aria-hidden="true"]')];
    expect(hidden.map((element) => element.textContent)).toEqual(['×']);
    expect(dismiss.textContent).toBe('×');
  });

  it('keeps the dismiss button outside the alert, so the alert text is exactly main message', async () => {
    await failOneFork();

    const [alert] = forkAlerts();
    if (alert === undefined) throw new Error('the fork-error alert was not rendered');
    const dismiss = screen.getByRole('button', { name: DISMISS_NAME });
    expect(alert.contains(dismiss)).toBe(false);
    expect(alert.textContent).toBe(FORK_FAILURE);
  });

  it('removes the alert when the dismiss button is clicked', async () => {
    const user = userEvent.setup();
    await failOneFork();

    await user.click(screen.getByRole('button', { name: DISMISS_NAME }));
    await flushPendingWork();

    expect(forkAlerts()).toEqual([]);
    expect(screen.queryByRole('button', { name: DISMISS_NAME })).toBeNull();
  });

  it('removes the alert when the focused dismiss button is activated with Enter', async () => {
    const user = userEvent.setup();
    await failOneFork();

    screen.getByRole('button', { name: DISMISS_NAME }).focus();
    await user.keyboard('{Enter}');
    await flushPendingWork();

    expect(forkAlerts()).toEqual([]);
  });

  it('removes the alert when the focused dismiss button is activated with Space', async () => {
    const user = userEvent.setup();
    await failOneFork();

    screen.getByRole('button', { name: DISMISS_NAME }).focus();
    await user.keyboard(' ');
    await flushPendingWork();

    expect(forkAlerts()).toEqual([]);
  });

  it('moves focus to the Pods chrome container after dismissal', async () => {
    const user = userEvent.setup();
    await failOneFork();

    const dismiss = screen.getByRole('button', { name: DISMISS_NAME });
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss);
    await user.keyboard('{Enter}');
    await flushPendingWork();

    expect(document.activeElement).toBe(screen.getByTestId(PODS_CHROME_TEST_ID));
  });

  it('clears the alert as soon as another fork starts, while that fork is still pending', async () => {
    const user = userEvent.setup();
    let forkCalls = 0;
    const api = stubOrcastrateApi({
      pods: {
        ...listing([ALPHA_POD, BRAVO_POD]),
        fork: (): Promise<IpcResult<Pod>> => {
          forkCalls += 1;
          if (forkCalls === 1) {
            return Promise.resolve({ ok: false, error: ipcError('IO', FORK_FAILURE) });
          }
          // Never settles: the second fork stays in flight for the assertion.
          return new Promise<IpcResult<Pod>>(() => {});
        },
      },
    });
    await mountWith(api);

    await user.click(forkControl(ALPHA));
    await flushPendingWork();
    await screen.findByRole('alert');
    expect(forkAlerts()).toHaveLength(1);

    await user.click(forkControl(BRAVO));
    await flushPendingWork();

    expect(forkCalls).toBe(2);
    // Present-first: the second fork IS still in flight.
    expect(forkControl(BRAVO).getAttribute('aria-busy')).toBe('true');
    expect(forkAlerts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The fork-error alert's text: clamped on screen, whole in `title`, and a
// direct text node (the hand-run driver builds a `Range` over it)
// ---------------------------------------------------------------------------

describe('the fork-error alert keeps the full message and its text node', () => {
  it('carries main message verbatim as its title, since the visible text is clamped', async () => {
    await failOneFork();

    const [alert] = forkAlerts();
    if (alert === undefined) throw new Error('the fork-error alert was not rendered');
    expect(alert.getAttribute('title')).toBe(FORK_FAILURE);
  });

  it('holds main message as a direct text-node child of the alert', async () => {
    await failOneFork();

    const [alert] = forkAlerts();
    if (alert === undefined) throw new Error('the fork-error alert was not rendered');
    const first = alert.firstChild;
    expect(first).toBeInstanceOf(Text);
    expect(first instanceof Text ? first.data : null).toBe(FORK_FAILURE);
  });
});

// ---------------------------------------------------------------------------
// Criteria 16-19 — a fork's ancestry on its tab
// ---------------------------------------------------------------------------

/**
 * The ancestry prefix, as a TEMPLATE literal on purpose: `hygiene.test.ts`
 * reads any quoted string that follows the word "from" as an import specifier,
 * and a quoted literal ending in that word would trip it.
 */
const FORKED_FROM = `Forked from`;

describe('a fork tab names its parent', () => {
  it('names the listed parent: "Forked from Alpha"', async () => {
    const api = stubOrcastrateApi({ pods: listing([ALPHA_POD, FORK_POD]) });
    await mountWith(api);

    expect(descriptionOf(podTab(FORK))).toContain('Forked from Alpha');
  });

  it('says the parent was deleted when only the source session survives', async () => {
    const orphan = makeStubPod({
      id: FORK,
      title: 'Orphan',
      forkedFromPodId: null,
      forkedFromCcSessionId: 'cc-gone',
    });
    const api = stubOrcastrateApi({ pods: listing([orphan]) });
    await mountWith(api);

    expect(descriptionOf(podTab(FORK))).toContain('Forked from a deleted Pod');
  });

  it('says the parent was deleted when forkedFromPodId names a Pod that is not listed', async () => {
    // The list a stale read can return: the parent is gone, its id is not yet
    // nulled on the fork. `FORK_POD` names `ALPHA`, and Alpha is not listed.
    const api = stubOrcastrateApi({ pods: listing([BRAVO_POD, FORK_POD]) });
    await mountWith(api);

    expect(screen.queryByTestId(testId(TEST_IDS.podTab, ALPHA))).toBeNull();
    expect(descriptionOf(podTab(FORK))).toContain('Forked from a deleted Pod');
  });

  it('carries no ancestry sentence for a Pod that was never forked', async () => {
    const api = stubOrcastrateApi({ pods: listing([ALPHA_POD, FORK_POD]) });
    await mountWith(api);

    // Present-first: the fork's tab DOES carry it in the same render, so the
    // absence below is not an empty render.
    expect(descriptionOf(podTab(FORK))).toContain(FORKED_FROM);
    const item = podTab(ALPHA).closest('li');
    expect(item).not.toBeNull();
    expect(item?.textContent ?? '').not.toContain(FORKED_FROM);
    expect(descriptionOf(podTab(ALPHA))).not.toContain(FORKED_FROM);
    expect(podTab(ALPHA).getAttribute('title')).toBeNull();
  });

  it('names the parent new title after the parent is renamed through updatePod', async () => {
    const probe: { actions: WorkspaceActions | null } = { actions: null };
    function ActionsProbe(): ReactNode {
      probe.actions = useWorkspaceActions();
      return null;
    }
    const api = stubOrcastrateApi({ pods: listing([ALPHA_POD, FORK_POD]) });
    renderWithWorkspace(
      <>
        <ActionsProbe />
        <App />
      </>,
      { api, provider: AppRoot },
    );
    await screen.findByTestId(TEST_IDS.workspace);
    await flushPendingWork();
    expect(descriptionOf(podTab(FORK))).toContain('Forked from Alpha');

    const bound = probe.actions;
    if (bound === null) throw new Error('the actions probe never rendered');
    await act(async () => {
      await bound.updatePod({ podId: ALPHA, title: 'Renamed Alpha' });
    });

    expect(descriptionOf(podTab(FORK))).toContain('Forked from Renamed Alpha');
    expect(descriptionOf(podTab(FORK))).not.toContain('Forked from Alpha');
  });
});
