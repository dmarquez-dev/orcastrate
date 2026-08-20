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
 * ARITHMETIC. There are TWENTY-ONE invoke channels. TWELVE reach a rendered
 * error surface; NINE do not. See `SURFACELESS_CHANNELS` for the nine and why
 * each is there. This is a finding about the app, not about the suite.
 *
 * WHAT MOVED, AND WHAT DID NOT. The original fifteen channels classified six
 * surfaced and nine silent. Sub-session 3 added six more — three
 * `beachcomber:*` and three `helm:*` — and ALL SIX SURFACE. The allowlist
 * therefore still holds exactly the nine names it always held: the count of
 * silent channels did not move, the count of surfaced ones went from six to
 * twelve, and both halves are asserted below so neither can drift alone.
 *
 * That all six surface is not luck. `renderer-panels.ts` gives each panel view
 * a single-writer `actionError` field for exactly this reason, and
 * `BeachcomberError` / `HelmNotices` render it unconditionally; both frozen
 * headers state that none of the six may join the allowlist.
 *
 * THE SWEEP HAD TO LEARN TO REACH THEM. Four of the six sit behind a two-step
 * affordance — a row selection then a confirm, or a `<select>` change then a
 * save — which no amount of button clicking arrives at. `driveBeachcomberPanel`
 * and `driveHelmPanel` below drive those steps deliberately, and the
 * call-count assertion in the classification test is what proves they landed.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type {
  BeachcomberPreviewRequest,
  BeachcomberTrashRequest,
  BeachcomberTrashResult,
} from '@shared/contracts/beachcomber';
import { INVOKE_CHANNELS } from '@shared/contracts/ipc';
import { PANEL_TEST_IDS, type PanelKey } from '../contracts/renderer-panels';
import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { BEACHCOMBER_LOCAL_TEST_IDS } from '../beachcomber';
import {
  ipcError,
  makeStubBeachcomberEntries,
  makeStubBeachcomberPreview,
  makeStubBeachcomberScan,
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

/**
 * The classification sweep drives the whole app plus BOTH panels twenty-one
 * times over, so it is the one place in this suite where the harness's own
 * cost matters. `delay: null` removes `user-event`'s inter-event yield; it
 * changes no assertion, because every step here is followed by `settle()`,
 * which drains the microtask queue and one macrotask turn explicitly.
 *
 * This is NOT a sleep and NOT a race fix. Nothing in this file waits on a
 * duration; the panel drives wait on the DOM the previous step produced.
 */
function fastUser(): UserEvent {
  return userEvent.setup({ delay: null });
}

/**
 * Driving twenty-one channels through two panels each does not fit in vitest's
 * 5s default, and the honest fix for a genuinely long test is to say how long
 * it may take rather than to make it do less. It is a bound, not a wait: a
 * passing run does not spend it.
 */
const SWEEP_TIMEOUT_MS = 30_000;

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
 *
 * NONE OF SUB-SESSION 3's SIX CHANNELS IS HERE, and none may be added. Both
 * frozen panel contracts say so in their headers — each panel view carries a
 * single-writer `actionError` that its panel renders unconditionally — and the
 * focused tests below say which element carries each message. If one of them
 * ever stops surfacing, the fix is the panel, not this list.
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
 *
 * `skip` EXISTS SO THE PANELS ARE NOT ENTERED BY ACCIDENT. Opening a panel
 * replaces the whole body, so a stray click on the strip would decide, by DOM
 * order, whether the rest of a sweep ran against the workspace or against a
 * panel. `driveEveryAffordance` therefore skips the two strip buttons here and
 * opens each panel deliberately afterwards — and calls this function AGAIN
 * inside each opened panel, so the sweep genuinely reaches panel affordances
 * nobody named. See criterion 15.
 */
async function clickEveryEnabledButton(
  user: UserEvent,
  watch: ScreenWatcher,
  skip: (button: HTMLElement) => boolean = () => false,
  sweeps = 3,
): Promise<void> {
  const clicked = new Set<Element>();
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    const pending = screen
      .queryAllByRole('button')
      .filter(
        (button) =>
          !clicked.has(button) && !(button as HTMLButtonElement).disabled && !skip(button),
      );
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

/** The two strip buttons that swap the whole body for a panel. */
function isPanelStripOpenButton(button: HTMLElement): boolean {
  return (button.getAttribute('data-testid') ?? '').startsWith(
    `${PANEL_TEST_IDS.panelBarOpen}:`,
  );
}

// ---------------------------------------------------------------------------
// Driving the two panels (acceptance criteria 4 and 15)
// ---------------------------------------------------------------------------

/**
 * Close whatever panel is open, so the next one opens against a clean store.
 *
 * Closing is not cosmetic: `panel-store.ts` resets a panel's state when its
 * last consumer unmounts, so the deliberate drives below start from a fresh
 * scan and a fresh scope list however the generic sweep left things.
 */
async function closeOpenPanel(user: UserEvent, watch: ScreenWatcher): Promise<void> {
  await clickIfPresent(user, watch, PANEL_TEST_IDS.panelBarClose);
}

/** Open one panel from the strip and wait for its first fetch to land. */
async function openPanel(user: UserEvent, watch: ScreenWatcher, key: PanelKey): Promise<void> {
  await clickIfPresent(user, watch, testId(PANEL_TEST_IDS.panelBarOpen, key));
}

/**
 * Beachcomber, driven all the way to the wire.
 *
 * `beachcomber:scan` needs only the mount. The other two need a SELECTION and
 * then a CONFIRM, which is why clicking buttons alone never reached them:
 * `beachcomber:preview` is behind a checkbox that no button sweep ticks, and
 * `beachcomber:trash` is behind the preview dialog's confirm, which does not
 * exist until the preview has answered.
 *
 * The first SELECTABLE checkbox is the one ticked. The default fixture scan
 * leads with a blocked row whose checkbox carries the real `disabled`
 * attribute, and clicking that one would select nothing at all.
 */
async function driveBeachcomberPanel(user: UserEvent, watch: ScreenWatcher): Promise<void> {
  await openPanel(user, watch, 'beachcomber');
  if (screen.queryByTestId(PANEL_TEST_IDS.beachcomberPanel) === null) return;

  const selectable = screen
    .queryAllByTestId(PANEL_TEST_IDS.beachcomberRowSelect)
    .filter((box) => !(box as HTMLInputElement).disabled);
  const first = selectable[0];
  if (first !== undefined) {
    await user.click(first);
    await settle(watch);
  }

  await clickIfPresent(user, watch, PANEL_TEST_IDS.beachcomberPreviewButton);
  await clickIfPresent(user, watch, PANEL_TEST_IDS.beachcomberPreviewConfirm);

  // Everything else the panel offers, now that the scripted path has run. One
  // pass: the buttons a first click reveals here are the preview dialog's, and
  // the scripted steps above already drove those.
  await clickEveryEnabledButton(user, watch, isPanelStripOpenButton, 1);
}

/**
 * Helm, driven all the way to the wire.
 *
 * `helm:scopes` needs only the mount. `helm:load` is behind a `<select>`
 * change — not a click — and `helm:save` is behind Save, which stays disabled
 * until the draft is DIRTY, so something has to be typed first.
 *
 * The model field is what gets typed into because it is the one control whose
 * edit cannot itself block the save: a blank permission rule or a nameless
 * environment variable is a severity-`error` issue, and `blocked` turns Save
 * off again.
 */
async function driveHelmPanel(user: UserEvent, watch: ScreenWatcher): Promise<void> {
  await openPanel(user, watch, 'helm');
  if (screen.queryByTestId(PANEL_TEST_IDS.helmPanel) === null) return;

  const select = screen.queryByTestId(PANEL_TEST_IDS.helmScopeSelect);
  if (select !== null && !(select as HTMLSelectElement).disabled) {
    const option = screen.queryByTestId(testId(PANEL_TEST_IDS.helmScopeOption, 'user'));
    if (option !== null) {
      await user.selectOptions(select, option);
      await settle(watch);
    }
  }

  // ONE character is enough to make the draft dirty, and Save is off until it
  // is. The model field is typed into rather than replaced because `edit` is
  // what the panel calls on every keystroke.
  await typeIfPresent(user, watch, PANEL_TEST_IDS.helmModel, 'x');
  await clickIfPresent(user, watch, PANEL_TEST_IDS.helmSave);

  await clickEveryEnabledButton(user, watch, isPanelStripOpenButton, 1);
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

  // Everything the shell offers that is not named above, MINUS the panel
  // strip: opening a panel replaces the body, and which panel is open must not
  // be decided by DOM order halfway through a sweep.
  await clickEveryEnabledButton(user, watch, isPanelStripOpenButton);

  // Both panels, opened deliberately and driven to the wire. Each is closed
  // first so it starts from a fresh scan / scope list whatever the sweep above
  // left behind.
  await closeOpenPanel(user, watch);
  await driveBeachcomberPanel(user, watch);
  await closeOpenPanel(user, watch);
  await driveHelmPanel(user, watch);
}

/**
 * Two Pods and a Matriarch, with the channel UNDER TEST left un-overridden.
 *
 * An explicit override replaces a channel wholesale, `failInvoke` included, so
 * overriding the one being failed would arm a failure that never fires.
 */
/**
 * THE MESSAGE THAT PROVES ATTRIBUTION (criterion 15).
 *
 * The sweep now opens both panels, so a channel could in principle be recorded
 * as surfaced because a panel it has nothing to do with rendered an error. It
 * cannot, and this function is why: exactly one channel is armed per run, and
 * its message names it. A string on screen therefore identifies its own
 * channel, whichever region drew it. The pairwise-distinctness of these
 * strings is asserted below rather than assumed.
 */
function sentinelFor(channel: InvokeChannelKey): string {
  return `orcastrate-sentinel-${channel}-failed`;
}

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
    // TWELVE of TWENTY-ONE surface, and NINE do not. Both halves are pinned,
    // not just their difference: a channel added to the frozen map without a
    // classification would move the total and be caught here, and a name added
    // to the allowlist would move the other. If either moves, this file's
    // header is stale and saying so is this assertion's whole job.
    expect(INVOKE_KEYS.length).toBe(21);
    expect(SURFACELESS_CHANNELS.length).toBe(9);
    expect(INVOKE_KEYS.length - SURFACELESS_CHANNELS.length).toBe(12);
  });

  it.each(INVOKE_KEYS)(
    'puts the %s failure on screen if and only if that channel is not on the surface-less allowlist',
    async (channel) => {
      const user = fastUser();
      // Unique per channel, so a message that reached the screen can only have
      // come from THIS channel — no other failure is armed.
      const message = sentinelFor(channel);
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
    SWEEP_TIMEOUT_MS,
  );
});

describe('every invoke channel failing in turn', () => {
  it('has a channel list to walk at all', () => {
    // Vacuity guard: an empty `it.each` below would report as a pass.
    expect(INVOKE_KEYS.length).toBeGreaterThanOrEqual(21);
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
 * TWELVE of them. The sweep proves the message reaches some pixel; these prove
 * WHICH pixel, and what the app does around it.
 */
describe('the message main wrote is the message on screen', () => {
  it('covers every channel the sweep found a surface for', () => {
    // Keeps this describe block and the allowlist from drifting apart: if a
    // channel gains a surface, the list below is what notices. The order is
    // `INVOKE_CHANNELS`' own declaration order, so a channel inserted into the
    // frozen map lands here rather than at the end by accident.
    const surfaced = INVOKE_KEYS.filter((key) => !SURFACELESS_CHANNELS.includes(key));
    expect(surfaced).toEqual([
      'podList',
      'podCreate',
      'podOpen',
      'podSend',
      'permissionRespond',
      'dialogPickDirectory',
      'beachcomberScan',
      'beachcomberPreview',
      'beachcomberTrash',
      'helmScopes',
      'helmLoad',
      'helmSave',
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

// ---------------------------------------------------------------------------
// The two panels, driven from the assembled app (acceptance criteria 4-9, 15)
// ---------------------------------------------------------------------------

/** Mount the app and open one panel from the strip. Nothing else is scripted. */
async function mountWithPanel(
  user: UserEvent,
  api: StubOrcastrateApi,
  key: PanelKey,
): Promise<void> {
  mountWorkspace(api);
  await screen.findByTestId(TEST_IDS.workspace);
  await user.click(await screen.findByTestId(testId(PANEL_TEST_IDS.panelBarOpen, key)));
  await flushPendingWork();
}

/**
 * Tick one row's checkbox by entry id.
 *
 * By ID rather than by position, because the fixture scan deliberately leads
 * with a BLOCKED row: a positional helper would silently tick nothing and
 * every assertion after it would be about an empty selection.
 */
async function selectRow(user: UserEvent, entryId: string): Promise<HTMLInputElement> {
  const row = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, entryId));
  const box = within(row).getByTestId(PANEL_TEST_IDS.beachcomberRowSelect) as HTMLInputElement;
  await user.click(box);
  await flushPendingWork();
  return box;
}

/** Choose a Helm scope. It is a `<select>` change, which no click reaches. */
async function chooseScope(user: UserEvent, scopeId: string): Promise<void> {
  await user.selectOptions(
    screen.getByTestId(PANEL_TEST_IDS.helmScopeSelect),
    screen.getByTestId(testId(PANEL_TEST_IDS.helmScopeOption, scopeId)),
  );
  await flushPendingWork();
}

/** Selectable rows of the default fixture scan, named so tests read as prose. */
const ORPHAN_ROW = 'entry-projects-orphan';
const DECODED_ROW = 'entry-projects-decoded';
const SHELL_ROW = 'entry-shell-1';
/** The one row nothing may select: a Pod's own working directory holds it. */
const BLOCKED_ROW = 'entry-projects-blocked';

describe('the Beachcomber panel says what went wrong and keeps what the user chose', () => {
  it('shows the beachcomber.scan failure at beachcomberError with the panel still there', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();
    api.failInvoke('beachcomberScan', ipcError('IO', 'the projects directory could not be read'));

    await mountWithPanel(user, api, 'beachcomber');

    const error = await screen.findByTestId(PANEL_TEST_IDS.beachcomberError);
    expect(within(error).getByText('the projects directory could not be read')).toBeDefined();
    // A failed scan must not cost the user the panel: Rescan is the way back.
    expect(screen.getByTestId(PANEL_TEST_IDS.beachcomberPanel)).toBeDefined();
    expect(screen.getByTestId(PANEL_TEST_IDS.beachcomberRescan)).toBeDefined();
  });

  it('shows the beachcomber.preview failure at beachcomberError, keeping the selection and opening no dialog', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await mountWithPanel(user, api, 'beachcomber');
    const box = await selectRow(user, ORPHAN_ROW);

    api.failInvoke('beachcomberPreview', ipcError('IO', 'the preview could not be built'));
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    await flushPendingWork();

    const error = screen.getByTestId(PANEL_TEST_IDS.beachcomberError);
    expect(within(error).getByText('the preview could not be built')).toBeDefined();
    // Nothing was previewed, so nothing may be confirmable.
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog)).toBeNull();
    // THE SELECTION SURVIVES. Re-preparing a selection after a transient IO
    // failure is exactly the cost that makes a user click Confirm untested.
    expect(box.checked).toBe(true);
    expect(screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.selectionSummary).textContent).toContain(
      '1 item selected',
    );
  });

  it('shows the beachcomber.trash failure at beachcomberError, keeping the preview dialog and the selection', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await mountWithPanel(user, api, 'beachcomber');
    const box = await selectRow(user, ORPHAN_ROW);
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    await flushPendingWork();

    api.failInvoke('beachcomberTrash', ipcError('IO', 'the recycle bin refused the move'));
    await user.click(await screen.findByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm));
    await flushPendingWork();

    const error = screen.getByTestId(PANEL_TEST_IDS.beachcomberError);
    expect(within(error).getByText('the recycle bin refused the move')).toBeDefined();
    // Nothing moved, so the preview is still an accurate statement of what
    // would move — it stays up, and so does the selection behind it.
    expect(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog)).toBeDefined();
    expect(box.checked).toBe(true);
    // And no result is claimed: a failed trash is not a cleanup that happened.
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberResult)).toBeNull();
  });

  it('never invokes beachcomber.preview or beachcomber.trash when the only row asked for is blocked', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await mountWithPanel(user, api, 'beachcomber');

    // Ask for the blocked row, then try to walk the whole path anyway.
    await selectRow(user, BLOCKED_ROW);
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    await flushPendingWork();
    const confirm = screen.queryByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm);
    if (confirm !== null) {
      await user.click(confirm);
      await flushPendingWork();
    }

    // THE ASSERTION IS THE CALL COUNT, not the disabled attribute. A checkbox
    // that merely LOOKS unselectable is a styling claim; nothing reaching the
    // wire is the property that matters.
    //
    // What this route exercises is the OUTERMOST of three guards — the real
    // `disabled` attribute, which makes the click a no-op before any store
    // code runs. The two store-side guards behind it are exercised by the
    // next test, which reaches a blocked row without going through a
    // checkbox at all.
    expect(api.calls.beachcomberPreview).toEqual([]);
    expect(api.calls.beachcomberTrash).toEqual([]);
    expect(screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.selectionSummary).textContent).toContain(
      'Nothing selected',
    );
  });

  it('never lets a row that became blocked AFTER it was chosen reach preview or trash', async () => {
    const user = fastUser();
    // The race the guards exist for: the user picks a directory, a Pod opens
    // in it, and the next scan says so. The id is already in `selection` by
    // then, so no `disabled` attribute is between it and the wire — only the
    // store, which prunes the selection against every scan that lands and
    // filters again on the way out.
    let scans = 0;
    const api = stubOrcastrateApi({
      beachcomber: {
        scan: async () => {
          scans += 1;
          const entries = makeStubBeachcomberEntries().map((entry) =>
            entry.id === ORPHAN_ROW && scans > 1
              ? {
                  ...entry,
                  blocked: 'pod-cwd' as const,
                  blockedBy: { podId: 'pod-1', title: 'Stub Pod' },
                }
              : entry,
          );
          return { ok: true, value: makeStubBeachcomberScan({ entries }) };
        },
      },
    });

    await mountWithPanel(user, api, 'beachcomber');
    await selectRow(user, ORPHAN_ROW);
    expect(screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.selectionSummary).textContent).toContain(
      '1 item selected',
    );

    // A Pod took the directory; the second scan reports it blocked.
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberRescan));
    await flushPendingWork();
    expect(screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, ORPHAN_ROW))).toBeDefined();

    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    await flushPendingWork();
    const confirmAfterRescan = screen.queryByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm);
    if (confirmAfterRescan !== null) {
      await user.click(confirmAfterRescan);
      await flushPendingWork();
    }

    expect(api.calls.beachcomberPreview).toEqual([]);
    expect(api.calls.beachcomberTrash).toEqual([]);
    expect(screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.selectionSummary).textContent).toContain(
      'Nothing selected',
    );
  });

  it('never invokes beachcomber.trash when the preview refused every row asked for', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi({
      beachcomber: {
        preview: async (req: BeachcomberPreviewRequest) => ({
          ok: true,
          value: {
            items: [],
            refused: req.ids.map((id) => ({ id, reason: 'Something else holds this directory.' })),
            totalBytes: 0,
            totalFiles: 0,
          },
        }),
      },
    });

    await mountWithPanel(user, api, 'beachcomber');
    await selectRow(user, ORPHAN_ROW);
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    await flushPendingWork();

    // The dialog opens and says no. Confirming it must still reach nothing.
    const dialog = await screen.findByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog);
    expect(
      within(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewRefused)).getByText(
        'Something else holds this directory.',
      ),
    ).toBeDefined();
    await user.click(within(dialog).getByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm));
    await flushPendingWork();

    expect(api.calls.beachcomberTrash).toEqual([]);
  });

  it('invokes beachcomber.trash only after a beachcomber.preview, and only for the ids that preview accepted', async () => {
    const user = fastUser();
    // The stub records ARGUMENTS per channel but not the order BETWEEN two
    // channels, and the order is half of what this test is about — so both
    // calls are recorded into one list here.
    const order: string[] = [];
    const previewIds: string[][] = [];
    const trashIds: string[][] = [];
    const api = stubOrcastrateApi({
      beachcomber: {
        preview: async (req: BeachcomberPreviewRequest) => {
          order.push('preview');
          previewIds.push([...req.ids]);
          return { ok: true, value: makeStubBeachcomberPreview(req.ids) };
        },
        trash: async (req: BeachcomberTrashRequest) => {
          order.push('trash');
          trashIds.push([...req.ids]);
          const result: BeachcomberTrashResult = {
            trashed: [...req.ids],
            failed: [],
            refused: [],
            scan: makeStubBeachcomberScan(),
          };
          return { ok: true, value: result };
        },
      },
    });

    await mountWithPanel(user, api, 'beachcomber');
    await selectRow(user, ORPHAN_ROW);
    await selectRow(user, DECODED_ROW);
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    await flushPendingWork();
    await user.click(await screen.findByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm));
    await flushPendingWork();

    // PREVIEW-BEFORE-ACTION, ENFORCED AT THE BOUNDARY rather than in markup.
    // The design's rule is about what reaches main, so this is the level it is
    // checked at: the order of the two calls and the identity of their ids.
    expect(order).toEqual(['preview', 'trash']);
    expect(previewIds[0]).toEqual([ORPHAN_ROW, DECODED_ROW]);
    expect(trashIds[0]).toEqual(previewIds[0]);
  });

  it('sends only the ids the preview accepted, never the ones it refused', async () => {
    const user = fastUser();
    const trashIds: string[][] = [];
    const api = stubOrcastrateApi({
      beachcomber: {
        // The preview says no to one of the two. Main has already answered
        // that question; asking it again on the trash call would be asking
        // main to enforce its own refusal twice.
        preview: async (req: BeachcomberPreviewRequest) => {
          const accepted = req.ids.filter((id) => id !== DECODED_ROW);
          const value = makeStubBeachcomberPreview(accepted);
          value.refused.push({ id: DECODED_ROW, reason: 'Another process holds this directory.' });
          return { ok: true, value };
        },
        trash: async (req: BeachcomberTrashRequest) => {
          trashIds.push([...req.ids]);
          const result: BeachcomberTrashResult = {
            trashed: [...req.ids],
            failed: [],
            refused: [],
            scan: makeStubBeachcomberScan(),
          };
          return { ok: true, value: result };
        },
      },
    });

    await mountWithPanel(user, api, 'beachcomber');
    await selectRow(user, ORPHAN_ROW);
    await selectRow(user, DECODED_ROW);
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    await flushPendingWork();
    await user.click(await screen.findByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm));
    await flushPendingWork();

    // The refused id is still SELECTED — nothing about a refusal unticks a
    // box — so a trash built from the selection rather than from the preview
    // would carry it, and this is what notices.
    expect(trashIds).toEqual([[ORPHAN_ROW]]);
  });

  it('renders both halves of a partial trash, with the failure message verbatim', async () => {
    const user = fastUser();
    // The OS's own words. `beachcomber.ts` requires them unrewritten: "could
    // not delete" is not something a user can act on.
    const OS_MESSAGE = 'EPERM: operation not permitted, unlink';
    const api = stubOrcastrateApi({
      beachcomber: {
        trash: async (req: BeachcomberTrashRequest) => {
          const ids = [...req.ids];
          const failedId = ids[ids.length - 1] ?? '';
          const result: BeachcomberTrashResult = {
            trashed: ids.slice(0, -1),
            failed: [
              { id: failedId, displayPath: '~/.claude/shell-snapshots', message: OS_MESSAGE },
            ],
            refused: [],
            scan: makeStubBeachcomberScan(),
          };
          return { ok: true, value: result };
        },
      },
    });

    await mountWithPanel(user, api, 'beachcomber');
    await selectRow(user, ORPHAN_ROW);
    await selectRow(user, DECODED_ROW);
    await selectRow(user, SHELL_ROW);
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    await flushPendingWork();
    await user.click(await screen.findByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm));
    await flushPendingWork();

    // A PARTIAL SUCCESS MUST NOT READ AS A SUCCESS. Both halves, in one place.
    const summary = screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.resultSummary).textContent ?? '';
    expect(summary).toContain('Moved 2 items to the recycle bin.');
    expect(summary).toContain('1 item could not be moved');

    // One element per failure, so a second failure would be a second element
    // rather than a longer sentence.
    const failures = screen.getAllByTestId(PANEL_TEST_IDS.beachcomberResultFailure);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.textContent).toBe(OS_MESSAGE);
  });
});

describe('the Helm panel says what went wrong and keeps what the user typed', () => {
  it('shows the helm.scopes failure at helmError with the panel still there', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();
    api.failInvoke('helmScopes', ipcError('IO', 'the settings directory could not be listed'));

    await mountWithPanel(user, api, 'helm');

    const error = await screen.findByTestId(PANEL_TEST_IDS.helmError);
    expect(error.textContent).toContain('the settings directory could not be listed');
    expect(screen.getByTestId(PANEL_TEST_IDS.helmPanel)).toBeDefined();

    // REPORTED DEFECT, PINNED RATHER THAN BLESSED. A failed `helm:scopes` sets
    // `Loadable.error` AND `actionError` to the SAME sentence, and
    // `HelmNotices` only suppresses the duplicate when it equals `conflict` —
    // so the banner says it twice. `BeachcomberError` dedupes exactly this
    // case and Helm does not; the fix belongs in `helm/HelmNotices.tsx`, which
    // is not this task's file. The count is asserted so that fixing it makes
    // this assertion fail and this comment get deleted, rather than the
    // duplication quietly outliving everyone who noticed it.
    expect(within(error).getAllByText('the settings directory could not be listed')).toHaveLength(
      2,
    );
  });

  it('shows the helm.load failure at helmError and leaves the picker live to try again', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await mountWithPanel(user, api, 'helm');
    api.failInvoke('helmLoad', ipcError('IO', 'EACCES: permission denied, open'));
    await chooseScope(user, 'user');

    const error = screen.getByTestId(PANEL_TEST_IDS.helmError);
    expect(within(error).getByText('EACCES: permission denied, open')).toBeDefined();

    // THERE IS NO DRAFT TO KEEP: `panel-store.ts` clears `document` and `draft`
    // on a failed load, deliberately, so the form can never show one scope's
    // values under another scope's name. What must survive is the way out —
    // the picker stays live, and a retry is one change of the select away.
    expect(screen.getByTestId(PANEL_TEST_IDS.helmPanel)).toBeDefined();
    expect((screen.getByTestId(PANEL_TEST_IDS.helmScopeSelect) as HTMLSelectElement).disabled).toBe(
      false,
    );
    api.clearInvokeFailure('helmLoad');
    await chooseScope(user, 'project:pod-1');
    expect(screen.getByTestId(PANEL_TEST_IDS.helmModel)).toBeDefined();
  });

  it('shows the helm.save failure at helmError without losing a single typed character', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await mountWithPanel(user, api, 'helm');
    await chooseScope(user, 'user');

    const model = screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement;
    await user.clear(model);
    await user.type(model, 'claude-opus-4-9');
    await flushPendingWork();

    api.failInvoke('helmSave', ipcError('IO', 'ENOSPC: no space left on device, write'));
    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmSave));
    await flushPendingWork();

    const error = screen.getByTestId(PANEL_TEST_IDS.helmError);
    expect(within(error).getByText('ENOSPC: no space left on device, write')).toBeDefined();
    // THE DRAFT SURVIVES, verbatim, and is still savable.
    expect((screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement).value).toBe(
      'claude-opus-4-9',
    );
    expect((screen.getByTestId(PANEL_TEST_IDS.helmSave) as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders the conflict banner, keeps the draft, offers Reload, and lets a re-made edit save after it', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();
    const CONFLICT = 'The file changed on disk since Helm read it, so nothing was written.';

    await mountWithPanel(user, api, 'helm');
    await chooseScope(user, 'user');

    const model = screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement;
    await user.clear(model);
    await user.type(model, 'claude-opus-4-9');
    await flushPendingWork();

    api.failInvoke('helmSave', ipcError('CONFLICT', CONFLICT));
    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmSave));
    await flushPendingWork();

    // The conflict banner is the surface — not the generic error banner, which
    // stays out of the way rather than saying the same sentence twice.
    const banner = screen.getByTestId(PANEL_TEST_IDS.helmConflict);
    expect(within(banner).getByText(CONFLICT)).toBeDefined();
    expect(screen.queryByTestId(PANEL_TEST_IDS.helmError)).toBeNull();
    // Nothing was written, so nothing typed is lost, and Reload is offered.
    expect((screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement).value).toBe(
      'claude-opus-4-9',
    );
    const reload = screen.getByTestId(PANEL_TEST_IDS.helmReload) as HTMLButtonElement;
    expect(reload.disabled).toBe(false);

    // The advice the banner gives, followed: reload to take the current
    // contents, then make the change again. The second save IS the override,
    // and it is made after seeing what it would replace.
    await user.click(reload);
    await flushPendingWork();
    expect(screen.queryByTestId(PANEL_TEST_IDS.helmConflict)).toBeNull();
    expect((screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement).value).toBe(
      'claude-sonnet-4-6',
    );

    api.clearInvokeFailure('helmSave');
    const reloaded = screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement;
    await user.clear(reloaded);
    await user.type(reloaded, 'claude-opus-4-9');
    await flushPendingWork();
    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmSave));
    await flushPendingWork();

    expect(api.calls.helmSave).toHaveLength(2);
    expect(screen.getByTestId(PANEL_TEST_IDS.helmBackupPath)).toBeDefined();
    expect(screen.queryByTestId(PANEL_TEST_IDS.helmConflict)).toBeNull();
    expect(screen.queryByTestId(PANEL_TEST_IDS.helmError)).toBeNull();
  });
});

describe('a panel never reports a failure that is not its own (criterion 15)', () => {
  it('gives every channel a sentinel no other channel shares', () => {
    // The whole attribution argument rests on this. If two channels could
    // produce the same string, the sweep's `watch.seen` would stop naming one.
    const sentinels = INVOKE_KEYS.map(sentinelFor);
    expect(new Set(sentinels).size).toBe(INVOKE_KEYS.length);
  });

  it('leaves the Helm panel silent while only a Beachcomber channel is failing', async () => {
    const user = fastUser();
    const message = sentinelFor('beachcomberScan');
    const api = stubOrcastrateApi();
    api.failInvoke('beachcomberScan', ipcError('IO', message));

    // Helm first. Opening a panel is what the sweep does; if opening one were
    // enough to make a message appear, the classification would be worthless.
    await mountWithPanel(user, api, 'helm');
    await chooseScope(user, 'user');
    expect(screen.queryByTestId(PANEL_TEST_IDS.helmError)).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(message);

    // The same message, in the panel it belongs to.
    await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));
    await flushPendingWork();
    await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'beachcomber')));
    await flushPendingWork();
    expect(
      within(await screen.findByTestId(PANEL_TEST_IDS.beachcomberError)).getByText(message),
    ).toBeDefined();
  });

  it('resolves the layout cell and the panel section apart, so neither is mistaken for the other', async () => {
    const user = fastUser();
    await mountWithPanel(user, stubOrcastrateApi(), 'helm');

    // Two nested elements carry region ids: the layout's cell is unsuffixed,
    // the section inside it is suffixed with the panel key. Exact-string
    // lookups resolve both, and the suffixed one is the section that names the
    // panel — a substring selector would find two and fail.
    const cell = screen.getByTestId(PANEL_TEST_IDS.panelRegion);
    const section = screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'));
    expect(cell).not.toBe(section);
    expect(cell.contains(section)).toBe(true);
    expect(within(section).getByTestId(PANEL_TEST_IDS.helmPanel)).toBeDefined();
  });
});
