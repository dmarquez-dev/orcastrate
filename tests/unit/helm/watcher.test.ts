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
 *
 * NO ASSERTION HERE WAITS A FIXED NUMBER OF TURNS. `fs.watch` delivers when the
 * platform gets round to it, so:
 *
 *  - A push that should ARRIVE is awaited with `waitFor`, which resolves the
 *    moment it is there and fails, naming what it waited for, if it never is.
 *  - A push that should NOT arrive, while a watch is still live, is asserted
 *    behind a `barrier`: a later out-of-band write on the watched path whose own
 *    push is awaited first. Anything the earlier change was going to raise has
 *    then either arrived ahead of it or been folded into it.
 *  - A push that should not arrive because NO watch is live is asserted after
 *    `trackWatchers` shows every handle closed (or none opened) BEFORE the
 *    out-of-band write. With no handle there is no callback to deliver one.
 */

import type { FSWatcher } from 'node:fs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HelmChangedPush } from '../../../src/shared/contracts/helm';
import { helmFs } from '../../../src/main/helm/fs-ops';
import { sha256Of } from '../../../src/main/helm/revision';
import { HelmWatcher } from '../../../src/main/helm/watcher';

import {
  cleanupHelm,
  draftFrom,
  makeHarness,
  testClock,
  tempRoot,
  waitFor,
  writeOutOfBand,
  type TestClock,
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

/**
 * Writes `path` out of band with bytes no earlier write used and waits for the
 * push that raises, then returns every push that arrived BEFORE it.
 *
 * The barrier push is told apart by its timestamp: the clock is advanced and the
 * file written with no turn of the event loop in between, so no flush can carry
 * the new instant unless it ran after the write — and any flush after the write
 * reads the barrier's bytes and IS the barrier push. Pushes stamped earlier came
 * from earlier changes.
 */
async function pushesBeforeBarrier(
  pushes: HelmChangedPush[],
  clock: TestClock,
  path: string,
): Promise<HelmChangedPush[]> {
  clock.advance(60_000);
  const stamp = clock().toISOString();
  writeOutOfBand(path, { barrier: stamp });
  await waitFor(
    () => pushes.some((push) => push.changedAt === stamp),
    `the barrier push for ${path} stamped ${stamp}`,
  );
  return pushes.slice(0, pushes.findIndex((push) => push.changedAt === stamp));
}

describe('watch', () => {
  it('emits exactly one coalesced push naming the watched scope', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');
    const changedAt = h.clock().toISOString();

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    await waitFor(() => h.pushes.length >= 1, 'a push for the out-of-band write to the user settings file');

    expect(h.pushes[0]?.scopeId).toBe('user');
    expect(h.pushes[0]?.displayPath).toBe(h.userSettingsPath);
    // The timestamp came from the injected clock, so no assertion here depends
    // on the machine's wall clock.
    expect(h.pushes[0]?.changedAt).toBe(changedAt);

    // Exactly one: every event the write raised has landed by the barrier.
    expect(await pushesBeforeBarrier(h.pushes, h.clock, h.userSettingsPath)).toHaveLength(1);
  });

  it('emits nothing after watch(null)', () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const handles = trackWatchers();

    h.service.watch('user');
    // Non-vacuous: a handle really was opened, and it is still open.
    expect(handles).toHaveLength(1);
    expect(handles[0]?.closed).toBe(false);

    h.service.watch(null);
    // Every handle is closed BEFORE the write, so nothing is left to hear it.
    expect(handles.every((handle) => handle.closed)).toBe(true);

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    expect(h.pushes).toEqual([]);
  });

  it('emits nothing after dispose, and leaves no watch handle behind', () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const handles = trackWatchers();

    h.service.watch('user');
    // Non-vacuous: a handle really was opened, and it is still open.
    expect(handles).toHaveLength(1);
    expect(handles[0]?.closed).toBe(false);

    h.service.dispose();
    // Every handle is closed BEFORE the write, so nothing is left to hear it.
    expect(handles.every((handle) => handle.closed)).toBe(true);

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    expect(h.pushes).toEqual([]);
  });

  it('closes the first handle when a second scope is watched', () => {
    const h = makeHarness({ watchEnabled: true });
    h.addPod('pod-a');
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });
    writeOutOfBand(h.projectPath('pod-a'), { model: 'sonnet' });

    const handles = trackWatchers();

    h.service.watch('user');
    h.service.watch('project:pod-a');

    expect(handles).toHaveLength(2);
    expect(handles[0]?.closed).toBe(true);
    expect(handles[1]?.closed).toBe(false);
  });

  it('releases the first scope when a second is watched', async () => {
    const h = makeHarness({ watchEnabled: true });
    h.addPod('pod-a');
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });
    writeOutOfBand(h.projectPath('pod-a'), { model: 'sonnet' });

    const handles = trackWatchers();

    h.service.watch('user');
    h.service.watch('project:pod-a');
    // The user scope's handle is closed before its file is written.
    expect(handles).toHaveLength(2);
    expect(handles[0]?.closed).toBe(true);

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });

    // The barrier is a write to the scope still watched; its push is the one
    // the released scope's write must not have been preceded by.
    expect(await pushesBeforeBarrier(h.pushes, h.clock, h.projectPath('pod-a'))).toEqual([]);
    expect(h.pushes.map((push) => push.scopeId)).toEqual(['project:pod-a']);
  });

  it('survives the watched file being deleted', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');

    expect(() => rmSync(h.userSettingsPath)).not.toThrow();

    // A deletion is a change the form should hear about, and it must not throw
    // into the caller or strand a handle.
    await waitFor(() => h.pushes.length >= 1, 'a push for the deletion of the user settings file');
    expect(await pushesBeforeBarrier(h.pushes, h.clock, h.userSettingsPath)).toHaveLength(1);
    expect(() => h.service.dispose()).not.toThrow();
  });

  it('watching a scope whose directory does not exist is a no-op, not a throw', () => {
    const h = makeHarness({ watchEnabled: true });
    h.addPod('pod-a');

    const handles = trackWatchers();

    expect(() => h.service.watch('project:pod-a')).not.toThrow();
    // No handle was opened, so nothing exists that could push.
    expect(handles).toEqual([]);
    expect(h.pushes).toEqual([]);
  });

  it('does not report Helm own save as an outside change', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');

    const doc = await h.service.load('user');
    await h.service.save({
      scopeId: 'user',
      revision: doc.revision,
      managed: { ...doc.managed, model: 'opus' },
      unmanaged: doc.unmanaged,
      hooksJson: doc.hooksJson,
    });

    expect(await pushesBeforeBarrier(h.pushes, h.clock, h.userSettingsPath)).toEqual([]);
  });

  it('still reports a foreign write that lands between the rename and the acknowledgement', async () => {
    const h = makeHarness({ watchEnabled: true });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    h.service.watch('user');

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

    // Helm acknowledged the bytes it wrote; the disk holds someone else's, so
    // the disagreement is real and the user hears about it.
    await waitFor(() => h.pushes.length >= 1, 'a push for the foreign write that landed during save');
    expect(h.pushes[0]?.scopeId).toBe('user');
    expect(h.pushes[0]?.displayPath).toBe(h.userSettingsPath);
    expect(await pushesBeforeBarrier(h.pushes, h.clock, h.userSettingsPath)).toHaveLength(1);
  });
});

describe('acknowledgeOwnWrite identity', () => {
  /** A watcher pointed at an as-yet-absent `path`, plus the pushes it emits. */
  function watching(path: string): {
    watcher: HelmWatcher;
    path: string;
    pushes: HelmChangedPush[];
    clock: TestClock;
  } {
    const pushes: HelmChangedPush[] = [];
    const clock = testClock();
    const watcher = new HelmWatcher({
      now: clock,
      emitChanged: (push) => {
        pushes.push(push);
      },
    });
    watcher.watch({ scopeId: 'user', path });
    return { watcher, path, pushes, clock };
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
    expect(await pushesBeforeBarrier(empty.pushes, empty.clock, empty.path)).toEqual([]);
    empty.watcher.dispose();

    const absent = watching(join(tempRoot(), 'settings.json'));
    absent.watcher.acknowledgeOwnWrite(absent.path, null);
    writeOutOfBand(absent.path, '');
    // Same file appearing with the same zero bytes, and this time a push —
    // because `null` says "there was no file", which an empty file is not.
    await waitFor(() => absent.pushes.length >= 1, 'a push for the empty file appearing where none was acknowledged');
    expect(await pushesBeforeBarrier(absent.pushes, absent.clock, absent.path)).toHaveLength(1);
    absent.watcher.dispose();
  });
});

describe('watchEnabled: false', () => {
  it('makes watch a no-op', () => {
    const h = makeHarness({ watchEnabled: false });
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const handles = trackWatchers();

    h.service.watch('user');
    // No handle was opened, so nothing exists that could hear the write.
    expect(handles).toEqual([]);

    writeOutOfBand(h.userSettingsPath, { model: 'opus' });
    expect(h.pushes).toEqual([]);
  });
});
