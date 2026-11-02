/**
 * OPEN RESUMES, AND A REJECTED RESUME FALLS BACK IN THE OPEN.
 *
 * The defect this suite pins was reproduced by hand against the built app: ask
 * a question, close the Pod, open it, ask what the previous question was — the
 * model answers that this is the start of the conversation. `openPod` started
 * every Pod fresh, while the design (`docs/superpowers/specs/
 * 2026-08-18-orcastrate-design.md`, section 4.2) defines `resume` as "the
 * session id, set when reopening a persisted Pod".
 *
 * The half that is not a one-line change is the fallback: the stored session id
 * can be one Claude Code no longer has, and a Pod that refuses to open because
 * of it is worse than the defect. So a rejected resume retries fresh — and ONLY
 * a rejected resume. `CWD_MISSING` and `SPAWN_FAILED` still beach the Pod with
 * their cause, because a fallback that swallowed those would turn two real
 * errors into a silent restart.
 */

import { describe, expect, it, afterEach } from 'vitest';

import {
  RESUME_FALLBACK_REASON,
  RESUME_FALLBACK_SUBTYPE,
} from '../../../src/main/pod-manager';
import { PodRunnerError } from '../../../src/shared/contracts/pod-runner';
import type { PodStatusPush } from '../../../src/shared/contracts/ipc';
import {
  eventsFor,
  expectOpennessAgrees,
  makeManagerHarness,
  seedPod,
  systemData,
  type ManagerHarness,
} from './helpers';

const harnesses: ManagerHarness[] = [];

function harness(): ManagerHarness {
  const made = makeManagerHarness();
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

/** Every `resume_fallback` notice on a Pod, in `seq` order. */
function fallbackNotices(h: ManagerHarness, podId: string): Record<string, unknown>[] {
  return eventsFor(h, podId)
    .filter(
      (event) =>
        event.payload.type === 'system' && event.payload.subtype === RESUME_FALLBACK_SUBTYPE,
    )
    .map(systemData);
}

// ---------------------------------------------------------------------------
// Criterion 1 — Open resumes
// ---------------------------------------------------------------------------

describe('criterion 1: openPod resumes the stored Claude Code session', () => {
  it('passes the stored ccSessionId as the SDK `resume` option', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-session-abc' });

    await h.manager.openPod(podId);

    // THE DEFECT, INVERTED. Before this change `openPod` called
    // `#start(pod, false)` and this was `undefined`, so reopening a persisted
    // Pod started a conversation Claude Code had no memory of.
    expect(h.runner(podId).options.resume).toBe('cc-session-abc');
    expect(h.runners(podId)).toHaveLength(1);
    await expectOpennessAgrees(h, podId, 'openPod');
  });

  it('starts fresh, with no `resume` and no notice, when the Pod never reached a first turn', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });
    expect(h.raw.getPod(podId)?.ccSessionId).toBeNull();

    await h.manager.openPod(podId);

    // `#start`'s existing `pod.ccSessionId !== null` guard, confirmed rather
    // than assumed: there is nothing to resume, so the option is omitted
    // entirely and the Pod opens normally.
    expect(h.runner(podId).options.resume).toBeUndefined();
    expect(h.runners(podId)).toHaveLength(1);
    expect(h.raw.getPod(podId)?.status).toBe('idle');
    // Nothing failed, so nothing is explained.
    expect(fallbackNotices(h, podId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 and 3 — the fallback, and its durable explanation
// ---------------------------------------------------------------------------

describe('criterion 2: a resume the CLI rejects falls back to a fresh session', () => {
  it('retries exactly once without `resume`, leaves the Pod open, and writes one notice', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, {
      failStartWith: new PodRunnerError('RESUME_FAILED', 'resume rejected by the CLI: no conversation found'),
      failStartTimes: 1,
    });

    const pod = await h.manager.openPod(podId);

    // ONE retry, not a loop: the second runner carries no `resume`, so it
    // cannot be rejected for the same reason.
    expect(h.runners(podId)).toHaveLength(2);
    expect(h.runners(podId)[0]?.options.resume).toBe('cc-gone');
    expect(h.runners(podId)[1]?.options.resume).toBeUndefined();

    // A WORKING POD, not a beached one and not a rejected call.
    expect(pod.status).toBe('idle');
    expect(h.raw.getPod(podId)?.status).toBe('idle');
    await expectOpennessAgrees(h, podId, 'openPod with a rejected resume');
    expect(h.statusPushes(podId).map((push) => push.status)).not.toContain('beached');

    // The first runner is still reaped, exactly as a failed start always was.
    expect(h.runners(podId)[0]?.stopCalls).toBe(1);
  });

  it('pins the explanation verbatim, on the Matriarch lane, as a `system` event', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, {
      failStartWith: new PodRunnerError('RESUME_FAILED', 'resume rejected by the CLI: no conversation found'),
      failStartTimes: 1,
    });

    await h.manager.openPod(podId);

    const events = eventsFor(h, podId).filter(
      (event) =>
        event.payload.type === 'system' && event.payload.subtype === RESUME_FALLBACK_SUBTYPE,
    );
    expect(events).toHaveLength(1);
    const notice = events[0];
    if (notice === undefined) throw new Error('no resume-fallback notice was written');
    expect(notice.laneId).toBe(h.raw.getMatriarchLane(podId)?.id);
    expect(notice.type).toBe('system');

    // EXACT TEXT. It is what the user reads, and it must stay true of what
    // happened: the previous conversation could not be resumed, and this is a
    // new one.
    const data = systemData(notice);
    expect(data.reason).toBe(RESUME_FALLBACK_REASON);
    expect(RESUME_FALLBACK_REASON).toBe(
      'Claude Code could not resume the previous conversation for this Pod, so ' +
        'this Pod was started as a new conversation. The transcript above is the ' +
        'record Orcastrate keeps and is unchanged; Claude Code itself no longer ' +
        'has those earlier messages in context.',
    );
    expect(data.subtypeMarker).toBe(RESUME_FALLBACK_SUBTYPE);
    expect(data.abandonedCcSessionId).toBe('cc-gone');
  });

  it('resumes again on the next Open once a new session id has been recorded', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, {
      failStartWith: new PodRunnerError('RESUME_FAILED', 'no conversation found'),
      failStartTimes: 1,
    });

    await h.manager.openPod(podId);
    // The fresh session announces its own id, exactly as the real runner does.
    h.runner(podId).handlers?.onSessionId('cc-new');
    await h.manager.closePod(podId);

    h.script(podId, {});
    await h.manager.openPod(podId);

    expect(h.runner(podId).options.resume).toBe('cc-new');
    // Still exactly one notice: the fallback is not re-announced on a start
    // that never failed.
    expect(fallbackNotices(h, podId)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The rejected id is cleared from the Pod row before the retry starts
// ---------------------------------------------------------------------------

/**
 * A double that models the CLI: it refuses a start that asks to resume the
 * rejected id, every time, and accepts any other start. Driven by the runner's
 * `options.resume` and the error CODE, never by wording, so it does not depend
 * on how `classifyStartupFailure` reads the CLI's message.
 */
function refusesToResume(rejectedId: string): (options: { resume?: string }) => void {
  return (options) => {
    if (options.resume === rejectedId) {
      throw new PodRunnerError('RESUME_FAILED', 'no conversation found');
    }
  };
}

describe('a rejected resume clears the stored ccSessionId before the fresh retry', () => {
  it('leaves the stored ccSessionId null once the fallback is up, before any onSessionId', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, {
      failStartWith: new PodRunnerError('RESUME_FAILED', 'no conversation found'),
      failStartTimes: 1,
    });

    await h.manager.openPod(podId);

    // THE DEFECT: the row kept the id the CLI had just refused, so anything
    // that read it before the fresh session announced its own id re-sent it.
    expect(h.raw.getPod(podId)?.ccSessionId).toBeNull();
    // The notice is still the record of what was abandoned.
    expect(fallbackNotices(h, podId)[0]?.abandonedCcSessionId).toBe('cc-gone');
  });

  it('a close and reopen in that window starts with no `resume`', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, {
      failStartWith: new PodRunnerError('RESUME_FAILED', 'no conversation found'),
      failStartTimes: 1,
    });

    await h.manager.openPod(podId);
    await h.manager.closePod(podId);
    h.script(podId, {});
    await h.manager.openPod(podId);

    expect(h.runners(podId)).toHaveLength(3);
    expect(h.runner(podId).options.resume).toBeUndefined();
  });

  it('a close and reopen against a CLI that refuses the id again falls back once, not twice', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, { onStart: refusesToResume('cc-gone') });

    await h.manager.openPod(podId);
    expect(fallbackNotices(h, podId)).toHaveLength(1);
    await h.manager.closePod(podId);
    const reopened = await h.manager.openPod(podId);

    // Re-sending the refused id would be refused again and announce a second
    // fallback for the same abandoned session.
    expect(fallbackNotices(h, podId)).toHaveLength(1);
    expect(reopened.status).toBe('idle');
    expect(h.raw.getPod(podId)?.status).toBe('idle');
    await expectOpennessAgrees(h, podId, 'reopen after a rejected resume');
  });

  it('a reconnect in that window starts with no `resume`', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, {
      failStartWith: new PodRunnerError('RESUME_FAILED', 'no conversation found'),
      failStartTimes: 1,
    });

    await h.manager.openPod(podId);
    h.script(podId, {});
    await h.manager.reconnectPod(podId);

    expect(h.runners(podId)).toHaveLength(3);
    expect(h.runner(podId).options.resume).toBeUndefined();
  });

  it('a retry that also fails beaches the Pod with its ccSessionId null', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, { failStartWith: new PodRunnerError('RESUME_FAILED', 'no conversation found') });

    await expect(h.manager.openPod(podId)).rejects.toMatchObject({ code: 'RESUME_FAILED' });

    expect(h.raw.getPod(podId)?.status).toBe('beached');
    // A beached Pod must not keep an id the CLI already refused, or its
    // Reconnect re-sends it.
    expect(h.raw.getPod(podId)?.ccSessionId).toBeNull();
  });

  it('a reconnect after that failed retry starts with no `resume`', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    h.script(podId, { failStartWith: new PodRunnerError('RESUME_FAILED', 'no conversation found') });
    await expect(h.manager.openPod(podId)).rejects.toMatchObject({ code: 'RESUME_FAILED' });

    h.script(podId, {});
    await h.manager.reconnectPod(podId);

    expect(h.runners(podId)).toHaveLength(3);
    expect(h.runner(podId).options.resume).toBeUndefined();
  });

  it('the stored ccSessionId is already null when the retry runner starts', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    const refuse = refusesToResume('cc-gone');
    const seen: { resume: string | undefined; stored: string | null | undefined }[] = [];
    h.script(podId, {
      onStart: (options) => {
        // Read from INSIDE `start()`: the only point where "cleared before the
        // retry" and "cleared after the retry came up" differ.
        seen.push({ resume: options.resume, stored: h.raw.getPod(podId)?.ccSessionId });
        refuse(options);
      },
    });

    await h.manager.openPod(podId);

    expect(seen).toEqual([
      { resume: 'cc-gone', stored: 'cc-gone' },
      { resume: undefined, stored: null },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 2, the other half — every OTHER start failure still beaches
// ---------------------------------------------------------------------------

describe('criterion 2: a start failure that is not a rejected resume still beaches the Pod', () => {
  for (const code of ['CWD_MISSING', 'SPAWN_FAILED'] as const) {
    it(`${code} beaches with its cause, with no retry and no notice`, async () => {
      const h = harness();
      const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-session-abc' });
      const failure = new PodRunnerError(code, `${code} happened`);
      h.script(podId, { failStartWith: failure });

      await expect(h.manager.openPod(podId)).rejects.toBe(failure);

      // NO RETRY. Swallowing these would turn two real errors into a silent
      // fresh session — the one way this fix could be worse than the defect.
      expect(h.runners(podId)).toHaveLength(1);
      expect(fallbackNotices(h, podId)).toHaveLength(0);
      expect(h.raw.getPod(podId)?.status).toBe('beached');
      const beached = h
        .statusPushes(podId)
        .filter((push): push is PodStatusPush => push.status === 'beached');
      expect(beached).toHaveLength(1);
      expect(String(beached[0]?.detail)).toContain(code);
      await expectOpennessAgrees(h, podId, `openPod failing with ${code}`);
    });
  }

  it('a RESUME_FAILED raised when no resume was attempted still beaches, and never retries', async () => {
    const h = harness();
    // No `ccSessionId`, so `#start` passes no `resume` at all. A RESUME_FAILED
    // here is not something a retry could fix, and treating it as one would
    // hide a defect behind a restart.
    const podId = seedPod(h, { status: 'closed' });
    const failure = new PodRunnerError('RESUME_FAILED', 'implausible, but not a licence to retry');
    h.script(podId, { failStartWith: failure });

    await expect(h.manager.openPod(podId)).rejects.toBe(failure);

    expect(h.runners(podId)).toHaveLength(1);
    expect(fallbackNotices(h, podId)).toHaveLength(0);
    expect(h.raw.getPod(podId)?.status).toBe('beached');
  });

  it('a retry that itself fails beaches the Pod with the retry cause and writes no notice', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-gone' });
    // Every attempt fails: the first is classified RESUME_FAILED, the retry
    // fails too. The Pod must land beached rather than half-open, and the
    // notice must not claim a fresh session that never came up.
    h.script(podId, { failStartWith: new PodRunnerError('RESUME_FAILED', 'no conversation found') });

    await expect(h.manager.openPod(podId)).rejects.toMatchObject({ code: 'RESUME_FAILED' });

    expect(h.runners(podId)).toHaveLength(2);
    expect(fallbackNotices(h, podId)).toHaveLength(0);
    expect(h.raw.getPod(podId)?.status).toBe('beached');
    await expectOpennessAgrees(h, podId, 'openPod whose retry also failed');
  });
});

// ---------------------------------------------------------------------------
// Criterion 7 — Reconnect still works, and still differs
// ---------------------------------------------------------------------------

describe('criterion 7: reconnectPod still resumes, and still disposes first', () => {
  it('resumes against the stored id after disposing the live session', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed', ccSessionId: 'cc-session-abc' });

    await h.manager.openPod(podId);
    const first = h.runner(podId);
    await h.manager.reconnectPod(podId);

    // THE DIFFERENCE THAT REMAINS: Reconnect tears down whatever is live and
    // builds a new runner; Open returns the same Pod untouched.
    expect(first.stopCalls).toBe(1);
    expect(h.runners(podId)).toHaveLength(2);
    expect(h.runner(podId).options.resume).toBe('cc-session-abc');

    await h.manager.openPod(podId);
    expect(h.runners(podId)).toHaveLength(2);
  });

  it('falls back the same way when the CLI rejects the reconnect', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'beached', ccSessionId: 'cc-gone' });
    h.script(podId, {
      failStartWith: new PodRunnerError('RESUME_FAILED', 'no conversation found'),
      failStartTimes: 1,
    });

    const pod = await h.manager.reconnectPod(podId);

    expect(pod.status).toBe('idle');
    expect(h.runners(podId)).toHaveLength(2);
    expect(h.runner(podId).options.resume).toBeUndefined();
    expect(fallbackNotices(h, podId)).toHaveLength(1);
  });
});
