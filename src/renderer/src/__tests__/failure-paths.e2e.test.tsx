// @vitest-environment jsdom
/**
 * The failure path (acceptance criterion 6).
 *
 * Three things are asserted, and they are not the same thing:
 *
 *   1. EVERY invoke channel, one at a time, is made to resolve `{ ok: false }`
 *      and the app must still render and still respond to input. No blank
 *      window, and — through the guard installed for the whole suite — no
 *      unhandled rejection.
 *   2. Every channel is CLASSIFIED, by experiment rather than by comment: each
 *      one is failed with a message unique to it, the app is driven through
 *      every affordance that can reach it, and the channel is asserted either
 *      to put that message on screen or to put nothing on screen. The set that
 *      surfaces nothing is the named `SURFACELESS_CHANNELS` allowlist below,
 *      and the assertion is two-sided: a channel that gains a surface fails as
 *      loudly as one that loses it. The exclusion cannot silently grow.
 *   3. For each channel that DOES have a surface, a focused test pins down
 *      which element carries the message and what the app does around it —
 *      the dialog stays open, the draft survives, the card stays.
 *
 * ARITHMETIC. There are fifteen invoke channels. Six reach a rendered error
 * surface; nine do not. See `SURFACELESS_CHANNELS` for the nine and why each
 * is there. This is a finding about the app, not about the suite; see T8's
 * report.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { INVOKE_CHANNELS } from '@shared/contracts/ipc';
import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import {
  ipcError,
  stubOrcastrateApi,
  type InvokeChannelKey,
  type StubOrcastrateApi,
} from '../test-utils';

import {
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

const INVOKE_KEYS = Object.keys(INVOKE_CHANNELS) as InvokeChannelKey[];

/** Pods listed and a Matriarch for whichever Pod is activated. */
function laneApi(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_ALPHA, POD_BRAVO] }) },
    lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
  });
}

// ---------------------------------------------------------------------------
// Which channels can say what went wrong (acceptance criterion 6)
// ---------------------------------------------------------------------------

/**
 * The channels whose failure the user is never told about.
 *
 * Each entry is a claim about the app as it stands, checked below rather than
 * narrated: the suite drives every affordance that can reach the channel and
 * asserts the message reaches no pixel. Removing a name makes the suite demand
 * a surface; adding one makes it demand silence. Neither can happen by
 * accident, which is the point — a comment cannot go stale here.
 *
 *   podUpdate            Only `reorderPods` calls it, and only a drag commits
 *                        a reorder. `PodBarPanel` has the surface; no click
 *                        reaches it.
 *   podDelete            No affordance in the shell calls `deletePod`.
 *   podClose             `PodsChrome` calls `closePod` as `void actions...`
 *                        and discards the result.
 *   podInterrupt         `App` calls `interruptPod` as `void actions...` and
 *                        discards the result.
 *   podSetPermissionMode No affordance changes an existing Pod's mode; the
 *                        dialog's mode picker is create-time only.
 *   podReconnect         No affordance in the shell calls `reconnectPod`.
 *   laneList             The error reaches `lanesError`, but `LaneRail`
 *                        renders no error at all.
 *   eventsRead           The error reaches `runtime.backfill.error`, which
 *                        nothing reads. `TranscriptPane` DOES render
 *                        `view.error.message`, but that field comes from
 *                        `transcripts[laneId].error`, which the store only
 *                        ever writes as `null` — so the pane's error branch is
 *                        unreachable and the backfill failure is silent.
 *   appRoutingMode       A failure leaves `routingMode` null, which renders
 *                        the waiting `EmptyWorkspace` rather than a message.
 */
const SURFACELESS_CHANNELS: readonly InvokeChannelKey[] = [
  'podUpdate',
  'podDelete',
  'podClose',
  'podInterrupt',
  'podSetPermissionMode',
  'podReconnect',
  'laneList',
  'eventsRead',
  'appRoutingMode',
];

/**
 * The subset of `SURFACELESS_CHANNELS` that no affordance calls AT ALL, so
 * their failure has nothing to surface because it never happens.
 *
 * Splitting these out is what keeps the rest of the allowlist honest. "The
 * message did not appear" is worth nothing if the channel was never invoked,
 * and there are two ways for that to happen silently: the app grows no
 * affordance for it, or — as this suite got wrong on its first pass — the
 * stub's `overrides` replace the channel wholesale and beat `failInvoke`. The
 * call-count assertion below catches both.
 */
const UNREACHABLE_CHANNELS: readonly InvokeChannelKey[] = [
  'podUpdate',
  'podDelete',
  'podSetPermissionMode',
  'podReconnect',
];

/**
 * Watches for one string anywhere in the rendered page.
 *
 * The question criterion 6 asks is whether the UI EVER says what failed, not
 * whether it is still saying so once the drive has clicked everything else on
 * screen. A later successful action legitimately clears a stale error, so a
 * single check at the end would misread six surfaces as silent. `check()` is
 * therefore called after every step, and `seen` latches.
 */
interface ScreenWatcher {
  seen: boolean;
  check(): void;
}

function watchScreenFor(message: string): ScreenWatcher {
  const watcher: ScreenWatcher = {
    seen: false,
    check(): void {
      if (watcher.seen) return;
      watcher.seen = (document.body.textContent ?? '').includes(message);
    },
  };
  return watcher;
}

/** Flush pending work, then look at what the user would now be seeing. */
async function settle(watch: ScreenWatcher): Promise<void> {
  await flushPendingWork();
  watch.check();
}

/** Click the element with this test id, if the app is currently showing one. */
async function clickIfPresent(user: UserEvent, watch: ScreenWatcher, id: string): Promise<void> {
  const element = screen.queryByTestId(id);
  if (element === null) return;
  await user.click(element);
  await settle(watch);
}

/** Type into the element with this test id, if the app is currently showing one. */
async function typeIfPresent(
  user: UserEvent,
  watch: ScreenWatcher,
  id: string,
  text: string,
): Promise<void> {
  const element = screen.queryByTestId(id);
  if (element === null) return;
  await user.type(element, text);
  await settle(watch);
}

/**
 * Clicks every enabled button on screen, once each, over a bounded number of
 * sweeps so a click that reveals more buttons is followed on the next pass.
 *
 * This exists so a channel cannot be recorded as surface-less merely because
 * the scripted drive above forgot its button: close, interrupt, pin, steer and
 * the mode options are all reached here without being named. A click that the
 * DOM refuses (detached, or covered) is skipped rather than failed — this is a
 * reachability sweep, and the classification it feeds is two-sided, so a
 * skipped click that hid a real surface would fail the assertion, not pass it.
 */
async function clickEveryEnabledButton(
  user: UserEvent,
  watch: ScreenWatcher,
  sweeps = 3,
): Promise<void> {
  const clicked = new Set<Element>();
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    const pending = screen
      .queryAllByRole('button')
      .filter((button) => !clicked.has(button) && !(button as HTMLButtonElement).disabled);
    if (pending.length === 0) return;
    for (const button of pending) {
      clicked.add(button);
      if (!button.isConnected) continue;
      try {
        await user.click(button);
      } catch {
        continue;
      }
      await settle(watch);
    }
  }
}

/**
 * Drives the assembled app through every affordance that can reach an invoke
 * channel, tolerating the ones a given failure has made unreachable.
 *
 * The scripted steps come first and in this order because they depend on each
 * other: the permission card must be answered while Bravo is still active, and
 * creating a Pod is the ONLY path to an opened Pod, which the composer needs
 * before it will send.
 */
async function driveEveryAffordance(
  user: UserEvent,
  api: StubOrcastrateApi,
  watch: ScreenWatcher,
): Promise<void> {
  mountWorkspace(api);
  await screen.findByTestId(TEST_IDS.workspace);
  await settle(watch);

  // Activating a Pod issues `lane:list` and `events:read` for it.
  await clickIfPresent(user, watch, testId(TEST_IDS.podTab, BRAVO_ID));

  // A permission decision: `permission:respond`.
  act(() => {
    api.emit.permissionRequested({
      podId: BRAVO_ID,
      laneId: MATRIARCH_ID,
      requestId: 'req-sweep',
      toolName: 'Bash',
      input: { command: 'ls' },
    });
  });
  await settle(watch);
  await clickIfPresent(user, watch, TEST_IDS.permissionAllow);

  // A second page of history: `events:read`.
  await clickIfPresent(user, watch, TEST_IDS.transcriptLoadMore);

  // `dialog:pickDirectory`, then `pod:create`, then `pod:open`.
  await clickIfPresent(user, watch, TEST_IDS.newPodButton);
  await typeIfPresent(user, watch, TEST_IDS.newPodTitleInput, 'Charlie');
  await clickIfPresent(user, watch, TEST_IDS.newPodBrowseButton);
  await clickIfPresent(user, watch, TEST_IDS.newPodSubmit);

  // A send from the Pod that create just opened: `pod:send`.
  await typeIfPresent(user, watch, TEST_IDS.composerInput, 'are you there');
  await clickIfPresent(user, watch, TEST_IDS.composerSend);

  // Esc in the composer interrupts the turn: `pod:interrupt`. It is a key, not
  // a button, so the sweep below cannot reach it.
  await typeIfPresent(user, watch, TEST_IDS.composerInput, '{Escape}');

  // Everything the shell offers that is not named above.
  await clickEveryEnabledButton(user, watch);
}

/**
 * Two Pods and a Matriarch, with the channel UNDER TEST left un-overridden.
 *
 * An explicit override replaces a channel wholesale, `failInvoke` included, so
 * overriding the one being failed would arm a failure that never fires.
 */
function sweepApi(underTest: InvokeChannelKey, message: string): StubOrcastrateApi {
  const api = stubOrcastrateApi({
    pods:
      underTest === 'podList'
        ? {}
        : { list: async () => ({ ok: true, value: [POD_ALPHA, POD_BRAVO] }) },
    lanes: underTest === 'laneList' ? {} : { list: async () => ({ ok: true, value: [MATRIARCH] }) },
  });
  api.failInvoke(underTest, ipcError('INTERNAL', message));
  return api;
}

describe('which channels can say what went wrong', () => {
  it('classifies every channel exactly once, with the unreachable ones a subset of the silent ones', () => {
    // Vacuity guards. A typo'd entry, a duplicate, or an allowlist that
    // swallowed every channel would each make the classification trivial.
    expect(INVOKE_KEYS).toEqual(expect.arrayContaining([...SURFACELESS_CHANNELS]));
    expect(new Set(SURFACELESS_CHANNELS).size).toBe(SURFACELESS_CHANNELS.length);
    expect(new Set(UNREACHABLE_CHANNELS).size).toBe(UNREACHABLE_CHANNELS.length);
    expect(SURFACELESS_CHANNELS).toEqual(expect.arrayContaining([...UNREACHABLE_CHANNELS]));
    // Six of fifteen surface. If that ratio moves, this file's header is stale.
    expect(INVOKE_KEYS.length - SURFACELESS_CHANNELS.length).toBe(6);
  });

  it.each(INVOKE_KEYS)(
    'puts the %s failure on screen if and only if that channel is not on the surface-less allowlist',
    async (channel) => {
      const user = userEvent.setup();
      // Unique per channel, so a message that reached the screen can only have
      // come from THIS channel — no other failure is armed.
      const message = `orcastrate-sentinel-${channel}-failed`;
      const api = sweepApi(channel, message);

      const watch = watchScreenFor(message);
      await driveEveryAffordance(user, api, watch);

      // The failure must actually have fired. Without this, a channel the
      // drive never reaches would masquerade as one with no error surface.
      const invoked = api.calls[channel].length > 0;
      const reachable = !UNREACHABLE_CHANNELS.includes(channel);
      expect(
        invoked,
        reachable
          ? `${channel} was never invoked, so its classification below proves nothing`
          : `${channel} is on UNREACHABLE_CHANNELS but the app DID call it — move it off that list`,
      ).toBe(reachable);

      const expected = !SURFACELESS_CHANNELS.includes(channel);
      expect(
        watch.seen,
        expected
          ? `${channel} has a rendered error surface, but its message never appeared`
          : `${channel} is on SURFACELESS_CHANNELS, but its message DID appear — remove it from the allowlist and assert where it lands`,
      ).toBe(expected);
    },
  );
});

describe('every invoke channel failing in turn', () => {
  it('has a channel list to walk at all', () => {
    // Vacuity guard: an empty `it.each` below would report as a pass.
    expect(INVOKE_KEYS.length).toBeGreaterThanOrEqual(15);
  });

  it.each(INVOKE_KEYS)(
    'leaves the app rendered and interactive when the %s channel resolves { ok: false }',
    async (channel) => {
      const user = userEvent.setup();
      const api = stubOrcastrateApi();
      api.failInvoke(channel, ipcError('INTERNAL', `${channel} is unavailable`));

      mountWorkspace(api);

      // Not a blank window.
      expect(await screen.findByTestId(TEST_IDS.workspace)).toBeDefined();
      expect(screen.getByTestId(TEST_IDS.podBar)).toBeDefined();
      await flushPendingWork();

      // Still interactive: the one affordance present in every state responds.
      await user.click(screen.getByTestId(TEST_IDS.newPodButton));
      expect(await screen.findByTestId(TEST_IDS.newPodDialog)).toBeDefined();
    },
  );

  it('survives every channel failing at once', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi();
    api.failAllInvokes(ipcError('INTERNAL', 'the bridge is down'));

    mountWorkspace(api);

    expect(await screen.findByText('the bridge is down')).toBeDefined();
    await user.click(screen.getByTestId(TEST_IDS.newPodButton));
    expect(await screen.findByTestId(TEST_IDS.newPodDialog)).toBeDefined();
  });
});

/**
 * One test per channel the sweep above classified as HAVING a surface — all
 * six of them. The sweep proves the message reaches some pixel; these prove
 * WHICH pixel, and what the app does around it.
 */
describe('the message main wrote is the message on screen', () => {
  it('covers every channel the sweep found a surface for', () => {
    // Keeps this describe block and the allowlist from drifting apart: if a
    // channel gains a surface, the count below is what notices.
    const surfaced = INVOKE_KEYS.filter((key) => !SURFACELESS_CHANNELS.includes(key));
    expect(surfaced).toEqual([
      'podList',
      'podCreate',
      'podOpen',
      'podSend',
      'permissionRespond',
      'dialogPickDirectory',
    ]);
  });

  it('shows the dialog.pickDirectory failure next to the Browse button, with the dialog still open', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi();
    api.failInvoke('dialogPickDirectory', ipcError('IO', 'the folder picker would not open'));

    mountWorkspace(api);

    await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
    await user.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));

    const dialog = await screen.findByTestId(TEST_IDS.newPodDialog);
    expect(within(dialog).getByText('the folder picker would not open')).toBeDefined();
  });

  it('shows the pods.open failure in the dialog when the row was created but would not start', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi();
    // `createPod` creates the row and THEN opens it. Only the open fails here.
    api.failInvoke('podOpen', ipcError('SPAWN_FAILED', 'the CLI would not start'));

    mountWorkspace(api);

    await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
    await user.type(screen.getByTestId(TEST_IDS.newPodTitleInput), 'Charlie');
    await user.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await user.click(await screen.findByTestId(TEST_IDS.newPodSubmit));
    await flushPendingWork();

    const dialog = await screen.findByTestId(TEST_IDS.newPodDialog);
    expect(within(dialog).getByText('the CLI would not start')).toBeDefined();
    // The row itself WAS created — the failure is the start, not the create —
    // so the Pod is on the bar, unopened.
    expect(within(screen.getByTestId(TEST_IDS.podBar)).getByText('Charlie')).toBeDefined();
  });

  it('shows the pods.list failure above the Pod bar', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('podList', ipcError('IO', 'the Pod list could not be read'));

    mountWorkspace(api);

    expect(await screen.findByText('the Pod list could not be read')).toBeDefined();
  });

  it('keeps the New Pod dialog open and shows the pods.create failure inside it', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi();
    api.failInvoke('podCreate', ipcError('CWD_MISSING', 'that directory no longer exists'));

    mountWorkspace(api);

    await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
    await user.type(screen.getByTestId(TEST_IDS.newPodTitleInput), 'Charlie');
    await user.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await user.click(await screen.findByTestId(TEST_IDS.newPodSubmit));

    expect(await screen.findByText('that directory no longer exists')).toBeDefined();
    // The dialog stays open and keeps what the user typed.
    expect(screen.getByTestId(TEST_IDS.newPodDialog)).toBeDefined();
    expect((screen.getByTestId(TEST_IDS.newPodTitleInput) as HTMLInputElement).value).toBe(
      'Charlie',
    );
  });

  it('shows the pods.send failure in the composer without losing the draft', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
    });

    mountWorkspace(api);

    // `createPod` is the only path that OPENS a Pod, and the composer needs an
    // opened Pod to send at all.
    await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
    await user.type(screen.getByTestId(TEST_IDS.newPodTitleInput), 'Charlie');
    await user.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await user.click(await screen.findByTestId(TEST_IDS.newPodSubmit));

    const input = await screen.findByTestId(TEST_IDS.composerInput);
    api.failInvoke('podSend', ipcError('NOT_RUNNING', 'the Pod stopped before that arrived'));

    await user.type(input, 'are you there');
    await user.click(screen.getByTestId(TEST_IDS.composerSend));
    await flushPendingWork();

    expect(screen.getByTestId('composer-error').textContent).toContain(
      'the Pod stopped before that arrived',
    );
    // A failed send must not lose the text.
    expect((screen.getByTestId(TEST_IDS.composerInput) as HTMLTextAreaElement).value).toBe(
      'are you there',
    );
  });

  it('shows the permissions.respond failure on the card, which stays on screen', async () => {
    const user = userEvent.setup();
    const api = laneApi();

    mountWorkspace(api);

    await user.click(await screen.findByTestId(testId(TEST_IDS.podTab, BRAVO_ID)));
    await screen.findByTestId(testId(TEST_IDS.laneRow, MATRIARCH_ID));

    act(() => {
      api.emit.permissionRequested({
        podId: BRAVO_ID,
        laneId: MATRIARCH_ID,
        requestId: 'req-fail',
        toolName: 'Bash',
        input: { command: 'ls' },
      });
    });

    api.failInvoke('permissionRespond', ipcError('IO', 'the decision never reached the Pod'));

    const cardId = testId(TEST_IDS.permissionCard, 'req-fail');
    await user.click(within(screen.getByTestId(cardId)).getByTestId(TEST_IDS.permissionAllow));
    await flushPendingWork();

    // The request is genuinely still unanswered, so the card stays.
    expect(screen.getByTestId(cardId)).toBeDefined();
    expect(screen.getByTestId('permission-card-error').textContent).toContain(
      'the decision never reached the Pod',
    );
  });
});
