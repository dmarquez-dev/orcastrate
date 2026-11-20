/**
 * `recordAttempts` — the proxy that records what `PodManager` CALLED on its
 * `Pushes`, above `createPushes`' empty-batch filter.
 *
 * It is a transparent wrapper or it is a liability: every assertion over
 * `attempted` in the pod-manager suite trusts that the call reaching the real
 * `Pushes` is the call `PodManager` made. So the proxy must hand the underlying
 * method every argument it was given, with `this` bound to the target, and a
 * method read twice must be the same function — a proxy that minted a fresh
 * closure per read breaks any caller that compares, caches, or unsubscribes by
 * identity.
 */

import { describe, expect, it } from 'vitest';

import { EVENT_CHANNELS } from '../../../src/shared/contracts/ipc';
import type { Pushes } from '../../../src/main/pod-manager';
import { createPushes } from '../../../src/main/pod-manager';
import { recordAttempts, type Pushed } from './helpers';

/** The `Pushes` methods (`src/main/pod-manager/pushes.ts`); the test below keeps this list whole. */
const PUSH_METHODS = [
  'podEvent',
  'podStatus',
  'laneChanged',
  'permissionRequested',
  'permissionResolved',
  'podCommands',
  'autoModeSupport',
] as const satisfies readonly (keyof Pushes)[];

describe('recordAttempts forwards every argument to the underlying method', () => {
  it('passes both arguments of a two-argument method, in order, with this bound to the target', () => {
    const received: { self: unknown; args: unknown[] }[] = [];
    const target = {
      podEvent(this: unknown, first: unknown, second: unknown): void {
        received.push({ self: this, args: [first, second] });
      },
    };
    const attempted: Pushed[] = [];
    const proxy = recordAttempts(target as unknown as Pushes, attempted);

    (proxy.podEvent as unknown as (a: unknown, b: unknown) => void)('first', 'second');

    expect(received).toHaveLength(1);
    expect(received[0]?.args).toEqual(['first', 'second']);
    expect(received[0]?.self).toBe(target);
    // What is RECORDED is unchanged: the channel, and the first argument as payload.
    expect(attempted).toEqual([{ channel: EVENT_CHANNELS.podEvent, payload: 'first' }]);
  });

  it('returns what the underlying method returned', () => {
    const target = { podStatus: (): string => 'returned' };
    const proxy = recordAttempts(target as unknown as Pushes, []);

    expect((proxy.podStatus as unknown as () => unknown)()).toBe('returned');
  });
});

describe('recordAttempts returns one stable function per method', () => {
  it('covers every method createPushes returns', () => {
    // The table below is the set the identity tests iterate; this keeps it from
    // silently falling behind a sixth channel.
    expect([...PUSH_METHODS].sort()).toEqual(Object.keys(createPushes(() => {})).sort());
  });

  it.each(PUSH_METHODS)('reading %s twice on one proxy yields the identical function', (method) => {
    const proxy = recordAttempts(createPushes(() => {}), []);

    expect(proxy[method]).toBe(proxy[method]);
  });

  it('records every call made through the one cached function', () => {
    const sent: string[] = [];
    const attempted: Pushed[] = [];
    const proxy = recordAttempts(
      createPushes((channel) => {
        sent.push(channel);
      }),
      attempted,
    );
    const podStatus = proxy.podStatus;

    podStatus({ podId: 'p1', status: 'idle' });
    podStatus({ podId: 'p2', status: 'closed' });

    expect(attempted).toEqual([
      { channel: EVENT_CHANNELS.podStatus, payload: { podId: 'p1', status: 'idle' } },
      { channel: EVENT_CHANNELS.podStatus, payload: { podId: 'p2', status: 'closed' } },
    ]);
    expect(sent).toEqual([EVENT_CHANNELS.podStatus, EVENT_CHANNELS.podStatus]);
  });
});
