/**
 * The user's typed prompt as a durable event, and the echo guard that stops an
 * SDK echo from doubling the turn.
 *
 * ASSERTED AT THE STORE, OVER THE REAL PIPELINE. This suite uses the assembled
 * harness — the production `LaneRouter`, the production `PodRunner`, a real
 * `:memory:` SQLite store — because the defect it covers survived 1731 tests
 * that all stopped short of the store. A spy on `appendMany`, a recorded push
 * argument, or a runner double configured to append would each have passed
 * against the two-line `send()` that appended nothing. `readEvents` does not.
 *
 * The negatives matter as much as the positive. The only `user` TEXT blocks in
 * the recorded corpus are CALF OPENING PROMPTS, and `01-parallel-dispatch`
 * carries two that are character-identical to each other. A dedupe rule written
 * on text alone deletes them from the only copy that exists, silently. The last
 * describe block replays all six fixtures to pin that it does not.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { EventStore } from '../../../src/shared/contracts/event-store';
import type { NormalizedEvent, PodId } from '../../../src/shared/contracts/events';
import type { PodEventPush } from '../../../src/shared/contracts/ipc';
import { EVENT_CHANNELS } from '../../../src/shared/contracts/ipc';

import {
  driveFixture,
  fixtureItems,
  makeHarness,
  openPod,
  tick,
  type Harness,
} from './helpers';

const FIXTURES = [
  '01-parallel-dispatch.ndjson',
  '02-nested-dispatch.ndjson',
  '03-tool-result-close.ndjson',
  '04-orphaned-calf.ndjson',
  '05-malformed.ndjson',
  '06-permission-prompt.ndjson',
] as const;

const harnesses: Harness[] = [];

function harness(options: Parameters<typeof makeHarness>[0] = {}): Harness {
  const made = makeHarness(options);
  harnesses.push(made);
  return made;
}

/**
 * A harness whose clock does NOT advance on its own. `PENDING_ECHO_TTL_MS` is a
 * minute, and the default one-second-per-call counter would need sixty calls to
 * cross it — sixty calls whose side effects would be doing the work the test is
 * supposed to be doing.
 */
function frozenClockHarness(): { h: Harness; advance: (ms: number) => void } {
  let ms = Date.UTC(2026, 7, 18, 0, 0, 0);
  const h = harness({ now: () => new Date(ms).toISOString() });
  return {
    h,
    advance: (delta) => {
      ms += delta;
    },
  };
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

function events(store: EventStore, podId: PodId): NormalizedEvent[] {
  return store.readEvents({ podId });
}

/** Every stored `user_message` text, in `seq` order. */
function userTexts(store: EventStore, podId: PodId): string[] {
  return events(store, podId)
    .filter((event) => event.payload.type === 'user_message')
    .map((event) => (event.payload as { type: 'user_message'; text: string }).text);
}

/** The `(seq, payload.type)` list, in `seq` order. */
function ordered(store: EventStore, podId: PodId): [number, string][] {
  return events(store, podId).map((event) => [event.seq, event.payload.type]);
}

/** A `user` stream message the way the CLI would echo one on the Matriarch. */
function userEcho(text: string, parentToolUseId: string | null = null): unknown {
  return {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
    parent_tool_use_id: parentToolUseId,
    session_id: 'echo-session',
    uuid: `echo-${text}-${parentToolUseId ?? 'root'}`,
  };
}

function assistantText(text: string): unknown {
  return {
    type: 'assistant',
    message: {
      model: 'claude-sonnet-5',
      id: `msg_${text}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
    parent_tool_use_id: null,
    session_id: 'echo-session',
    uuid: `assistant-${text}`,
  };
}

// ---------------------------------------------------------------------------
// The append (criteria 1, 2, 3)
// ---------------------------------------------------------------------------

describe('send appends the user prompt (criterion 1)', () => {
  it('stores a user_message on the Matriarch lane with the exact text', async () => {
    const h = harness();
    const podId = await openPod(h);

    await h.manager.send(podId, 'hello world');

    const matriarchLaneId = h.store.getMatriarchLane(podId)?.id;
    expect(matriarchLaneId).toBeTypeOf('string');

    // Read back out of the REAL store. Not a spy, not a push, not a runner.
    const stored = events(h.store, podId).filter(
      (event) => event.payload.type === 'user_message',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]?.payload).toEqual({ type: 'user_message', text: 'hello world' });
    expect(stored[0]?.laneId).toBe(matriarchLaneId);
  });

  it('stores the text verbatim — no trim, no normalisation', async () => {
    const h = harness();
    const podId = await openPod(h);

    const raw = '  spaced\n\tand\ttabbed  ';
    await h.manager.send(podId, raw);

    expect(userTexts(h.store, podId)).toEqual([raw]);
  });
});

describe('the prompt precedes the turn it caused (criterion 2)', () => {
  it('takes a lower seq than every event the resulting turn produces', async () => {
    const h = harness();
    const podId = await openPod(h);

    await h.manager.send(podId, 'hello world');
    h.sdk(podId).emitMessage(assistantText('hi back'));
    await tick(3);

    // The FULL ordered list, not a pair of existence checks: both rows exist in
    // either order, and the order is the whole claim.
    expect(ordered(h.store, podId)).toEqual([
      [1, 'user_message'],
      [2, 'assistant_text'],
    ]);
  });

  // THE TEST ABOVE DOES NOT ON ITS OWN PIN "APPEND BEFORE `runner.send`", AND
  // THAT WAS MEASURED RATHER THAN ASSUMED: moving `#appendUserPrompt` to after
  // `await session.runner.send(text)` leaves it GREEN. `PodRunner.send`
  // resolves on a single `await Promise.resolve()`, and this fake SDK's async
  // iterator needs more microtask hops than that to hand a queued message to
  // the consume loop — so nothing is ever ingested inside that window here, and
  // no arrangement of emits in this harness opens it.
  //
  // The statement order is pinned instead where it is actually decided, by
  // `'the runner observes the appended row already in the store'` in
  // `tests/unit/pod-manager/user-prompt.test.ts`. That one DOES fail against
  // the swapped implementation.
});

describe('the append uses the existing single path (criterion 3)', () => {
  it('is pushed to renderers with a store-assigned seq in the normal batch shape', async () => {
    const h = harness();
    const podId = await openPod(h);

    await h.manager.send(podId, 'hello world');

    const pushes = h.pushesOn<PodEventPush>(EVENT_CHANNELS.podEvent);
    expect(pushes).toHaveLength(1);
    const push = pushes[0];
    expect(push?.podId).toBe(podId);
    expect(push?.events).toHaveLength(1);

    const pushedEvent = push?.events[0];
    const storedEvent = events(h.store, podId)[0];
    expect(pushedEvent).toEqual(storedEvent);
    expect(pushedEvent?.seq).toBe(1);
    expect(pushedEvent?.id).toBeTypeOf('number');
  });
});

// ---------------------------------------------------------------------------
// The echo guard (criteria 5, 6)
// ---------------------------------------------------------------------------

describe('an echoed prompt does not double the turn (criterion 5)', () => {
  it('suppresses the echo while the rest of the batch still lands', async () => {
    const h = harness();
    const podId = await openPod(h);

    await h.manager.send(podId, 'hello world');
    h.sdk(podId).emitMessage(userEcho('hello world'));
    h.sdk(podId).emitMessage(assistantText('hi back'));
    await tick(3);

    expect(userTexts(h.store, podId)).toEqual(['hello world']);

    // A suppression bug that dropped the WHOLE batch would satisfy the count
    // above against an empty store. This is the half that catches it.
    const assistant = events(h.store, podId).filter(
      (event) => event.payload.type === 'assistant_text',
    );
    expect(assistant).toHaveLength(1);
    expect(assistant[0]?.payload).toEqual({ type: 'assistant_text', text: 'hi back' });
  });
});

describe('the suppression is one-shot and exact (criterion 6)', () => {
  it('(a) an echo with no prior send is stored', async () => {
    const h = harness();
    const podId = await openPod(h);

    h.sdk(podId).emitMessage(userEcho('hello world'));
    await tick(3);

    expect(userTexts(h.store, podId)).toEqual(['hello world']);
  });

  it('(b) a second identical echo after one send is stored', async () => {
    const h = harness();
    const podId = await openPod(h);

    await h.manager.send(podId, 'hello world');
    h.sdk(podId).emitMessage(userEcho('hello world'));
    h.sdk(podId).emitMessage(userEcho('hello world'));
    await tick(3);

    // One appended prompt, one suppressed echo, one rendered echo.
    expect(userTexts(h.store, podId)).toEqual(['hello world', 'hello world']);
  });

  it('(c) an echo differing by one character is stored', async () => {
    const h = harness();
    const podId = await openPod(h);

    await h.manager.send(podId, 'hello world');
    h.sdk(podId).emitMessage(userEcho('hello worlds'));
    await tick(3);

    expect(userTexts(h.store, podId)).toEqual(['hello world', 'hello worlds']);
  });

  it('(d) an echo arriving after PENDING_ECHO_TTL_MS is stored', async () => {
    const { h, advance } = frozenClockHarness();
    const podId = await openPod(h);

    await h.manager.send(podId, 'hello world');
    advance(60_000);
    h.sdk(podId).emitMessage(userEcho('hello world'));
    await tick(3);

    expect(userTexts(h.store, podId)).toEqual(['hello world', 'hello world']);
  });

  it('an echo on a Calf lane is stored even when the text matches exactly', async () => {
    const h = harness();
    const podId = await openPod(h);

    await h.manager.send(podId, 'Report the current directory name and stop.');
    // The dispatch that opens the Calf, then the Calf's opening prompt under
    // that tool_use id — the exact shape `01-parallel-dispatch` records.
    h.sdk(podId).emitMessage({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-5',
        id: 'msg_dispatch',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_calf_1',
            name: 'Agent',
            input: {
              description: 'Report current directory name',
              prompt: 'Report the current directory name and stop.',
              subagent_type: 'leaf',
            },
          },
        ],
      },
      parent_tool_use_id: null,
      session_id: 'echo-session',
      uuid: 'dispatch-1',
    });
    await tick(2);
    h.sdk(podId).emitMessage(
      userEcho('Report the current directory name and stop.', 'toolu_calf_1'),
    );
    await tick(3);

    expect(userTexts(h.store, podId)).toEqual([
      'Report the current directory name and stop.',
      'Report the current directory name and stop.',
    ]);
  });

  it('two Pods sending the same sentence do not consume each other\'s record', async () => {
    const h = harness();
    const first = await openPod(h, { title: 'One' });
    const second = await openPod(h, { title: 'Two' });

    await h.manager.send(first, 'hello world');
    await h.manager.send(second, 'hello world');

    // Only the first Pod echoes. The second Pod's record must be untouched, so
    // the second Pod's own echo is still suppressed when it arrives.
    h.sdk(first).emitMessage(userEcho('hello world'));
    await tick(3);
    h.sdk(second).emitMessage(userEcho('hello world'));
    await tick(3);

    expect(userTexts(h.store, first)).toEqual(['hello world']);
    expect(userTexts(h.store, second)).toEqual(['hello world']);
  });
});

// ---------------------------------------------------------------------------
// The recorded corpus (criterion 7)
// ---------------------------------------------------------------------------

/** Every `user` text block in a fixture, in file order. */
function calfPromptTexts(fixture: string): string[] {
  const texts: string[] = [];
  for (const item of fixtureItems(fixture)) {
    if (item.kind !== 'message') continue;
    const message = item.message as { type?: unknown; message?: { content?: unknown } };
    if (message.type !== 'user') continue;
    const content = message.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as { type?: unknown; text?: unknown }[]) {
      if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text);
    }
  }
  return texts;
}

describe("a Calf's prompt echo is never suppressed (criterion 7)", () => {
  /** Replays one fixture and returns the `user_message` texts the store holds. */
  async function replay(fixture: string, sendFirst: string | null): Promise<string[]> {
    const h = harness();
    const podId = await openPod(h, { title: fixture });
    if (sendFirst !== null) await h.manager.send(podId, sendFirst);
    await driveFixture(h, podId, fixture);
    return userTexts(h.store, podId);
  }

  it('the corpus really does carry Calf prompt text — measured, not remembered', () => {
    const perFixture = FIXTURES.map((fixture) => calfPromptTexts(fixture).length);
    // Seven `user` text blocks across the six streams. Asserted BEFORE the
    // loops below, so a parser that extracted nothing cannot make the survival
    // assertions vacuously true.
    expect(perFixture.reduce((a, b) => a + b, 0)).toBe(7);

    // `01-parallel-dispatch.ndjson` lines 5 and 8: the same text twice, under
    // different `parent_tool_use_id`s. A rule matching on text alone deletes
    // one of them.
    const first = calfPromptTexts('01-parallel-dispatch.ndjson');
    expect(first[0]).toBe('Report the current directory name and stop.');
    expect(first[1]).toBe('Report the current directory name and stop.');
  });

  for (const fixture of FIXTURES) {
    it(`${fixture}: a send adds exactly one row and removes none`, async () => {
      // The baseline is MEASURED by running the same replay with no send, in
      // this same process, rather than hard-coded from a previous run.
      const baseline = await replay(fixture, null);

      // Adversarial on purpose: the user types the very sentence a Calf in this
      // stream was dispatched with, so the pending record is a text match for a
      // Calf prompt. A fixture with no Calf prompt text falls back to a
      // sentence of its own.
      const prompts = calfPromptTexts(fixture);
      const typed = prompts[0] ?? 'hello world';

      const withSend = await replay(fixture, typed);

      expect(withSend).toHaveLength(baseline.length + 1);
      // The appended prompt is first (it precedes the whole stream), and every
      // baseline row survives, in order, after it.
      expect(withSend).toEqual([typed, ...baseline]);
    });
  }

  it('both identical Calf prompts in 01-parallel-dispatch survive the send', async () => {
    const texts = await replay(
      '01-parallel-dispatch.ndjson',
      'Report the current directory name and stop.',
    );
    const matching = texts.filter(
      (text) => text === 'Report the current directory name and stop.',
    );
    // The typed prompt plus BOTH Calf prompts.
    expect(matching).toHaveLength(3);
  });
});
