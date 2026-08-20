/**
 * CONFLICT DETECTION IS THE AUTHORITATIVE GUARD (criteria 8, 9, 10).
 *
 * EVERY test in this file runs with `watchEnabled: false`. That is not a
 * convenience — it is the point. `fs.watch` misses events on some platforms and
 * coalesces on others, so a suite that let a working watcher make these tests
 * green would be asserting the courtesy and calling it the guarantee. With the
 * watcher off, the only thing that can pass these is the re-read-and-compare in
 * `save`.
 *
 * Criterion 10 is the case that actually happens: the other writer is INSIDE
 * this app. `alwaysAllowUpdates` (`src/main/pod/options.ts:170-185`) returns an
 * `addRules` update with `destination: 'projectSettings'`, so every "Allow
 * always" click has the CLI rewrite the same `settings.json` a Helm form may
 * have open — one click away, in the same window, and the user will not connect
 * the two events.
 */

import { rmSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import {
  catchIpcFailure,
  cleanupHelm,
  draftFrom,
  listFiles,
  makeHarness,
  readText,
  writeOutOfBand,
} from './helpers';

afterEach(cleanupHelm);

describe('conflict, with the watcher OFF', () => {
  it('refuses a save when the file changed out of band, and takes no backup', async () => {
    const h = makeHarness({ watchEnabled: false });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const doc = await h.service.load('user');

    const outOfBand = writeOutOfBand(h.userSettingsPath, {
      model: 'sonnet',
      env: { SOMEONE_ELSE: '1' },
    });
    const filesAfterOutOfBandWrite = listFiles(h.root);

    const failure = await catchIpcFailure(() =>
      h.service.save(draftFrom('user', doc, { managed: { ...doc.managed, model: 'opus' } })),
    );

    expect(failure.code).toBe('CONFLICT');
    expect(failure.message).toContain(h.userSettingsPath);
    expect(failure.message).toContain('Nothing was written');

    // The other writer's bytes, exactly. Not merged, not overwritten.
    expect(readText(h.userSettingsPath)).toBe(outOfBand);
    // NO BACKUP. A conflict is not a write, so it must not leave one behind.
    expect(listFiles(h.root)).toEqual(filesAfterOutOfBandWrite);
  });

  it('lets the same edit through once it is saved against the fresh revision', async () => {
    const h = makeHarness({ watchEnabled: false });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const stale = await h.service.load('user');
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet', outputStyle: 'Explanatory' });

    await catchIpcFailure(() =>
      h.service.save(draftFrom('user', stale, { managed: { ...stale.managed, model: 'opus' } })),
    );

    // The override is a second save against what the user has now SEEN.
    const fresh = await h.service.load('user');
    const result = await h.service.save(
      draftFrom('user', fresh, { managed: { ...fresh.managed, model: 'opus' } }),
    );

    expect(result.document.managed.model).toBe('opus');
    expect(JSON.parse(readText(h.userSettingsPath))).toEqual({
      model: 'opus',
      outputStyle: 'Explanatory',
    });
  });

  it('ABSENCE CAN BE RACED TOO: a file created after a null-revision load conflicts', async () => {
    const h = makeHarness({ watchEnabled: false });
    h.addPod('pod-a');

    const doc = await h.service.load('project:pod-a');
    expect(doc.revision).toBeNull();

    const created = writeOutOfBand(h.projectPath('pod-a'), { model: 'haiku' });

    const failure = await catchIpcFailure(() =>
      h.service.save(
        draftFrom('project:pod-a', doc, { managed: { ...doc.managed, model: 'opus' } }),
      ),
    );

    expect(failure.code).toBe('CONFLICT');
    expect(readText(h.projectPath('pod-a'))).toBe(created);
  });

  it('a file DELETED after load also conflicts rather than being recreated blindly', async () => {
    const h = makeHarness({ watchEnabled: false });
    h.addPod('pod-a');
    writeOutOfBand(h.projectPath('pod-a'), { model: 'haiku' });

    const doc = await h.service.load('project:pod-a');
    rmSync(h.projectPath('pod-a'));

    const failure = await catchIpcFailure(() =>
      h.service.save(draftFrom('project:pod-a', doc)),
    );
    expect(failure.code).toBe('CONFLICT');
  });
});

describe('allow_always: the in-app writer, with the watcher OFF', () => {
  /**
   * Reproduces exactly what `src/main/pod/options.ts:170-185` causes. The CLI
   * receives an `addRules` / `projectSettings` update and rewrites the project
   * `settings.json` — while a Helm draft for `project:<podId>` is open in the
   * same window.
   */
  it('answers CONFLICT and loses nothing when the CLI writes a permissions.allow rule', async () => {
    const h = makeHarness({ watchEnabled: false });
    const pod = h.addPod('pod-a', 'Refactor the router');
    writeOutOfBand(h.projectPath(pod.podId), {
      permissions: { allow: ['Bash(npm test)'] },
      outputStyle: 'Explanatory',
    });

    // The user opens Helm on this Pod's project settings.
    const draft = await h.service.load('project:pod-a');
    expect(draft.managed.permissionsAllow).toEqual(['Bash(npm test)']);

    // The user then clicks "Allow always" on a permission card. The CLI writes
    // the rule straight into the same file.
    const afterCli = writeOutOfBand(h.projectPath(pod.podId), {
      permissions: { allow: ['Bash(npm test)', 'Bash(npm run build)'] },
      outputStyle: 'Explanatory',
    });

    // The user goes back to Helm and saves their own unrelated edit.
    const failure = await catchIpcFailure(() =>
      h.service.save(
        draftFrom('project:pod-a', draft, {
          managed: { ...draft.managed, model: 'opus' },
        }),
      ),
    );

    expect(failure.code).toBe('CONFLICT');
    expect(failure.message).toContain(h.projectPath(pod.podId));
    expect(failure.message).toContain('Nothing was written');

    // The CLI's rule survives, byte for byte. Nothing was merged behind anyone's back.
    expect(readText(h.projectPath(pod.podId))).toBe(afterCli);

    // And a reload shows the user what they are about to overwrite.
    const reloaded = await h.service.load('project:pod-a');
    expect(reloaded.managed.permissionsAllow).toEqual(['Bash(npm test)', 'Bash(npm run build)']);

    // No push was emitted: the watcher is off, so the guarantee rested entirely
    // on the re-read.
    expect(h.pushes).toEqual([]);
  });
});
