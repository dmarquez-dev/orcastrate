/**
 * Stream consumption: malformed lines and unexpected process exit.
 * Acceptance criteria 7 and 8, driven from tests/fixtures/protocol/.
 */

import { describe, expect, it } from 'vitest';

import { createPodRunnerWith, parseStreamLine, asEnvelope } from '../../../src/main/pod';
import { fixtureItems, fixtureLines, makeFakeSdk, podOptions, recordHandlers, tick } from './helpers';

async function started() {
  const sdk = makeFakeSdk({ autoInitialize: true });
  const runner = createPodRunnerWith(sdk.bridge)(podOptions());
  const handlers = recordHandlers();
  await runner.start(handlers, async () => ({ decision: 'allow' }));
  return { sdk, runner, handlers };
}

describe('line parsing', () => {
  it('turns a valid line into a message item', () => {
    const item = parseStreamLine('{"type":"assistant"}');
    expect(item.kind).toBe('message');
  });

  it('turns a bad line into a malformed item carrying the raw text and the error', () => {
    const item = parseStreamLine('this line is not JSON at all');
    expect(item).toMatchObject({ kind: 'malformed', rawLine: 'this line is not JSON at all' });
    if (item.kind === 'malformed') expect(item.parseError.length).toBeGreaterThan(0);
  });

  it('accepts an unknown message type — the router, not the runner, decides', () => {
    expect(asEnvelope({ type: 'quantum_flux', subtype: 'unknown_to_this_router' })).toMatchObject({
      type: 'quantum_flux',
      subtype: 'unknown_to_this_router',
    });
  });

  it('rejects a value that is not a message envelope', () => {
    for (const junk of [null, 42, 'x', [], {}, { type: 1 }, { type: '' }]) {
      expect(asEnvelope(junk)).toBeNull();
    }
  });
});

describe('a corrupted stream is survived, not fatal (criterion 8)', () => {
  it('reports every corruption in 05-malformed.ndjson and keeps delivering', async () => {
    const { sdk, handlers } = await started();
    const items = fixtureItems('05-malformed.ndjson');
    const lines = fixtureLines('05-malformed.ndjson');

    const badIndexes = items.flatMap((item, i) => (item.kind === 'malformed' ? [i] : []));
    expect(badIndexes.length).toBeGreaterThan(0);

    for (const item of items) sdk.emit(item);
    await tick();

    // Every corrupt line was reported with its raw text.
    expect(handlers.malformed.length).toBe(badIndexes.length);
    for (const i of badIndexes) {
      expect(handlers.malformed.some((m) => m.rawLine === lines[i])).toBe(true);
    }

    // And messages AFTER the last corruption still arrived.
    const lastBad = badIndexes[badIndexes.length - 1] as number;
    const goodAfter = items.slice(lastBad + 1).filter((i) => i.kind === 'message');
    expect(goodAfter.length).toBeGreaterThan(0);
    expect(handlers.messages.length).toBe(items.filter((i) => i.kind === 'message').length);

    // The stream is still open: nothing was beached, the runner is alive.
    expect(handlers.beached).toHaveLength(0);
  });

  it('records a malformed event so the failure is visible in the transcript', async () => {
    const { sdk, handlers } = await started();
    sdk.emit({ kind: 'malformed', rawLine: 'garbage', parseError: 'Unexpected token' });
    sdk.emitMessage({ type: 'assistant', session_id: 's' });
    await tick();
    expect(handlers.events.filter((e) => e.type === 'malformed')).toHaveLength(1);
    expect(handlers.messages).toHaveLength(1);
  });

  it('treats a parsed-but-unroutable value as malformed rather than forwarding it', async () => {
    const { sdk, handlers } = await started();
    sdk.emitMessage({ notAMessage: true });
    sdk.emitMessage({ type: 'assistant' });
    await tick();
    expect(handlers.malformed).toHaveLength(1);
    expect(handlers.malformed[0]?.parseError).toBe('not an SDK message envelope');
    expect(handlers.messages).toHaveLength(1);
  });
});

describe('a clean capture replays end to end', () => {
  it('delivers every message of 03-tool-result-close.ndjson unmodified', async () => {
    const { sdk, handlers } = await started();
    const items = fixtureItems('03-tool-result-close.ndjson');
    for (const item of items) sdk.emit(item);
    await tick();

    expect(handlers.malformed).toHaveLength(0);
    expect(handlers.messages).toHaveLength(items.length);
    // Raw and unmodified: the first message is the system/init line verbatim.
    expect(handlers.messages[0]).toEqual(
      (items[0] as { kind: 'message'; message: unknown }).message,
    );
    expect(handlers.sessionIds).toEqual(['30f2c781-82d3-404f-a84b-c551e77ae658']);
    expect(handlers.turnEnds).toBe(1);
  });

  it('replays the interleaved two-Calf capture without dropping anything', async () => {
    const { sdk, handlers } = await started();
    const items = fixtureItems('01-parallel-dispatch.ndjson');
    for (const item of items) sdk.emit(item);
    await tick();
    expect(handlers.messages).toHaveLength(items.length);
    expect(handlers.malformed).toHaveLength(0);
  });
});

describe('unexpected process exit beaches the Pod (criterion 7)', () => {
  it('reports the exit code and transitions to beached', async () => {
    const { sdk, runner, handlers } = await started();
    const err = Object.assign(new Error('Claude Code process exited with code 137'), {
      exitCode: 137,
    });
    sdk.failStream(err);
    await tick();

    expect(handlers.beached).toHaveLength(1);
    expect(handlers.beached[0]?.exitCode).toBe(137);
    expect(runner.status).toBe('beached');
    expect(handlers.statuses.at(-1)).toBe('beached');
  });

  it('reports null for a signal kill', async () => {
    const { sdk, runner, handlers } = await started();
    sdk.failStream(new Error('Claude Code process terminated by signal SIGKILL'));
    await tick();
    expect(handlers.beached[0]?.exitCode).toBeNull();
    expect(runner.status).toBe('beached');
  });

  it('recovers the code from the message when the own-property is absent', async () => {
    const { sdk, handlers } = await started();
    sdk.failStream(new Error('Claude Code process exited with code 2'));
    await tick();
    expect(handlers.beached[0]?.exitCode).toBe(2);
  });

  it('does not throw and does not restart itself', async () => {
    const { sdk, handlers } = await started();
    sdk.failStream(new Error('Claude Code process exited with code 1'));
    await tick();
    // Still exactly one query() call: no self-restart.
    expect(sdk.calls).toHaveLength(1);
    expect(handlers.beached).toHaveLength(1);
  });

  it('records an error event alongside the callback', async () => {
    const { sdk, handlers } = await started();
    sdk.failStream(new Error('Claude Code process exited with code 3'));
    await tick();
    const errorEvent = handlers.events.find((e) => e.type === 'error');
    expect(errorEvent?.payload).toMatchObject({ type: 'error', exitCode: 3 });
  });

  it('beaches on a stream that simply ends while the Pod is open', async () => {
    const { sdk, runner, handlers } = await started();
    sdk.endStream();
    await tick();
    expect(runner.status).toBe('beached');
    expect(handlers.beached[0]?.exitCode).toBe(0);
  });

  it('does NOT beach when the stream ends because stop() asked it to', async () => {
    const { sdk, runner, handlers } = await started();
    const stopping = runner.stop();
    sdk.endStream();
    await stopping;
    await tick();
    expect(handlers.beached).toHaveLength(0);
    expect(runner.status).toBe('idle');
  });
});
