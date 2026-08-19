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
