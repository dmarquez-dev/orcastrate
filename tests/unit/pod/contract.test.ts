/**
 * Acceptance criterion 1: the implementation carries exactly the frozen
 * interface — no added members, no removed ones — and criterion 11: nothing in
 * this suite spawns the real binary.
 */

import { describe, expect, it } from 'vitest';

import type { CreatePodRunner, PodRunner } from '../../../src/shared/contracts/pod-runner';
import { createPodRunner, createPodRunnerWith } from '../../../src/main/pod';
import { makeFakeSdk, podOptions } from './helpers';

/** Compile-time proof, in the test rather than the source, that both match. */
const factory: CreatePodRunner = createPodRunner;
void factory;

const EXPECTED_MEMBERS = [
  'podId',
  'status',
  'start',
  'send',
  'interrupt',
  'setPermissionMode',
  'stop',
  'sendToAgent',
  'supportedCommands',
] as const;

function membersOf(instance: object): string[] {
  const own = Object.getOwnPropertyNames(instance);
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(instance)).filter(
    (n) => n !== 'constructor',
  );
  return [...new Set([...own, ...proto])].sort();
}

describe('PodRunner conforms to the frozen contract (criterion 1)', () => {
  const runner: PodRunner = createPodRunnerWith(makeFakeSdk().bridge)(podOptions());

  it('exposes exactly the contract`s members and nothing more', () => {
    expect(membersOf(runner)).toEqual([...EXPECTED_MEMBERS].sort());
  });

  it('exposes podId from the options', () => {
    expect(runner.podId).toBe('pod-1');
  });

  it('starts idle', () => {
    expect(runner.status).toBe('idle');
  });

  it('has every method as a function', () => {
    for (const name of ['start', 'send', 'interrupt', 'setPermissionMode', 'stop', 'sendToAgent']) {
      expect(typeof (runner as unknown as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('the production factory has the frozen CreatePodRunner signature', () => {
    expect(typeof createPodRunner).toBe('function');
    expect(createPodRunner.length).toBe(1);
  });
});
