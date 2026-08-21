import type {
  EventPayload,
  Lane,
  LaneId,
  NormalizedEvent,
  Seq,
} from '@shared/contracts/events';

import type { TranscriptView } from '../contracts/renderer-state';

/**
 * MATCH THE PRODUCER, NOT THE CONVENIENT DEFAULT. `lane-router.ts`
 * `materialize()` stamps a `lane_opened` with the NEW lane's own id, and
 * `pod-manager.ts` deliberately does not redirect it onto the Matriarch. A
 * fixture that defaulted every event — a Calf's `lane_opened` included — to
 * `'lane-matriarch'` contradicted that, and hid the fact that the dispatch
 * card's events-derived lane index is always empty in production.
 *
 * So `lane_opened` derives its laneId from the lane it opens. Everything else
 * keeps the Matriarch default; `overrides.laneId` still wins.
 */
export function makeEvent(
  seq: Seq,
  payload: EventPayload,
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    id: seq,
    podId: 'pod-1',
    laneId: payload.type === 'lane_opened' ? payload.lane.id : 'lane-matriarch',
    seq,
    type: payload.type,
    payload,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * A dispatch event. `name` is a PARAMETER on purpose: the tool is `Agent` on
 * CLI 2.1.235 and `Task` on older ones, and the point of the dispatch tests is
 * that the renderer does not look at this value at all.
 */
export function makeDispatchEvent(
  seq: Seq,
  name: string,
  dispatchedLaneId: LaneId,
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return makeEvent(
    seq,
    {
      type: 'tool_use',
      toolUseId: `toolu_${seq}`,
      name,
      input: { subagent_type: 'reviewer', description: 'Review the diff' },
      dispatchedLaneId,
    },
    overrides,
  );
}

/**
 * THE 2026-08-20 FIRST RUN, IN PROPORTION. This is the stream the noise filter
 * is sized against, and the reason a three-event fixture proves nothing about
 * it: that Pod stored 109 events, 53 of them `system`, against 11
 * `assistant_text`. A first-run Pod fills its Matriarch lane with hook plumbing
 * before the model says anything.
 *
 * The measured subtype histogram is `hook_started` 10, `hook_progress` 8,
 * `task_progress` 8, `hook_response` 6, `thinking_tokens` 5, `init` 4,
 * `result` 4, `rate_limit_event` 2 — which accounts for 47 of the 53. The
 * remaining 6 are emitted as an UNNAMED subtype on purpose: the filter is
 * keyed on the event TYPE and never on the subtype, so an unfamiliar subtype
 * must be hidden exactly like a familiar one.
 *
 * Seqs interleave rather than arriving in type blocks, so a filter that
 * appended restored events at the end would be visible against it.
 */
export const FIRST_RUN_SYSTEM_SUBTYPES: readonly [string, number][] = [
  ['hook_started', 10],
  ['hook_progress', 8],
  ['task_progress', 8],
  ['hook_response', 6],
  ['thinking_tokens', 5],
  ['init', 4],
  ['result', 4],
  ['rate_limit_event', 2],
  ['some_subtype_this_build_has_never_seen', 6],
];

export function makeFirstRunEvents(): NormalizedEvent[] {
  const systemPayloads: EventPayload[] = [];
  for (const [subtype, count] of FIRST_RUN_SYSTEM_SUBTYPES) {
    for (let i = 0; i < count; i += 1) {
      systemPayloads.push({ type: 'system', subtype, data: { i } });
    }
  }

  const others: EventPayload[] = [
    { type: 'thinking', text: 'pondering' },
    { type: 'lane_opened', lane: makeCalf('lane-calf-1') },
    { type: 'lane_closed', laneId: 'lane-calf-1', status: 'done' },
    { type: 'error', message: 'the process died', exitCode: 137 },
    { type: 'malformed', rawLine: '{not json', parseError: 'Unexpected token' },
  ];
  for (let i = 0; i < 11; i += 1) {
    others.push({ type: 'assistant_text', text: `assistant turn ${i + 1}` });
  }

  // Interleave: roughly five system rows for every one of everything else,
  // which is about the ratio the run actually produced.
  const payloads: EventPayload[] = [];
  let s = 0;
  let o = 0;
  while (s < systemPayloads.length || o < others.length) {
    for (let k = 0; k < 5 && s < systemPayloads.length; k += 1) payloads.push(systemPayloads[s++]!);
    if (o < others.length) payloads.push(others[o++]!);
  }

  return payloads.map((payload, i) => makeEvent(i + 1, payload));
}

/**
 * The startup-reconciliation notice, in the EXACT shape
 * `pod-manager.ts` `#appendReconciliationEvents` writes it: `type: 'system'`,
 * `subtype: STARTUP_RECONCILIATION_SUBTYPE`, and a `data` carrying the same
 * string again as `subtypeMarker` (`startup-reconciliation.ts`,
 * `StartupReconciliationData`).
 *
 * A fixture that stamped only one of the two carriers would let the filter's
 * exemption pass while the real notice stayed hidden, so both are here.
 */
export const STARTUP_RECONCILIATION_REASON =
  'Orcastrate restarted while this Pod was still open. No Claude Code process ' +
  'survives an application restart, so lanes left running were marked ' +
  'Orphaned. Press Open to start this Pod again.';

export function makeReconciliationEvent(
  seq: Seq,
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return makeEvent(
    seq,
    {
      type: 'system',
      subtype: 'startup_reconciliation',
      data: {
        subtypeMarker: 'startup_reconciliation',
        reason: STARTUP_RECONCILIATION_REASON,
        statusBefore: 'running',
        statusAfter: 'closed',
        orphanedLaneIds: ['lane-matriarch', 'lane-calf-1'],
        at: '2026-01-02T00:00:00.000Z',
      },
    },
    overrides,
  );
}

export function makeView(events: NormalizedEvent[], overrides: Partial<TranscriptView> = {}): TranscriptView {
  const last = events.at(-1);
  return {
    laneId: 'lane-matriarch',
    events,
    phase: 'ready',
    error: null,
    highWaterSeq: last === undefined ? 0 : last.seq,
    ...overrides,
  };
}

export function makeLane(overrides: Partial<Lane> = {}): Lane {
  return {
    id: 'lane-matriarch',
    podId: 'pod-1',
    kind: 'matriarch',
    toolUseId: null,
    agentId: null,
    parentLaneId: null,
    depth: 0,
    subagentType: null,
    description: null,
    status: 'running',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
}

export function makeCalf(id: LaneId, overrides: Partial<Lane> = {}): Lane {
  return makeLane({
    id,
    kind: 'calf',
    toolUseId: `toolu_${id}`,
    agentId: `agent_${id}`,
    parentLaneId: 'lane-matriarch',
    depth: 1,
    subagentType: 'reviewer',
    description: `work for ${id}`,
    ...overrides,
  });
}

/**
 * Give a jsdom element real scroll geometry.
 *
 * jsdom performs no layout: `scrollHeight` and `clientHeight` are hard-coded to
 * 0 and the `scrollTop` setter is a no-op. Scroll BEHAVIOUR is therefore
 * untestable until the three are backed by something, so they are defined on
 * the instance — `scrollTop` as a real read/write cell so the component's
 * writes are observable.
 */
export function stubScrollGeometry(
  el: HTMLElement,
  geometry: { scrollHeight: number; clientHeight: number; scrollTop?: number },
): void {
  let scrollTop = geometry.scrollTop ?? 0;
  Object.defineProperty(el, 'scrollHeight', { value: geometry.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: geometry.clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (next: number) => {
      scrollTop = next;
    },
  });
}
