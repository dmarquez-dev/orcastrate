/**
 * Local slash-command output, and the result text of a turn that bypassed the
 * model loop, rendered as Matriarch `assistant_text`.
 *
 * Two mappings, both resting on the SDK's own declarations rather than on a
 * capture (no fixture in `tests/fixtures/protocol` records a slash command):
 *
 *   1. `system`/`local_command_output` — `SDKLocalCommandOutputMessage`, which
 *      the SDK describes as "Displayed as assistant-style text in the
 *      transcript". A non-empty string `content` becomes one Matriarch
 *      `assistant_text` in place of the `system` event; anything else keeps the
 *      `system` event it always produced.
 *   2. A `result` whose `terminal_reason` is unset — `TerminalReason` is "Unset
 *      when the loop was bypassed (local slash command)". When it is a
 *      non-error `success` with a non-empty `result` string, and no Matriarch
 *      `assistant_text` was emitted since the previous `result`, that string is
 *      emitted as a Matriarch `assistant_text` BEFORE the unchanged
 *      `system` `result:success` event. The second half of that test is what
 *      keeps a CLI that never sends `terminal_reason` from showing every reply
 *      twice: a turn that ran the model loop has already produced its text.
 */

import { describe, expect, it } from 'vitest';

import type { NewEvent } from '../../src/shared/contracts/events';
import {
  MATRIARCH_LANE_ID,
  discoveredFixtureFiles,
  makeRouter,
  replay,
} from './helpers';

const LOCAL_OUTPUT_TEXT = 'Context: 12k tokens';
const BYPASSED_RESULT_TEXT = "/theme isn't available in this environment.";

function localOutput(content?: unknown): Record<string, unknown> {
  const message: Record<string, unknown> = {
    type: 'system',
    subtype: 'local_command_output',
    uuid: 'uuid-local-1',
    session_id: 'session-1',
  };
  if (content !== undefined) message['content'] = content;
  return message;
}

/** A `result` shaped like a bypassed-loop turn: success, no `terminal_reason`. */
function bypassedResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: BYPASSED_RESULT_TEXT,
    uuid: 'uuid-result-1',
    session_id: 'session-1',
    ...overrides,
  };
}

function assistantText(text: string, parentToolUseId: string | null = null): Record<string, unknown> {
  return {
    type: 'assistant',
    parent_tool_use_id: parentToolUseId,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

function ofType(events: NewEvent[], type: NewEvent['type']): NewEvent[] {
  return events.filter((event) => event.type === type);
}

function expectOnlyResultSuccess(events: NewEvent[], message: unknown): void {
  expect(events).toHaveLength(1);
  expect(events[0]!.type).toBe('system');
  expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
  expect(events[0]!.payload).toEqual({ type: 'system', subtype: 'result:success', data: message });
}

// ---------------------------------------------------------------------------
// local_command_output
// ---------------------------------------------------------------------------

describe('system/local_command_output', () => {
  it('lanes mode: non-empty content yields exactly one Matriarch assistant_text carrying it', () => {
    const router = makeRouter({ mode: 'lanes' });
    const message = localOutput(LOCAL_OUTPUT_TEXT);

    const events = router.ingest(message);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('assistant_text');
    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
    expect(events[0]!.payload).toEqual({ type: 'assistant_text', text: LOCAL_OUTPUT_TEXT });
    expect(events[0]!.raw).toBe(message);
  });

  it('inline mode: non-empty content yields exactly one Matriarch assistant_text', () => {
    const router = makeRouter({ mode: 'inline' });

    const events = router.ingest(localOutput(LOCAL_OUTPUT_TEXT));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('assistant_text');
    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['a number', 42],
    ['null', null],
  ])('content that is %s keeps the one system event with subtype local_command_output', (_label, content) => {
    const router = makeRouter();
    const message = localOutput(content);

    const events = router.ingest(message);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('system');
    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
    expect(events[0]!.payload).toEqual({ type: 'system', subtype: 'local_command_output', data: message });
  });
});

// ---------------------------------------------------------------------------
// result of a turn that bypassed the model loop
// ---------------------------------------------------------------------------

describe('result with no terminal_reason (bypassed model loop)', () => {
  it('with no Matriarch text since the router was built, yields assistant_text then the result:success system event', () => {
    const router = makeRouter();
    const message = bypassedResult();

    const events = router.ingest(message);

    expect(events.map((event) => event.type)).toEqual(['assistant_text', 'system']);
    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
    expect(events[0]!.payload).toEqual({ type: 'assistant_text', text: BYPASSED_RESULT_TEXT });
    expect(events[0]!.raw).toBe(message);
    expect(events[1]!.laneId).toBe(MATRIARCH_LANE_ID);
    expect(events[1]!.payload).toEqual({ type: 'system', subtype: 'result:success', data: message });
  });

  it('with terminal_reason "completed" yields only the result:success system event', () => {
    const router = makeRouter();
    const message = bypassedResult({ terminal_reason: 'completed' });

    expectOnlyResultSuccess(router.ingest(message), message);
  });

  it('after a Matriarch assistant text block yields only the result:success system event', () => {
    const router = makeRouter();
    const reply = router.ingest(assistantText('a model reply'));
    expect(ofType(reply, 'assistant_text').map((event) => event.laneId)).toEqual([MATRIARCH_LANE_ID]);

    const message = bypassedResult();
    expectOnlyResultSuccess(router.ingest(message), message);
  });

  it('after an assistant text block routed to a Calf lane still yields the assistant_text', () => {
    const router = makeRouter({ mode: 'lanes' });
    const dispatch = router.ingest({
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu-calf-1',
            name: 'Agent',
            input: { subagent_type: 'general-purpose', description: 'calf work' },
          },
        ],
      },
    });
    const calfLaneId = ofType(dispatch, 'lane_opened')[0]!.laneId;
    expect(calfLaneId).not.toBe(MATRIARCH_LANE_ID);

    const calfText = router.ingest(assistantText('calf narration', 'tu-calf-1'));
    expect(ofType(calfText, 'assistant_text').map((event) => event.laneId)).toEqual([calfLaneId]);

    const message = bypassedResult();
    const events = router.ingest(message);

    expect(events.map((event) => event.type)).toEqual(['assistant_text', 'system']);
    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
    expect(events[0]!.payload).toEqual({ type: 'assistant_text', text: BYPASSED_RESULT_TEXT });
  });

  it('after a local_command_output with content, the two ingests yield exactly one assistant_text, the local output', () => {
    const router = makeRouter();

    const events = [...router.ingest(localOutput(LOCAL_OUTPUT_TEXT)), ...router.ingest(bypassedResult())];

    const texts = ofType(events, 'assistant_text');
    expect(texts).toHaveLength(1);
    expect(texts[0]!.payload).toEqual({ type: 'assistant_text', text: LOCAL_OUTPUT_TEXT });
  });

  it('the Matriarch-text suppression resets at each result: turn 1 adds none, turn 2 adds one', () => {
    const router = makeRouter();

    router.ingest(assistantText('turn 1 reply'));
    const turn1 = router.ingest(bypassedResult());
    expect(ofType(turn1, 'assistant_text')).toHaveLength(0);

    const turn2 = router.ingest(bypassedResult());
    expect(ofType(turn2, 'assistant_text')).toHaveLength(1);
    expect(turn2[0]!.payload).toEqual({ type: 'assistant_text', text: BYPASSED_RESULT_TEXT });
  });

  it.each([
    ['empty', ''],
    ['a number', 42],
    ['null', null],
  ])('a result field that is %s yields only the result:success system event', (_label, result) => {
    const router = makeRouter();
    const message = bypassedResult({ result });

    expectOnlyResultSuccess(router.ingest(message), message);
  });

  it('is_error true yields exactly the one error event and no assistant_text', () => {
    const router = makeRouter();
    const message = bypassedResult({ subtype: 'error_during_execution', is_error: true });

    const events = router.ingest(message);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('error');
    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
    expect(events[0]!.payload).toEqual({ type: 'error', message: BYPASSED_RESULT_TEXT, exitCode: null });
  });
});

// ---------------------------------------------------------------------------
// The captured corpus
// ---------------------------------------------------------------------------

describe('fixture corpus', () => {
  it.each(discoveredFixtureFiles())(
    '%s produces no assistant_text from a result or a local_command_output message',
    (file) => {
      const replayed = replay(file);
      const offenders = ofType(replayed.events, 'assistant_text').filter((event) => {
        const raw = event.raw as Record<string, unknown> | undefined;
        return raw?.['type'] === 'result' || raw?.['subtype'] === 'local_command_output';
      });
      expect(offenders).toEqual([]);
    },
  );
});
