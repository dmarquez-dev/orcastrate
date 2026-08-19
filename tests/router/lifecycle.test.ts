/**
 * Design-spec section 9 — CALF CLOSE ON THE TERMINAL SIGNAL, and ORPHANED
 * DETECTION AT A TURN BOUNDARY.
 *
 * ---------------------------------------------------------------------------
 * Why "the terminal signal" and not "the tool_result"
 * ---------------------------------------------------------------------------
 * Spec 9 says "Calf close on `tool_result`" and spec 8 says "a Calf with no
 * `tool_result`". Both were written before the protocol was measured, and the
 * measurement contradicts them:
 *
 *   findings.json fixtures[3] / README "Caveat on 04-orphaned-calf.ndjson":
 *   CLI 2.1.235 answers EVERY tool_use before the turn's `result` — including
 *   on interrupt, which yields a synthetic `is_error` result. For a BACKGROUND
 *   dispatch the dispatching `Agent` tool_use is answered by a launch
 *   acknowledgement ("Async agent launched successfully") while the Calf is
 *   still running.
 *
 * Two consequences this file encodes:
 *
 *   1. A Calf closes on the terminal task signal (`system/task_updated` with a
 *      terminal `patch.status`), NOT on the dispatching `tool_result`.
 *      03-tool-result-close.ndjson is the positive control: the close must land
 *      on the terminal `task_updated` and must NOT land on the dispatching
 *      `tool_result` that follows it.
 *   2. The Orphaned test asserts "a lane opened by `task_started` with no
 *      terminal `task_updated` when the `result` arrives". Asserting "a
 *      tool_use with no tool_result" would pass VACUOUSLY against this CLI and
 *      prove nothing — 04's dispatching tool_use IS answered.
 *
 * Everything below is located by SEARCHING the capture for those messages, so
 * no assertion depends on a line number that a re-capture could shift.
 */

import { describe, expect, it } from 'vitest';

import type { Lane, NewEvent } from '../../src/shared/contracts/events';
import {
  calves,
  discoveredFixtureFiles,
  findingFor,
  fixtureMessages,
  makeRouter,
  fixtureLines,
  replay,
} from './helpers';

const CLOSE = '03-tool-result-close.ndjson';
const ORPHAN = '04-orphaned-calf.ndjson';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'error', 'cancelled', 'canceled', 'aborted', 'stopped', 'killed']);

type Message = Record<string, unknown> | null;

function isTerminalTaskUpdate(message: Message): boolean {
  if (message === null || message['type'] !== 'system') return false;
  if (message['subtype'] !== 'task_updated') return false;
  const patch = message['patch'];
  if (typeof patch !== 'object' || patch === null) return false;
  return TERMINAL_STATUSES.has(String((patch as Record<string, unknown>)['status']));
}

/** 1-based line of the first `Agent` tool_use, and its id. */
function dispatch(file: string): { line: number; toolUseId: string } {
  const messages = fixtureMessages(file);
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message === null || message === undefined || message['type'] !== 'assistant') continue;
    const inner = message['message'] as { content?: unknown } | undefined;
    const blocks = (Array.isArray(inner?.content) ? inner.content : []) as Record<string, unknown>[];
    for (const block of blocks) {
      if (block['type'] === 'tool_use' && (block['name'] === 'Agent' || block['name'] === 'Task')) {
        return { line: i + 1, toolUseId: block['id'] as string };
      }
    }
  }
  throw new Error(`${file} contains no Agent dispatch`);
}

/** 1-based line of the `tool_result` answering `toolUseId`, or -1. */
function toolResultLine(file: string, toolUseId: string): number {
  const messages = fixtureMessages(file);
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message === null || message === undefined || message['type'] !== 'user') continue;
    const inner = message['message'] as { content?: unknown } | undefined;
    const blocks = (Array.isArray(inner?.content) ? inner.content : []) as Record<string, unknown>[];
    if (blocks.some((block) => block['tool_use_id'] === toolUseId)) return i + 1;
  }
  return -1;
}

function closesOnLine(perLine: NewEvent[][], line: number): NewEvent[] {
  return (perLine[line - 1] ?? []).filter((event) => event.type === 'lane_closed');
}

describe('Calf close on the terminal signal (spec 9)', () => {
  it('03: the capture has a terminal task_updated followed by the dispatching tool_result', () => {
    // The shape the positive control depends on. If a re-capture reordered
    // these, the test below would stop distinguishing anything.
    const messages = fixtureMessages(CLOSE);
    const terminalLine = messages.findIndex(isTerminalTaskUpdate) + 1;
    const { toolUseId } = dispatch(CLOSE);
    const resultLine = toolResultLine(CLOSE, toolUseId);

    expect(terminalLine).toBeGreaterThan(0);
    expect(resultLine).toBeGreaterThan(0);
    expect(terminalLine).toBeLessThan(resultLine);
  });

  it('03: the lane closes on the terminal task_updated', () => {
    const replayed = replay(CLOSE);
    const terminalLine = fixtureMessages(CLOSE).findIndex(isTerminalTaskUpdate) + 1;
    const closes = closesOnLine(replayed.perLine, terminalLine);

    expect(closes).toHaveLength(1);
    const payload = closes[0]!.payload as { laneId: string; status: string };
    expect(payload.status).toBe('done');
    expect(payload.laneId).toBe(replayed.router.getLaneByToolUseId(dispatch(CLOSE).toolUseId)!.id);
  });

  it('03: the lane does NOT close on the dispatching tool_result', () => {
    // The half that separates a correct router from one that would make the
    // Orphaned test below vacuous.
    const replayed = replay(CLOSE);
    const { toolUseId } = dispatch(CLOSE);
    const resultLine = toolResultLine(CLOSE, toolUseId);

    expect(closesOnLine(replayed.perLine, resultLine)).toHaveLength(0);
  });

  it('03: the closed lane reports done, with a start and an end', () => {
    const replayed = replay(CLOSE);
    const lane = calves(replayed.lanes)[0]!;

    expect(lane.status).toBe('done');
    // Structure only: that an end time EXISTS, never what it says.
    expect(lane.startedAt).toBeTruthy();
    expect(lane.endedAt).toBeTruthy();
    expect(replayed.boundary).toHaveLength(0);
  });

  it.each(discoveredFixtureFiles())(
    '%s closes a Calf as done exactly when the capture carries its terminal signal',
    (file) => {
      const messages = fixtureMessages(file);
      const terminalAgentIds = new Set(
        messages
          .filter(isTerminalTaskUpdate)
          .map((message) => String((message as Record<string, unknown>)['task_id'])),
      );

      const replayed = replay(file);
      for (const lane of calves(replayed.lanes)) {
        const expected = terminalAgentIds.has(String(lane.agentId)) ? 'done' : 'orphaned';
        expect(lane.status, `${file}: lane for agent ${lane.agentId}`).toBe(expected);
      }
    },
  );
});

describe('Orphaned detection at a turn boundary (spec 9, criterion 2)', () => {
  it('04 is the background-dispatch orphan findings.json describes', () => {
    expect(findingFor(ORPHAN).orphanCondition).toBe('lane-open-at-result');
  });

  it('04: the dispatching tool_use IS answered — so "no tool_result" would be vacuous', () => {
    // Stated as an assertion rather than a comment: this is the trap. CLI
    // 2.1.235 answers every tool_use before the turn's result, here with a mere
    // launch acknowledgement.
    const { toolUseId } = dispatch(ORPHAN);
    expect(toolResultLine(ORPHAN, toolUseId)).toBeGreaterThan(0);
  });

  it('04: the capture carries NO terminal task signal at all', () => {
    const messages = fixtureMessages(ORPHAN);
    expect(messages.filter(isTerminalTaskUpdate)).toHaveLength(0);
    expect(
      messages.filter(
        (message) => message !== null && message['subtype'] === 'task_notification',
      ),
    ).toHaveLength(0);
  });

  it('04: the lane is opened by system/task_started, correlated by tool_use_id', () => {
    const messages = fixtureMessages(ORPHAN);
    const started = messages.find(
      (message) => message !== null && message['subtype'] === 'task_started',
    )!;
    const replayed = replay(ORPHAN);
    const lane = replayed.router.getLaneByToolUseId(started['tool_use_id'] as string);

    expect(lane).not.toBeNull();
    expect(lane!.kind).toBe('calf');
    expect(lane!.agentId).toBe(started['task_id']);
  });

  it('04: the lane is still running when the result message arrives', () => {
    // Replayed a line at a time so the state AT the result is observable,
    // rather than only the post-boundary state.
    const router = makeRouter();
    const lines = fixtureLines(ORPHAN);
    const messages = fixtureMessages(ORPHAN);
    const resultLine = messages.findIndex((message) => message !== null && message['type'] === 'result') + 1;

    expect(resultLine).toBeGreaterThan(0);

    const duringTurn: NewEvent[] = [];
    for (const line of lines) duringTurn.push(...router.ingest(line));

    expect(
      duringTurn.filter((event) => event.type === 'lane_closed'),
      'nothing in the turn itself may close a background Calf',
    ).toHaveLength(0);

    const calf = router.lanes().find((lane: Lane) => lane.kind === 'calf')!;
    expect(calf.status).toBe('running');
    expect(calf.endedAt).toBeNull();
  });

  /**
   * THE ORPHAN ASSERTION.
   *
   * A lane opened by `system/task_started`, with no terminal
   * `system/task_updated` anywhere before the turn's `result`, is still running
   * when the turn ends and is closed as `orphaned` by `onTurnBoundary()` — and
   * by nothing earlier.
   */
  it('04: onTurnBoundary closes the un-terminated lane as orphaned', () => {
    const replayed = replay(ORPHAN);
    const calf = calves(replayed.lanes)[0]!;

    expect(replayed.events.filter((event) => event.type === 'lane_closed')).toHaveLength(0);
    expect(replayed.boundary).toHaveLength(1);

    const payload = replayed.boundary[0]!.payload as { laneId: string; status: string };
    expect(replayed.boundary[0]!.type).toBe('lane_closed');
    expect(payload.status).toBe('orphaned');
    expect(payload.laneId).toBe(calf.id);
    expect(calf.status).toBe('orphaned');
    expect(calf.endedAt).toBeTruthy();
  });

  it('04: onTurnBoundary is idempotent — a second turn orphans nothing again', () => {
    const router = makeRouter();
    for (const line of fixtureLines(ORPHAN)) router.ingest(line);

    expect(router.onTurnBoundary()).toHaveLength(1);
    expect(router.onTurnBoundary()).toHaveLength(0);
  });

  it('04: exercises lane LIFECYCLE only — the capture forwards no subagent content', () => {
    // findings.json fixtures[3]: "this capture contains 0 subagent-originated
    // messages". Guarding it keeps the lifecycle test honest, and stops a future
    // re-capture from quietly turning this into a content test.
    const subagentMessages = fixtureMessages(ORPHAN).filter(
      (message) => message !== null && typeof message['parent_tool_use_id'] === 'string',
    );
    expect(subagentMessages).toHaveLength(0);

    const replayed = replay(ORPHAN);
    const calf = calves(replayed.lanes)[0]!;
    const onCalf = replayed.events.filter((event) => event.laneId === calf.id);
    expect(onCalf.map((event) => event.type)).toEqual(['lane_opened']);
  });

  it.each(discoveredFixtureFiles())(
    '%s leaves no Calf running once the turn boundary has passed',
    (file) => {
      const replayed = replay(file);
      for (const lane of calves(replayed.lanes)) {
        expect(lane.status, `${file}: ${lane.id} never resolved`).not.toBe('running');
      }
    },
  );
});
