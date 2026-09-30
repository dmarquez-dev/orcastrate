/**
 * THE WATCHER IS ADVISORY AND CLEAN (criterion 11).
 *
 * This is the only file in the suite that turns the watcher on. Nothing here is
 * a safety assertion — the safety assertions live in `conflict.test.ts` with
 * `watchEnabled: false`, precisely so a flaky `fs.watch` can never be what makes
 * them green. What is asserted here is that the courtesy behaves: one push per
 * out-of-band change, no push after release, and no handle left behind.
 *
 * HANDLE LEAKS ARE ASSERTED, NOT ASSUMED. `trackWatchers` intercepts the one
 * seam every `fs.watch` in the module goes through and records whether each
 * handle it hands out is ever closed. `process.getActiveResourcesInfo()` is NOT
 * used: the watcher is created with `persistent: false`, so libuv unrefs it and
 * a leaked handle would not appear there — the assertion would pass while
 * asserting nothing. Counting opens against closes fails when a handle leaks.
 */

import type { FSWatcher } from 'node:fs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { helmFs } from '../../../src/main/helm/fs-ops';
import { sha256Of } from '../../../src/main/helm/revision';
import { HelmWatcher } from '../../../src/main/helm/watcher';

import {
  cleanupHelm,
  draftFrom,
  makeHarness,
  settle,
  testClock,
  tempRoot,
  writeOutOfBand,
} from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupHelm();
});

interface WatcherRecord {
  closed: boolean;
}

/** Every handle `src/main/helm` opens, and whether it was closed. */
function trackWatchers(): WatcherRecord[] {
  const records: WatcherRecord[] = [];
  const real = helmFs.watch;
  vi.spyOn(helmFs, 'watch').mockImplementation(((...args: Parameters<typeof real>) => {
    const watcher = real(...args) as FSWatcher;
    const record: WatcherRecord = { closed: false };
    records.push(record);
    const close = watcher.close.bind(watcher);
    watcher.close = (): void => {
      record.closed = true;
      close();
    };
    return watcher;
  }) as typeof real);
  return records;
}

describe('watch', () => {
  it('emits exactly one coalesced push naming the watched scope', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');
    await settle();

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    await settle();

    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]?.scopeId).toBe('user');
    expect(h.pushes[0]?.displayPath).toBe(h.userSettingsPath);
    // The timestamp came from the injected clock, so no assertion here depends
    // on the machine's wall clock.
    expect(h.pushes[0]?.changedAt).toBe(h.clock().toISOString());
  });

  it('emits nothing after watch(null)', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');
    await settle();
    h.service.watch(null);
    await settle();

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    await settle();

    expect(h.pushes).toEqual([]);
  });

  it('emits nothing after dispose, and leaves no watch handle behind', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const handles = trackWatchers();

    h.service.watch('user');
    await settle();
    // Non-vacuous: a handle really was opened, and it is still open.
    expect(handles).toHaveLength(1);
    expect(handles[0]?.closed).toBe(false);

    h.service.dispose();
    await settle();

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    await settle();

    expect(h.pushes).toEqual([]);
    expect(handles.every((handle) => handle.closed)).toBe(true);
  });

  it('closes the first handle when a second scope is watched', async () => {
    const h = makeHarness({ watchEnabled: true });
    h.addPod('pod-a');
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });
    writeOutOfBand(h.projectPath('pod-a'), { model: 'sonnet' });

    const handles = trackWatchers();

    h.service.watch('user');
    await settle();
    h.service.watch('project:pod-a');
    await settle();

    expect(handles).toHaveLength(2);
    expect(handles[0]?.closed).toBe(true);
    expect(handles[1]?.closed).toBe(false);
  });

  it('releases the first scope when a second is watched', async () => {
    const h = makeHarness({ watchEnabled: true });
    h.addPod('pod-a');
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });
    writeOutOfBand(h.projectPath('pod-a'), { model: 'sonnet' });

    h.service.watch('user');
    await settle();
    h.service.watch('project:pod-a');
    await settle();

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    await settle();
    expect(h.pushes).toEqual([]);

    writeOutOfBand(h.projectPath('pod-a'), { model: 'haiku' });
    await settle();
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]?.scopeId).toBe('project:pod-a');
  });

  it('survives the watched file being deleted', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');
    await settle();

    expect(() => rmSync(h.userSettingsPath)).not.toThrow();
    await settle();

    // A deletion is a change the form should hear about, and it must not throw
    // into the caller or strand a handle.
    expect(h.pushes).toHaveLength(1);
    expect(() => h.service.dispose()).not.toThrow();
  });

  it('watching a scope whose directory does not exist is a no-op, not a throw', async () => {
    const h = makeHarness({ watchEnabled: true });
    h.addPod('pod-a');

    expect(() => h.service.watch('project:pod-a')).not.toThrow();
    await settle();
    expect(h.pushes).toEqual([]);
  });

  it('does not report Helm own save as an outside change', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');
    await settle();

    const doc = await h.service.load('user');
    await h.service.save({
      scopeId: 'user',
      revision: doc.revision,
      managed: { ...doc.managed, model: 'opus' },
      unmanaged: doc.unmanaged,
      hooksJson: doc.hooksJson,
    });
    await settle();

    expect(h.pushes).toEqual([]);
  });

  it('still reports a foreign write that lands between the rename and the acknowledgement', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');
    await settle();

    // The window the defect lived in. `save` renames its temp file over the
    // target and then acknowledges; a foreign writer landing in between used to
    // have its bytes read back and adopted as Helm's own, so the watcher found
    // the next hash equal to what it had recorded and emitted nothing — the one
    // push that would have told the user someone else changed their file.
    const realRename = helmFs.renameSync;
    vi.spyOn(helmFs, 'renameSync').mockImplementation(((from: string, to: string) => {
      realRename(from, to);
      if (to === h.userSettingsPath) writeOutOfBand(h.userSettingsPath, { model: 'haiku' });
    }) as typeof realRename);

    const doc = await h.service.load('user');
    await h.service.save(draftFrom('user', doc, { managed: { ...doc.managed, model: 'opus' } }));
    await settle();

    // Helm acknowledged the bytes it wrote; the disk holds someone else's, so
    // the disagreement is real and the user hears about it.
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]?.scopeId).toBe('user');
    expect(h.pushes[0]?.displayPath).toBe(h.userSettingsPath);
  });
});

describe('acknowledgeOwnWrite identity', () => {
  /** A watcher pointed at an as-yet-absent `path`, plus the pushes it emits. */
  function watching(path: string): { watcher: HelmWatcher; path: string; pushes: unknown[] } {
    const pushes: unknown[] = [];
    const watcher = new HelmWatcher({
      now: testClock(),
      emitChanged: (push) => {
        pushes.push(push);
      },
    });
    watcher.watch({ scopeId: 'user', path });
    return { watcher, path, pushes };
  }

  it('treats the empty string and absence as DIFFERENT identities', async () => {
    // Criterion: a save whose serialized content is the empty string must
    // acknowledge `sha256Of('')`, never `null`. `save` does that unconditionally
    // — it hands `sha256Of(content)` over with no absent-case branch — and this
    // is the assertion that the two values are not interchangeable to the
    // watcher, which is why that branch must not come back.
    const empty = watching(join(tempRoot(), 'settings.json'));
    empty.watcher.acknowledgeOwnWrite(empty.path, sha256Of(''));
    writeOutOfBand(empty.path, '');
    await settle();
    expect(empty.pushes).toEqual([]);
    empty.watcher.dispose();

    const absent = watching(join(tempRoot(), 'settings.json'));
    absent.watcher.acknowledgeOwnWrite(absent.path, null);
    writeOutOfBand(absent.path, '');
    await settle();
    // Same file appearing with the same zero bytes, and this time a push —
    // because `null` says "there was no file", which an empty file is not.
    expect(absent.pushes).toHaveLength(1);
    absent.watcher.dispose();
  });
});

describe('watchEnabled: false', () => {
  it('makes watch a no-op', async () => {
    const h = makeHarness({ watchEnabled: false });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');
    await settle();
    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    await settle();

    expect(h.pushes).toEqual([]);
  });
});
