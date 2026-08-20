/**
 * Session-id capture. Escalation E2 was resolved at Gate 2 as OPTION A, so
 * `pod-lifecycle.ts` section 8 is binding and unconditional:
 *
 *   capture narrows to `system` messages with `subtype: 'init'` and to `result`
 *   messages, the LATEST such id in a run wins, and a `session_id` on any other
 *   message type is ignored for capture.
 *
 * The mechanism this closes: nothing requires the first `session_id`-bearing
 * message in the stream to name THIS query's session. A hook-emitted message
 * carrying a foreign id and arriving before `system/init` used to become the
 * Pod's permanent resume id, and `pods.reconnect` then resumed someone else's
 * conversation.
 */

import { describe, expect, it } from 'vitest';

import { createPodRunnerWith } from '../../../src/main/pod';
import {
  makeFakeSdk,
  podOptions,
  recordHandlers,
  recordLogger,
  waitFor,
} from './helpers';
import type { RecordingLogger } from './helpers';

const allow = async (): Promise<{ decision: 'allow' }> => ({ decision: 'allow' });

async function started(logger?: RecordingLogger) {
  const sdk = makeFakeSdk({ autoInitialize: true });
  const runner = createPodRunnerWith(sdk.bridge, logger)(podOptions({ podId: 'pod-7' }));
  const handlers = recordHandlers();
  await runner.start(handlers, allow);
  return { sdk, runner, handlers };
}

const AUTHORITATIVE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FOREIGN = 'ffffffff-2222-4222-8222-ffffffffffff';

describe('capture is narrowed to the messages that authoritatively name the session', () => {
  it('ignores a hook-shaped message that arrives BEFORE system/init (criterion 7)', async () => {
    const { sdk, handlers } = await started();

    // A hook message carrying a FOREIGN session id, first in the stream.
    sdk.emitMessage({ type: 'system', subtype: 'hook_started', session_id: FOREIGN });
    sdk.emitMessage({ type: 'system', subtype: 'init', session_id: AUTHORITATIVE });
    await waitFor(() => handlers.sessionIds.length > 0, 'a session id was captured');

    expect(handlers.sessionIds).toEqual([AUTHORITATIVE]);
    expect(handlers.sessionIds).not.toContain(FOREIGN);
  });

  it('ignores an assistant message carrying a session id', async () => {
    const { sdk, handlers } = await started();
    sdk.emitMessage({ type: 'assistant', session_id: FOREIGN });
    sdk.emitMessage({ type: 'result', subtype: 'success', session_id: AUTHORITATIVE });
    await waitFor(() => handlers.sessionIds.length > 0, 'a session id was captured');
    expect(handlers.sessionIds).toEqual([AUTHORITATIVE]);
  });

  it('captures nothing at all from a run of non-authoritative messages', async () => {
    const { sdk, handlers } = await started();
    sdk.emitMessage({ type: 'system', subtype: 'hook_started', session_id: FOREIGN });
    sdk.emitMessage({ type: 'assistant', session_id: FOREIGN });
    sdk.emitMessage({ type: 'quantum_flux', session_id: FOREIGN });
    await waitFor(() => handlers.messages.length === 3, 'all three messages were forwarded');
    expect(handlers.sessionIds).toEqual([]);
  });

  it('forwards every message regardless — capture narrows, routing does not', async () => {
    const { sdk, handlers } = await started();
    sdk.emitMessage({ type: 'system', subtype: 'hook_started', session_id: FOREIGN });
    await waitFor(() => handlers.messages.length === 1, 'the hook message was forwarded');
    expect(handlers.messages).toHaveLength(1);
  });
});

describe('the latest authoritative id in a run wins (criterion 7)', () => {
  it('a second authoritative id replaces the first', async () => {
    const second = 'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb';
    // A recording logger, so the expected mid-run warn does not print.
    const { sdk, handlers } = await started(recordLogger());

    sdk.emitMessage({ type: 'system', subtype: 'init', session_id: AUTHORITATIVE });
    sdk.emitMessage({ type: 'result', subtype: 'success', session_id: second });
    await waitFor(() => handlers.sessionIds.length === 2, 'both ids were captured');

    expect(handlers.sessionIds).toEqual([AUTHORITATIVE, second]);
    expect(handlers.sessionIds.at(-1)).toBe(second);
  });

  it('a repeat of the SAME id is not re-reported', async () => {
    const { sdk, handlers } = await started();
    sdk.emitMessage({ type: 'system', subtype: 'init', session_id: AUTHORITATIVE });
    sdk.emitMessage({ type: 'result', subtype: 'success', session_id: AUTHORITATIVE });
    await waitFor(() => handlers.messages.length === 2, 'both messages were forwarded');
    expect(handlers.sessionIds).toEqual([AUTHORITATIVE]);
  });
});

describe('the diagnostic fires (criterion 8)', () => {
  it('warns with both ids and the Pod id when a captured id differs from the stored one', async () => {
    const second = 'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb';
    const logger = recordLogger();
    const { sdk, handlers } = await started(logger);

    sdk.emitMessage({ type: 'system', subtype: 'init', session_id: AUTHORITATIVE });
    sdk.emitMessage({ type: 'result', subtype: 'success', session_id: second });
    await waitFor(() => handlers.sessionIds.length === 2, 'both ids were captured');

    expect(logger.warnings).toHaveLength(1);
    const line = logger.warnings[0]?.join(' ') ?? '';
    // The identifiers needed to find this run again, and nothing secret.
    expect(line).toContain('pod-7');
    expect(line).toContain(AUTHORITATIVE);
    expect(line).toContain(second);
  });

  it('stays silent on the first capture and on a repeat of the same id', async () => {
    const logger = recordLogger();
    const { sdk, handlers } = await started(logger);
    sdk.emitMessage({ type: 'system', subtype: 'init', session_id: AUTHORITATIVE });
    sdk.emitMessage({ type: 'result', subtype: 'success', session_id: AUTHORITATIVE });
    await waitFor(() => handlers.messages.length === 2, 'both messages were forwarded');
    expect(logger.warnings).toEqual([]);
  });

  it('does not warn for a foreign id on a message type that is not authoritative', async () => {
    const logger = recordLogger();
    const { sdk, handlers } = await started(logger);
    sdk.emitMessage({ type: 'system', subtype: 'init', session_id: AUTHORITATIVE });
    sdk.emitMessage({ type: 'system', subtype: 'hook_started', session_id: FOREIGN });
    await waitFor(() => handlers.messages.length === 2, 'both messages were forwarded');
    expect(logger.warnings).toEqual([]);
    expect(handlers.sessionIds).toEqual([AUTHORITATIVE]);
  });
});
