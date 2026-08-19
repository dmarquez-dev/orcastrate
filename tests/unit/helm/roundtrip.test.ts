/**
 * ROUND TRIP PRESERVES WHAT HELM DOES NOT MANAGE (criterion 4) and HOOKS ARE
 * NEVER RESTRUCTURED (criterion 15).
 *
 * These files are hand-edited. A settings editor that quietly drops the key it
 * did not recognise is a data-loss tool for exactly the person it was built
 * for, so "load, change nothing, save" has to be a no-op on content.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupHelm,
  draftFrom,
  makeHarness,
  readText,
  writeOutOfBand,
} from './helpers';

/**
 * Three unmanaged top-level keys, one of them a nested object, one an array —
 * plus every managed key, so the merge back is exercised rather than skipped.
 */
const FIXTURE = {
  model: 'claude-sonnet-4-5',
  statusLine: { type: 'command', command: 'ccstatus', padding: 0 },
  outputStyle: 'Explanatory',
  additionalDirectories: ['../shared', '../docs'],
  permissions: {
    allow: ['Bash(npm test)', 'Read(//c/work/**)'],
    deny: ['Bash(rm:*)'],
    defaultMode: 'acceptEdits',
    additionalDirectories: ['../vendor'],
  },
  env: { FOO: 'bar', BAZ: 'qux' },
  crossSessionInbound: 'accept',
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'echo hi', timeout: 5 }],
      },
    ],
  },
};

afterEach(cleanupHelm);

describe('round trip', () => {
  it('leaves the file deep-equal under JSON.parse after an untouched save', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, FIXTURE);
    const before = JSON.parse(readText(h.userSettingsPath)) as unknown;

    const doc = await h.service.load('user');
    await h.service.save(draftFrom('user', doc));

    expect(JSON.parse(readText(h.userSettingsPath))).toEqual(before);
  });

  it('preserves every unmanaged top-level key including nested objects and arrays', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, FIXTURE);

    const doc = await h.service.load('user');
    expect(doc.unmanaged['statusLine']).toEqual(FIXTURE.statusLine);
    expect(doc.unmanaged['outputStyle']).toBe('Explanatory');
    expect(doc.unmanaged['additionalDirectories']).toEqual(FIXTURE.additionalDirectories);

    // A managed edit must not disturb any of them.
    await h.service.save(draftFrom('user', doc, { managed: { ...doc.managed, model: 'opus' } }));

    const after = JSON.parse(readText(h.userSettingsPath)) as Record<string, unknown>;
    expect(after['statusLine']).toEqual(FIXTURE.statusLine);
    expect(after['outputStyle']).toBe('Explanatory');
    expect(after['additionalDirectories']).toEqual(FIXTURE.additionalDirectories);
    expect(after['model']).toBe('opus');
  });

  it('keeps the parts of `permissions` Helm does not manage', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, FIXTURE);

    const doc = await h.service.load('user');
    await h.service.save(
      draftFrom('user', doc, {
        managed: { ...doc.managed, permissionsAllow: ['Bash(npm run build)'] },
      }),
    );

    const permissions = (JSON.parse(readText(h.userSettingsPath)) as Record<string, unknown>)[
      'permissions'
    ] as Record<string, unknown>;
    expect(permissions['allow']).toEqual(['Bash(npm run build)']);
    expect(permissions['deny']).toEqual(['Bash(rm:*)']);
    expect(permissions['defaultMode']).toBe('acceptEdits');
    expect(permissions['additionalDirectories']).toEqual(['../vendor']);
  });

  it('writes no key for an empty managed field', async () => {
    const h = makeHarness();
    h.addPod('pod-a');

    const doc = await h.service.load('project:pod-a');
    await h.service.save(draftFrom('project:pod-a', doc, { managed: { ...doc.managed, model: 'opus' } }));

    expect(JSON.parse(readText(h.projectPath('pod-a')))).toEqual({ model: 'opus' });
  });
});

describe('hooks', () => {
  it('round-trips a hooks object deep-equal and adds no key to it', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, FIXTURE);

    const doc = await h.service.load('user');
    expect(JSON.parse(doc.hooksJson)).toEqual(FIXTURE.hooks);

    await h.service.save(draftFrom('user', doc));

    const after = (JSON.parse(readText(h.userSettingsPath)) as Record<string, unknown>)['hooks'];
    expect(after).toEqual(FIXTURE.hooks);
    // Not merely deep-equal at the top: the exact key set, all the way down.
    expect(JSON.stringify(after)).toBe(JSON.stringify(FIXTURE.hooks));
  });

  it('omits the hooks key entirely when the pane is empty', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, FIXTURE);

    const doc = await h.service.load('user');
    await h.service.save(draftFrom('user', doc, { hooksJson: '' }));

    expect(JSON.parse(readText(h.userSettingsPath))).not.toHaveProperty('hooks');
  });
});
