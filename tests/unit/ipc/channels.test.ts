/**
 * The channel surface itself (acceptance criteria 2, 11, 12).
 *
 * These tests enumerate the FROZEN CONSTANTS and compare them against what
 * main actually installed, in both directions: no contract channel may be left
 * unhandled, and no handler may exist for a channel the contract does not
 * declare. A drift in either direction is what leaves the renderer awaiting a
 * promise that never settles, or reachable capability nobody reviewed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../../src/shared/contracts/ipc';
import { ROUTING_MODE } from '../../../src/main/pod-manager';

import { driveFixture, findings, makeHarness, openPod, tick, type Harness } from './helpers';

const harnesses: Harness[] = [];

function harness(): Harness {
  const made = makeHarness();
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

describe('invoke channels (criterion 2)', () => {
  it('registers exactly one handler for every channel in INVOKE_CHANNELS', () => {
    const installed = harness().channels;
    const declared = Object.values(INVOKE_CHANNELS);

    expect(new Set(installed).size, 'a channel was registered twice').toBe(installed.length);
    expect([...installed].sort()).toEqual([...declared].sort());
  });

  it('registers no handler for a channel outside the contract', () => {
    const declared = new Set<string>(Object.values(INVOKE_CHANNELS));
    const extra = harness().channels.filter((channel) => !declared.has(channel));
    expect(extra).toEqual([]);
  });

  it('every declared channel actually answers', async () => {
    const h = harness();
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      // Called with no arguments on purpose: the point is that SOMETHING
      // settles, not that it succeeds. A missing handler would reject.
      const result = await h.invoke(channel);
      expect(result, `${channel} did not resolve an envelope`).toHaveProperty('ok');
    }
  });
});

describe('push channels (criterion 2)', () => {
  it('main emits every channel in EVENT_CHANNELS', async () => {
    const h = harness();
    const podId = await openPod(h);

    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    // A permission prompt, driven exactly as the SDK would drive it.
    const controller = new AbortController();
    const decision = h.sdk(podId).callCanUseTool(
      'Bash',
      { command: 'ls' },
      { requestId: 'req-channels', signal: controller.signal },
    );
    await tick();
    await h.invoke('permission:respond', {
      podId,
      requestId: 'req-channels',
      decision: 'allow',
    });
    await decision;

    const emitted = new Set(h.pushed.map((entry) => entry.channel));
    for (const channel of Object.values(EVENT_CHANNELS)) {
      expect(emitted.has(channel), `${channel} was never emitted by main`).toBe(true);
    }
  });
});

describe('routing mode has one source of truth (criterion 11)', () => {
  it('app:routingMode answers with the mode the live PodManager builds routers with', async () => {
    const h = harness();
    const result = await h.invoke<string>(INVOKE_CHANNELS.appRoutingMode);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(h.manager.routingMode);
    expect(result.value).toBe(ROUTING_MODE);
  });

  it('the shipped constant still matches the probe findings it was derived from', () => {
    expect(ROUTING_MODE).toBe(findings().recommendedRoutingMode);
  });
});

describe('this task ends at the IPC boundary (criterion 12)', () => {
  const SRC = fileURLToPath(new URL('../../../src/main/', import.meta.url));

  function sourcesUnder(dir: string): { file: string; text: string }[] {
    return readdirSync(join(SRC, dir))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => ({ file: `${dir}/${name}`, text: readFileSync(join(SRC, dir, name), 'utf8') }));
  }

  const owned = [...sourcesUnder('ipc'), ...sourcesUnder('pod-manager')];

  it('imports no React and nothing from the renderer', () => {
    for (const { file, text } of owned) {
      expect(/from\s+['"]react/.test(text), `${file} imports React`).toBe(false);
      expect(/from\s+['"][^'"]*renderer/.test(text), `${file} imports renderer code`).toBe(false);
    }
  });

  it('imports no electron, so the whole surface is testable without a runtime', () => {
    for (const { file, text } of owned) {
      expect(/from\s+['"]electron['"]/.test(text), `${file} imports electron`).toBe(false);
    }
  });
});
