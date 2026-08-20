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

describe('the frozen channel constants themselves', () => {
  it('declares exactly 21 invoke channels, all with distinct wire names', () => {
    const keys = Object.keys(INVOKE_CHANNELS);
    const values = Object.values(INVOKE_CHANNELS);
    expect(keys.length).toBe(21);
    expect(new Set(values).size).toBe(values.length);
  });

  it('declares exactly 6 push channels, all with distinct wire names', () => {
    const values = Object.values(EVENT_CHANNELS);
    expect(Object.keys(EVENT_CHANNELS).length).toBe(6);
    expect(new Set(values).size).toBe(values.length);
  });

  it('names the six panel channels exactly as the frozen contracts spell them', () => {
    expect(INVOKE_CHANNELS.beachcomberScan).toBe('beachcomber:scan');
    expect(INVOKE_CHANNELS.beachcomberPreview).toBe('beachcomber:preview');
    expect(INVOKE_CHANNELS.beachcomberTrash).toBe('beachcomber:trash');
    expect(INVOKE_CHANNELS.helmScopes).toBe('helm:scopes');
    expect(INVOKE_CHANNELS.helmLoad).toBe('helm:load');
    expect(INVOKE_CHANNELS.helmSave).toBe('helm:save');
    expect(EVENT_CHANNELS.helmChanged).toBe('push:helmChanged');
  });

  // A wire name colliding across the two constant objects would let a push
  // shadow an invoke in `ipcRenderer`, which is the kind of thing nobody finds
  // until a panel goes quiet in production.
  it('shares no wire name between the invoke and push constants', () => {
    const all = [...Object.values(INVOKE_CHANNELS), ...Object.values(EVENT_CHANNELS)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('invoke channels (criterion 2)', () => {
  it('registers exactly one handler for every channel in INVOKE_CHANNELS', () => {
    const installed = harness().channels;
    const declared = Object.values(INVOKE_CHANNELS);

    expect(new Set(installed).size, 'a channel was registered twice').toBe(installed.length);
    expect([...installed].sort()).toEqual([...declared].sort());
    expect(installed.length).toBe(21);
  });

  /**
   * `register` refuses a duplicate, and the six new channels did not weaken
   * that. The guard is unreachable from outside — every registration is
   * spelled once against a distinct `INVOKE_CHANNELS` member — so what is
   * pinned here is the property it protects: Electron is handed each channel
   * exactly once, including after the panel channels arrived. A second
   * `handle` on one channel is what silently replaces a handler in production.
   */
  it('hands ipcMain each channel exactly once, panel channels included', () => {
    const handled = [...harness().channels];

    expect(handled.length).toBe(new Set(handled).size);
    for (const channel of [
      INVOKE_CHANNELS.beachcomberScan,
      INVOKE_CHANNELS.beachcomberPreview,
      INVOKE_CHANNELS.beachcomberTrash,
      INVOKE_CHANNELS.helmScopes,
      INVOKE_CHANNELS.helmLoad,
      INVOKE_CHANNELS.helmSave,
    ]) {
      expect(handled.filter((name) => name === channel)).toHaveLength(1);
    }
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

    // `push:helmChanged` does not come from PodManager — it comes from
    // HelmService's watcher, through the SAME sink `src/main/index.ts` hands
    // both. Driving it here is what keeps this test's claim ("main emits every
    // channel") true rather than quietly scoped to the Pod pipeline.
    h.helm.watch('user');

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

  /**
   * The panel ports are INJECTED, and this is what says so. `src/main/ipc/**`
   * must reach neither the filesystem nor either service implementation: if it
   * could, "validation is shape-only and path resolution is the service's job"
   * would be a convention instead of a fact, and the next handler to need a
   * path would just import `node:path` and take one.
   */
  it('reaches neither node:fs nor the panel implementations from src/main/ipc', () => {
    for (const { file, text } of sourcesUnder('ipc')) {
      expect(/from\s+['"]node:fs(\/promises)?['"]/.test(text), `${file} imports node:fs`).toBe(
        false,
      );
      expect(/from\s+['"]node:path['"]/.test(text), `${file} imports node:path`).toBe(false);
      // The frozen CONTRACT under `shared/contracts/` is exactly what these
      // files are supposed to import — type-only. What is refused is the
      // IMPLEMENTATION under `src/main/`.
      expect(
        /from\s+['"](?![^'"]*shared\/contracts)[^'"]*\/beachcomber['"]/.test(text),
        `${file} imports the beachcomber implementation instead of taking the injected port`,
      ).toBe(false);
      expect(
        /from\s+['"](?![^'"]*shared\/contracts)[^'"]*\/helm['"]/.test(text),
        `${file} imports the helm implementation instead of taking the injected port`,
      ).toBe(false);
      expect(/\brequire\(/.test(text), `${file} uses require()`).toBe(false);
    }
  });

  /**
   * The vacuity guard for the scan above: a typo in the directory name, or a
   * filter that matched nothing, would make every assertion pass over an empty
   * list. The contract types are imported type-only, so a `beachcomber`
   * mention in the source is expected — an IMPORT of the implementation is not.
   */
  it('has ipc sources to scan at all, and they do name the panel contracts', () => {
    const files = sourcesUnder('ipc');
    expect(files.length).toBeGreaterThanOrEqual(4);
    const all = files.map((entry) => entry.text).join('\n');
    expect(all).toContain('shared/contracts/beachcomber');
    expect(all).toContain('shared/contracts/helm');
  });
});
