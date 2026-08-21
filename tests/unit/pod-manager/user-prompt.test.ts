/**
 * The two halves of the prompt append that the assembled IPC harness is the
 * wrong place for:
 *
 *   - the NO-MATRIARCH-LANE branch, which needs the counting store spy to make
 *     "zero rows written" a claim about CALLS and not about final state;
 *   - the pure predicate's bounds — the cap, FIFO consumption, subsequence and
 *     non-mutation — which are cheaper and sharper stated directly than driven
 *     through a stream.
 *
 * The behavioural criteria live in `tests/unit/ipc/user-prompt.test.ts`, over
 * the real pipeline and asserted at the store. Nothing here substitutes for
 * them.
 */

import { describe, expect, it, afterEach } from 'vitest';

import type { LaneId, NewEvent, PodId } from '../../../src/shared/contracts/events';
import {
  armPendingEcho,
  suppressEchoedUserPrompts,
  PENDING_ECHO_CAP,
  PENDING_ECHO_TTL_MS,
  type PendingEcho,
} from '../../../src/main/pod-manager';

import { makeManagerHarness, seedPod, type ManagerHarness } from './helpers';

const harnesses: ManagerHarness[] = [];

function harness(): ManagerHarness {
  const made = makeManagerHarness();
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

// ---------------------------------------------------------------------------
// Criterion 4 — a Pod with no Matriarch lane still sends
// ---------------------------------------------------------------------------

describe('criterion 4: a Pod with no Matriarch lane still sends', () => {
  it('skips the append, warns exactly once, sends anyway, and throws nothing', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'idle' });
    await h.manager.openPod(podId);

    // From here the store answers `null` for every Matriarch lookup. The write
    // spy underneath is untouched.
    h.spy.blindMatriarchLane();
    h.spy.reset();
    h.logged.length = 0;

    await expect(h.manager.send(podId, 'hello world')).resolves.toBeUndefined();

    // Zero rows written — asserted on the CALLS, so an append that wrote and
    // then failed a constraint could not read as a clean skip.
    expect(h.spy.writes.filter((write) => write.method === 'appendMany')).toEqual([]);
    expect(h.spy.writes.filter((write) => write.method === 'append')).toEqual([]);

    // One warn, and it names the Pod.
    expect(h.logged.filter((entry) => entry.level === 'warn')).toHaveLength(1);
    expect(String(h.logged[0]?.args[0])).toContain(podId);
    expect(h.logged.filter((entry) => entry.level === 'error')).toEqual([]);

    // And the user's message still reached the runner — the whole point of the
    // branch. A count would pass for a send of the wrong text.
    expect(h.runner(podId).sent).toEqual(['hello world']);
  });

  it('a Pod that HAS a Matriarch lane writes exactly one appendMany and warns not at all', async () => {
    // The positive twin. Without it the test above passes against a `send` that
    // does nothing at all for every Pod.
    const h = harness();
    const podId = seedPod(h, { status: 'idle' });
    await h.manager.openPod(podId);
    h.spy.reset();
    h.logged.length = 0;

    await h.manager.send(podId, 'hello world');

    expect(h.spy.writes.filter((write) => write.method === 'appendMany')).toHaveLength(1);
    expect(h.logged).toEqual([]);
    expect(h.runner(podId).sent).toEqual(['hello world']);
    expect(h.raw.readEvents({ podId }).map((event) => event.payload)).toEqual([
      { type: 'user_message', text: 'hello world' },
    ]);
  });

  it('the runner observes the appended row already in the store', async () => {
    // CRITERION 2, FIRST CLAUSE — "the append happens BEFORE `runner.send` is
    // awaited" — pinned where it is decided.
    //
    // The assembled pipeline cannot pin it: `PodRunner.send` resolves on one
    // `await Promise.resolve()`, the fake SDK's iterator needs more hops than
    // that, so no event is ever ingested inside the window and the swapped
    // order stays green there. Measured, not assumed.
    const h = harness();
    const podId = seedPod(h, { status: 'idle' });

    let seenAtSendTime: unknown[] | null = null;
    h.script(podId, {
      onSend: () => {
        seenAtSendTime = h.raw.readEvents({ podId }).map((event) => event.payload);
      },
    });
    await h.manager.openPod(podId);

    await h.manager.send(podId, 'hello world');

    // Not "the hook ran" — what the STORE held when it ran.
    expect(seenAtSendTime).toEqual([{ type: 'user_message', text: 'hello world' }]);
  });

  it('an unknown Pod appends nothing and still throws NOT_RUNNING', async () => {
    const h = harness();
    h.spy.reset();

    await expect(h.manager.send('no-such-pod' as PodId, 'hello world')).rejects.toMatchObject({
      code: 'NOT_RUNNING',
    });
    expect(h.spy.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The predicate's bounds
// ---------------------------------------------------------------------------

const MATRIARCH = 'lane-matriarch' as LaneId;
const CALF = 'lane-calf' as LaneId;
const AT = '2026-08-21T00:00:00.000Z';
const NOW = Date.parse(AT);

function userMessage(text: string, laneId: LaneId = MATRIARCH): NewEvent {
  return {
    podId: 'pod-1' as PodId,
    laneId,
    type: 'user_message',
    payload: { type: 'user_message', text },
    createdAt: AT,
  };
}

function assistantText(text: string, laneId: LaneId = MATRIARCH): NewEvent {
  return {
    podId: 'pod-1' as PodId,
    laneId,
    type: 'assistant_text',
    payload: { type: 'assistant_text', text },
    createdAt: AT,
  };
}

function record(text: string, at: string = AT): PendingEcho {
  return { text, appendedSeq: 1, at };
}

describe('armPendingEcho', () => {
  it(`keeps at most ${PENDING_ECHO_CAP} records and evicts the OLDEST`, () => {
    const pending: PendingEcho[] = [];
    for (let index = 0; index < PENDING_ECHO_CAP + 3; index += 1) {
      armPendingEcho(pending, record(`text-${index}`));
    }
    expect(pending).toHaveLength(PENDING_ECHO_CAP);
    // The three oldest are gone; the newest survives. Dropping the oldest is
    // the direction that RENDERS its echo if one ever arrives.
    expect(pending.map((entry) => entry.text)).toEqual([
      'text-3',
      'text-4',
      'text-5',
      'text-6',
      'text-7',
      'text-8',
      'text-9',
      'text-10',
      'text-11',
      'text-12',
    ]);
  });

  it('an evicted record can no longer suppress', () => {
    const pending: PendingEcho[] = [];
    armPendingEcho(pending, record('evicted'));
    for (let index = 0; index < PENDING_ECHO_CAP; index += 1) {
      armPendingEcho(pending, record(`filler-${index}`));
    }
    const batch = [userMessage('evicted')];
    expect(suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW)).toEqual(batch);
  });
});

describe('suppressEchoedUserPrompts', () => {
  it('returns a new array and never mutates the batch', () => {
    const pending = [record('typed')];
    const batch: readonly NewEvent[] = [assistantText('a'), userMessage('typed')];
    const snapshot = [...batch];

    const out = suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW);

    expect(out).not.toBe(batch);
    expect(batch).toEqual(snapshot);
    expect(out).toEqual([snapshot[0]]);
  });

  it('preserves order and yields a subsequence', () => {
    const pending = [record('typed')];
    const batch = [
      assistantText('first'),
      userMessage('typed'),
      assistantText('second'),
      userMessage('untyped'),
    ];

    const out = suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW);

    expect(out).toEqual([batch[0], batch[2], batch[3]]);
    // A subsequence: every kept element is the same object, in the same order.
    let cursor = 0;
    for (const event of out) {
      cursor = batch.indexOf(event, cursor);
      expect(cursor).toBeGreaterThanOrEqual(0);
      cursor += 1;
    }
  });

  it('suppresses nothing when the Matriarch lane is undefined', () => {
    const pending = [record('typed')];
    const batch = [userMessage('typed')];

    expect(suppressEchoedUserPrompts(batch, undefined, pending, NOW)).toEqual(batch);
    // The record survives — it was not consumed by a call that suppressed
    // nothing.
    expect(pending).toHaveLength(1);
  });

  it('never reaches a non-user_message event, whatever its text', () => {
    const pending = [record('typed')];
    const batch = [assistantText('typed')];

    expect(suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW)).toEqual(batch);
    expect(pending).toHaveLength(1);
  });

  it('never reaches a Calf lane, whatever its text', () => {
    const pending = [record('typed')];
    const batch = [userMessage('typed', CALF)];

    expect(suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW)).toEqual(batch);
    expect(pending).toHaveLength(1);
  });

  it('matches exactly — no trim, no case fold, no prefix', () => {
    const pending = [record('typed')];
    const batch = [
      userMessage(' typed'),
      userMessage('typed '),
      userMessage('Typed'),
      userMessage('typed extra'),
      userMessage('typ'),
    ];

    expect(suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW)).toEqual(batch);
    expect(pending).toHaveLength(1);
  });

  it('consumes FIFO: the first-armed record matches first', () => {
    const pending: PendingEcho[] = [
      { text: 'typed', appendedSeq: 11, at: AT },
      { text: 'typed', appendedSeq: 22, at: AT },
    ];

    suppressEchoedUserPrompts([userMessage('typed')], MATRIARCH, pending, NOW);

    expect(pending.map((entry) => entry.appendedSeq)).toEqual([22]);
  });

  it('one record suppresses one event; the second echo survives', () => {
    const pending = [record('typed')];
    const batch = [userMessage('typed'), userMessage('typed')];

    const out = suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW);

    expect(out).toEqual([batch[1]]);
    expect(pending).toEqual([]);
  });

  it(`drops a record at or past ${PENDING_ECHO_TTL_MS}ms rather than consuming it`, () => {
    const pending = [record('typed')];
    const batch = [userMessage('typed')];

    expect(
      suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW + PENDING_ECHO_TTL_MS),
    ).toEqual(batch);
    expect(pending).toEqual([]);
  });

  it('one millisecond short of the TTL still suppresses', () => {
    // The twin of the test above. Without it, a rule that expired everything
    // immediately would pass the expiry test and silently never suppress.
    const pending = [record('typed')];

    expect(
      suppressEchoedUserPrompts(
        [userMessage('typed')],
        MATRIARCH,
        pending,
        NOW + PENDING_ECHO_TTL_MS - 1,
      ),
    ).toEqual([]);
    expect(pending).toEqual([]);
  });

  it('an unparseable timestamp counts as EXPIRED, not as fresh', () => {
    // `NaN > TTL` is false, so the naive comparison would keep an unreadable
    // record alive forever and let it suppress. Over-showing is the safe
    // direction.
    const pending = [record('typed', 'not a date')];
    const batch = [userMessage('typed')];

    expect(suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW)).toEqual(batch);
    expect(pending).toEqual([]);
  });

  it('is a no-op with no pending records at all', () => {
    const pending: PendingEcho[] = [];
    const batch = [userMessage('typed'), assistantText('a')];

    expect(suppressEchoedUserPrompts(batch, MATRIARCH, pending, NOW)).toEqual(batch);
  });
});
