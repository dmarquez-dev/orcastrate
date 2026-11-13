/**
 * CONTRACT — Renderer component seams. Frozen at Gate 2.
 *
 * Boundary between the four renderer tasks, which build panes that nest inside
 * each other while running CONCURRENTLY:
 *
 *   T4  app shell + Pod bar + New Pod dialog   — composes the layout
 *   T5  state layer                             — supplies every view model
 *   T6  lane rail + transcript + dispatch card  — fills the center
 *   T7  composer + permission cards             — nests INSIDE T6's transcript
 *   T8  renderer test suite                     — drives all of it by TEST_IDS
 *
 * Only the props that cross a task boundary are here. A component's internal
 * props are its own business and must not be added to this file.
 *
 * COMPOSITION RULE: no component below fetches. Each is a pure function of its
 * props and of the hooks in `renderer-state.ts`. None of them imports
 * `window.orcastrate`.
 */

import type { ReactNode } from 'react';

import type { Lane, LaneId, NormalizedEvent, PermissionMode, PodId } from '@shared/contracts/events';
import type { SlashCommandInfo } from '@shared/contracts/ipc';
import type { RoutingMode } from '@shared/contracts/lane-router';
import type {
  ComposerState,
  LaneRowVm,
  PermissionCardVm,
  PodTabVm,
  TranscriptView,
} from './renderer-state';

// ---------------------------------------------------------------------------
// Shell layout (T4 owns; every other task fills a slot)
// ---------------------------------------------------------------------------

/**
 * The three regions of spec 5.1, as slots. T4 renders the frame and the
 * chrome; it never imports a component from T6 or T7 directly — it receives
 * them, which is what lets the three tasks land in any order.
 *
 * `split` is rendered if and only if it is non-null, and when rendered the
 * center region divides into two side-by-side transcript panes of equal width,
 * `primary` on the left.
 */
export interface WorkspaceLayoutProps {
  podBar: ReactNode;
  laneRail: ReactNode;
  primary: ReactNode;
  /**
   * The follower lane's pane. null when unsplit.
   *
   * UNCHANGED BY THE PANE-MODEL AMENDMENT — the slot is not renamed, removed,
   * or made optional. What changed is which lane feeds it: `App.tsx` passes
   * `followerLaneIds[0] ?? null` where it used to pass the pinned lane.
   */
  split: ReactNode | null;
  composer: ReactNode;
  /**
   * Rendered instead of rail/transcript/composer when there is no active Pod:
   * a first-run state whose only affordance is opening the New Pod dialog.
   */
  empty?: ReactNode;

  /**
   * AMENDMENT (sub-session 3, T4) — the panel region. Beachcomber and Helm had
   * literally nowhere to render: none of the six slots above is a panel. See
   * `renderer-panels.ts` for the three candidates and why a new region beat a
   * modal and a fourth Pod-bar tab.
   *
   * `panelBar` is a strip directly beneath the Pod bar and is ALWAYS present.
   *
   * BOTH NEW SLOTS ARE OPTIONAL, AND THAT IS A CONCESSION, NOT A DESIGN. A
   * required prop would make `WorkspaceLayout.tsx` and `App.tsx` fail to
   * compile the moment T4 lands and keep them red until T9 does — a
   * deliberately-broken intermediate state that makes a task unreviewable.
   *
   * T9 AND T10 ARE WHAT MAKE AN `undefined` VALUE A TEST FAILURE RATHER THAN A
   * VALID STATE: T9's acceptance criteria require the shell to pass both slots,
   * and T10's suite asserts that the region renders, that opening a panel hides
   * the transcript, and that closing it restores the previously selected lane.
   * Nothing here is optional because an absent panel bar is acceptable.
   *
   * No existing slot is renamed, removed, or made optional by this amendment,
   * and `TEST_IDS` is untouched — the panel ids live in `PANEL_TEST_IDS`.
   */
  panelBar?: ReactNode;
  /**
   * AMENDMENT (sub-session 3, T4). When non-null this REPLACES the body — rail,
   * transcript pane(s) and composer — leaving the Pod bar and the strip in
   * place, so the user can still see which Pod they will come back to. null (or
   * absent) means the workspace is showing. Optional for the reason given on
   * `panelBar` above.
   */
  panel?: ReactNode | null;
}

// ---------------------------------------------------------------------------
// Pod bar (T4)
// ---------------------------------------------------------------------------

export interface PodBarProps {
  tabs: PodTabVm[];
  onSelect(podId: PodId): void;
  /** Commits a drag. `orderedPodIds` is the FULL list in its new order. */
  onReorder(orderedPodIds: PodId[]): void;
  onNewPod(): void;
  onClose(podId: PodId): void;
}

// ---------------------------------------------------------------------------
// New Pod dialog (T4)
// ---------------------------------------------------------------------------

export interface NewPodDialogProps {
  open: boolean;
  onCancel(): void;
  /**
   * Called only with a validated draft: non-empty title, a `cwd` that came
   * from `pickDirectory`, and a `permissionMode` drawn from
   * `PERMISSION_MODE_OPTIONS`. Env overrides are optional.
   */
  onCreate(draft: NewPodDraft): void;
  /** Renders inside the dialog when creation failed; the dialog stays open. */
  error: string | null;
  submitting: boolean;
}

export interface NewPodDraft {
  title: string;
  /**
   * OPAQUE. Obtained ONLY from `actions.pickDirectory()`. The dialog shows it
   * as read-only text next to a Browse button. There is no text input for a
   * path anywhere in the renderer, and adding one is a security regression
   * (spec 3): the renderer never receives a path it can act on directly.
   */
  cwd: string;
  permissionMode: PermissionMode;
  envOverrides: Record<string, string>;
}

/**
 * THE BADGE MUST SAY WHAT IS TRUE. A Pod in `bypassPermissions` raises NO
 * permission cards at all: the SDK shadows `canUseTool` entirely and warns
 * `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`. A generic "be careful, this is
 * dangerous" badge is WRONG here, because it implies the user still gets asked
 * about the dangerous things. This exact sentence is the copy, and T8 asserts
 * it verbatim in both the dialog option and the persistent tab badge.
 */
export const BYPASS_PERMISSIONS_WARNING =
  'This Pod will never ask you about anything.';

export interface PermissionModeOption {
  mode: PermissionMode;
  label: string;
  summary: string;
  /** Requires an explicit confirmation step before the Pod is created. */
  danger: boolean;
}

/**
 * The permission modes the dialog offers, in display order.
 *
 * THIS FILE DOES NOT COMPILE UNTIL THE `PermissionMode` WIDENING (T1) LANDS:
 * `acceptEdits` is not a member of the frozen three-value union in
 * `events.ts`, and the annotation below is deliberately left to fail rather
 * than be cast away. T1 widens that union along with the runtime guard
 * (`src/main/pod/options.ts`), the IPC validator, and the SQLite CHECK
 * constraint, which is why every renderer task declares T1 in `dependsOn`.
 *
 * This array must hold exactly the widened union's members — no more, no
 * fewer. T8 asserts that by exhaustiveness over the union, not by counting.
 */
export const PERMISSION_MODE_OPTIONS: readonly PermissionModeOption[] = [
  {
    mode: 'default',
    label: 'Ask each time',
    summary: 'Every tool use raises a permission card in the lane that asked.',
    danger: false,
  },
  {
    mode: 'acceptEdits',
    label: 'Auto-accept edits',
    summary: 'File edits proceed without asking. Other tools still ask.',
    danger: false,
  },
  {
    mode: 'plan',
    label: 'Plan only',
    summary: 'Claude plans without executing tools.',
    danger: false,
  },
  {
    mode: 'bypassPermissions',
    label: 'Bypass permissions',
    summary: BYPASS_PERMISSIONS_WARNING,
    danger: true,
  },
];

// ---------------------------------------------------------------------------
// Lane rail (T6)
// ---------------------------------------------------------------------------

/**
 * DELETED: `onShowInFollower` and `onHideFollower`
 * (`contracts/lane-pin-removal.ts` section 1, item 4). The rail's pin button
 * was their only caller, and under the pane model `onSelect` -> `showLane`
 * ALREADY shows the lane in the follower pane — two controls one gesture apart
 * doing the same thing. Closing is offered by the follower pane's own
 * `PANE_TEST_IDS.transcriptUnpin`, which is where a user looks to dismiss what
 * is in front of them. The rail therefore takes TWO callbacks, not four.
 */
export interface LaneRailProps {
  rows: LaneRowVm[];
  /**
   * Wired to `showLane`. See `contracts/renderer-panes.ts` section 2, as
   * amended by `lane-pin-removal.ts` section 2: in 'inline' routing mode
   * `showLane` clears the lane's unread count and opens NO follower.
   */
  onSelect(laneId: LaneId): void;
  /**
   * Offered only when `steerPrefill(row.lane)` returns non-null — i.e. the
   * lane has an `agentId`. Prefills the POD composer; it does not send
   * (spec 5.3).
   */
  onSteer(laneId: LaneId): void;
  /**
   * 'inline' (spec 4.3 fallback) means every event carries the Matriarch's
   * laneId. The rail still lists lanes for status, but selecting a Calf does
   * not change the transcript contents, so the rail must not present selection
   * as if it filtered. Read from `WorkspaceStore.routingMode`; never hardcode.
   */
  routingMode: RoutingMode;
}

// ---------------------------------------------------------------------------
// Transcript (T6), with T7's permission cards nested inside it
// ---------------------------------------------------------------------------

export interface TranscriptPaneProps {
  lane: Lane | null;
  view: TranscriptView;
  /**
   * AMENDMENT (revision round 1, T6). The Pod's lane registry — pass
   * `PodSessionView.lanes.value?.map((row) => row.lane) ?? []`, which the state
   * layer snapshot-replaces on every `laneChanged` push.
   *
   * DO NOT DELETE THIS AND DERIVE THE LANES FROM `view.events` INSTEAD. That is
   * the bug this amendment exists to fix, and it fails silently:
   *
   *   - `view` is ONE lane's stream; `store.ts` buckets events by
   *     `event.laneId`.
   *   - `lane-router.ts` `materialize()` stamps a Calf's `lane_opened` with the
   *     NEW CALF's laneId, and `pod-manager.ts` deliberately does not redirect
   *     it onto the Matriarch.
   *
   * So the Matriarch's pane holds the dispatching `tool_use` but never the
   * matching `lane_opened`. An events-derived index is therefore ALWAYS empty
   * in production, and every dispatch card degrades to its count-only form with
   * no clickable rows — while unit tests that stamp a Calf's `lane_opened` with
   * the Matriarch's laneId pass. The registry is also the only source of a
   * lane's CURRENT status, which the per-agent rows must show.
   */
  lanes: Lane[];
  routingMode: RoutingMode;
  /** True for a FOLLOWER pane; it renders without the composer. */
  isSplit: boolean;
  /**
   * AMENDMENT (`contracts/renderer-panes.ts` section 5). Closes THIS pane.
   * Wired to `hideLane(podId, lane.id)`.
   *
   * MUST BE RENDERED WHEN, AND ONLY WHEN, `isSplit` is true and this is
   * non-null, on `PANE_TEST_IDS.transcriptUnpin`. The primary pane never
   * carries it: the Matriarch cannot be closed, and a control that closes
   * nothing is worse than no control.
   *
   * OPTIONAL FOR THE SAME COMPILE-TIME CONCESSION AS `LaneRailProps`' two new
   * callbacks: T3 owns `transcript/**`, T1 owns `App.tsx`, and they land
   * concurrently. T3's acceptance criteria are what make an absent control a
   * failure.
   */
  onHide?: () => void;
  /** Backfill affordance. Hidden when `hasMore` is false. */
  hasMore: boolean;
  onLoadMore(): void;
  /** Click-to-jump target from an inline dispatch card. */
  onJumpToLane(laneId: LaneId): void;
  /**
   * T7's permission cards, injected. They render INLINE, at the end of this
   * lane's event stream, inside the scroll container — never as a modal, and
   * never in a lane other than the one that asked (spec 5.4). T6 renders this
   * node and nothing about its contents.
   */
  permissionSlot: ReactNode;
}

/**
 * The inline dispatch card (spec 5.2): rendered at the position in the
 * Matriarch transcript where the `Agent` dispatch fired, so the main narrative
 * keeps its causality.
 *
 * The dispatch event is a `tool_use` payload whose `dispatchedLaneId` is set.
 * Note that the dispatch tool is named `Agent` in CLI 2.1.235 and `Task` in
 * older ones — a renderer that tests the tool NAME opens zero cards. Test
 * `payload.dispatchedLaneId !== undefined` instead; the router set it.
 */
export interface DispatchCardProps {
  /** The `tool_use` event that dispatched. */
  event: NormalizedEvent;
  /**
   * Lanes this dispatch opened, in rail order. Empty while the lane has not
   * materialized yet, and permanently empty in 'inline' routing mode — the
   * card renders "dispatched N agents" with no per-agent rows rather than
   * disappearing.
   */
  lanes: Lane[];
  onJumpToLane(laneId: LaneId): void;
}

// ---------------------------------------------------------------------------
// Composer (T7)
// ---------------------------------------------------------------------------

export interface ComposerProps {
  state: ComposerState;
  onChange(text: string): void;
  onSend(): void;
  /**
   * `Esc` while the composer has focus interrupts the ACTIVE Pod's turn
   * (spec 5.4). It does not clear the draft. Not called while the suggestion
   * list is open: Esc then closes the list instead.
   */
  onInterrupt(): void;
  /**
   * The active Pod's slash commands, in the order the Pod reported them. The
   * composer offers them as suggestions above the textarea, by these rules:
   *
   * - OPEN when all of these hold: the composer is not `disabled`; `text`
   *   matches /^\/(\S*)$/, meaning a leading `/` with no whitespace after it
   *   anywhere; at least one command matches; and the list has not been
   *   dismissed since the text last changed.
   * - MATCH: a command matches when `name.startsWith(p)` or some
   *   `aliases[i].startsWith(p)`, where `p` is the captured text after `/`.
   *   Case-sensitive. For `text === '/'`, `p` is `''` and every command matches.
   * - SHOWN: the first 5 matches, in the order of `commands`. Never more than 5.
   * - Each row shows `/` + `name` and, separately, `description`. No other
   *   text, and nothing that says a command will run.
   * - ArrowDown and ArrowUp move the selection and wrap at both ends. Row 0 is
   *   selected whenever the list opens or the set of shown rows changes.
   * - Tab or Enter ACCEPTS the selected row. It calls
   *   `onChange('/' + name + ' ')` (the canonical `name`, even when an alias
   *   matched), calls neither `onSend` nor `onInterrupt`, and the list then
   *   closes because the text contains a space.
   * - Pressing (mousedown on) a row accepts that row in the same way.
   * - Escape CLOSES the list and calls neither `onInterrupt` nor `onChange`.
   * - While the list is closed, every key does what it does at base: Enter
   *   sends, Shift+Enter adds a line, Escape calls `onInterrupt`, and Tab is
   *   not intercepted.
   */
  commands: readonly SlashCommandInfo[];
}

// ---------------------------------------------------------------------------
// Permission cards (T7)
// ---------------------------------------------------------------------------

export interface PermissionCardListProps {
  cards: PermissionCardVm[];
  onRespond(req: PermissionRespondArgs): void;
}

export interface PermissionRespondArgs {
  podId: PodId;
  requestId: string;
  decision: 'allow' | 'allow_always' | 'deny';
  /**
   * REQUIRED when `decision === 'deny'`. The card must not enable its Deny
   * button until the reason field is non-empty — main answers
   * `INVALID_ARGUMENT` otherwise, and a card that lets the user click and then
   * shows an error has wasted the interaction.
   */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Test ids
// ---------------------------------------------------------------------------

/**
 * The seam between the three component tasks and T8, which writes the tests
 * WITHOUT having seen their markup. Each component sets `data-testid` to the
 * value here on the named element. Adding an id is a contract change; adding
 * an id NOT listed here for a component's internal use is fine, as long as it
 * does not collide with one of these.
 */
export const TEST_IDS = {
  workspace: 'workspace',
  podBar: 'pod-bar',
  /** One per tab. Suffix with the PodId: `pod-tab:<podId>`. */
  podTab: 'pod-tab',
  /** The pending-permission badge on a Pod tab. `pod-tab-permission:<podId>`. */
  podTabPermissionBadge: 'pod-tab-permission',
  podTabBypassBadge: 'pod-tab-bypass',
  newPodButton: 'new-pod-button',
  newPodDialog: 'new-pod-dialog',
  newPodTitleInput: 'new-pod-title',
  newPodBrowseButton: 'new-pod-browse',
  newPodCwdDisplay: 'new-pod-cwd',
  /** One per mode: `new-pod-mode:<mode>`. */
  newPodModeOption: 'new-pod-mode',
  newPodBypassWarning: 'new-pod-bypass-warning',
  newPodSubmit: 'new-pod-submit',
  laneRail: 'lane-rail',
  /** `lane-row:<laneId>`. */
  laneRow: 'lane-row',
  laneRowUnread: 'lane-row-unread',
  laneRowSteer: 'lane-row-steer',
  transcriptPrimary: 'transcript-primary',
  transcriptSplit: 'transcript-split',
  /** `transcript-event:<seq>`. */
  transcriptEvent: 'transcript-event',
  transcriptLoadMore: 'transcript-load-more',
  dispatchCard: 'dispatch-card',
  dispatchCardAgent: 'dispatch-card-agent',
  composer: 'composer',
  composerInput: 'composer-input',
  composerSend: 'composer-send',
  /** `permission-card:<requestId>`. */
  permissionCard: 'permission-card',
  permissionAllow: 'permission-allow',
  permissionAllowAlways: 'permission-allow-always',
  permissionDeny: 'permission-deny',
  permissionDenyReason: 'permission-deny-reason',
} as const;

/**
 * AMENDMENT (`contracts/renderer-panes.ts` section 7). ADDED by T1 in ONE
 * edit, so T2, T3, T4 and T5 never race for the same object. No other task
 * edits this file.
 */
export const PANE_TEST_IDS = {
  /** The follower pane's own unpin control. Rendered only when `isSplit`. */
  transcriptUnpin: 'transcript-unpin',
  /** The finished-lane disclosure in the rail. Carries the count. */
  laneRailFinishedToggle: 'lane-rail-finished-toggle',
  /** The container holding the collapsed rows. Absent while collapsed. */
  laneRailFinishedGroup: 'lane-rail-finished-group',
} as const;

/**
 * AMENDMENT (`contracts/transcript-filter.ts`). ADDED by T1 in the same edit,
 * for the same reason.
 */
export const TRANSCRIPT_FILTER_TEST_IDS = {
  /**
   * The toggle button. Suffix with the pane: `transcript-filter:primary` and
   * `transcript-filter:split`, using `testId`, because both panes render one
   * and a bare id would be ambiguous.
   */
  transcriptFilter: 'transcript-filter',
  /** The element carrying the hidden count. Absent when the count is 0. */
  transcriptFilterCount: 'transcript-filter-count',
} as const;

/** `testId(TEST_IDS.podTab, podId)` -> `"pod-tab:<podId>"`. */
export declare function testId(base: string, suffix?: string): string;
