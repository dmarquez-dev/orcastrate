/**
 * WRITE SAFETY, one criterion per rule.
 *
 *   5. ATOMIC, SAME DIRECTORY — and a crash in the one window that matters.
 *   6. BACKUP BEFORE EVERY WRITE.
 *   7. A FAILED BACKUP ABORTS THE WRITE.
 *  12. OS ERRORS REACH THE USER VERBATIM.
 *
 * Criterion 12 is asserted by capturing the message the OS ACTUALLY produced —
 * the test performs the identical failing syscall itself and compares for
 * equality. A hand-written expected string would drift from what the platform
 * says and would still pass, which is the failure mode the criterion names.
 */

import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { backupPathFor, backupPathForSequence, tempPathFor, writeAtomic } from '../../../src/main/helm';

import {
  anotherService,
  catchIpcFailure,
  cleanupHelm,
  draftFrom,
  listFiles,
  makeHarness,
  readText,
  writeOutOfBand,
} from './helpers';

afterEach(cleanupHelm);

describe('atomic write', () => {
  it('creates its temp file in the target file own directory and nowhere else', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const tempPath = tempPathFor(h.userSettingsPath, h.clock());
    expect(dirname(tempPath)).toBe(dirname(h.userSettingsPath));

    const doc = await h.service.load('user');
    await h.service.save(draftFrom('user', doc, { managed: { ...doc.managed, model: 'opus' } }));

    // Exactly the target and the backup beside it. No temp file survives, and
    // nothing at all was created outside the settings file's own directory.
    expect(listFiles(h.root)).toEqual(
      [
        relative(h.root, backupPathFor(h.userSettingsPath, h.clock())),
        relative(h.root, h.userSettingsPath),
      ].sort(),
    );
  });

  it('leaves the original byte-identical when a crash lands between temp and rename', () => {
    const h = makeHarness();
    const original = writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });
    const before = listFiles(h.root);

    let observedTemp = '';
    expect(() =>
      writeAtomic(h.userSettingsPath, '{"model":"opus"}\n', h.clock(), {
        beforeRename: (tempPath) => {
          observedTemp = tempPath;
          throw new Error('crash between the temp write and the rename');
        },
      }),
    ).toThrow('crash between the temp write and the rename');

    expect(dirname(observedTemp)).toBe(dirname(h.userSettingsPath));
    expect(readText(h.userSettingsPath)).toBe(original);
    // No partial write, and no stranded temp file either.
    expect(listFiles(h.root)).toEqual(before);
  });
});

describe('backup', () => {
  it('writes a timestamped backup whose bytes equal the pre-write content', async () => {
    const h = makeHarness();
    const original = writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const doc = await h.service.load('user');
    const result = await h.service.save(
      draftFrom('user', doc, { managed: { ...doc.managed, model: 'opus' } }),
    );

    expect(result.backupDisplayPath).toBe(backupPathFor(h.userSettingsPath, h.clock()));
    expect(readText(result.backupDisplayPath)).toBe(original);
    expect(dirname(result.backupDisplayPath)).toBe(dirname(h.userSettingsPath));
    // The timestamp came from the injected clock, not from the wall clock.
    expect(result.backupDisplayPath).toContain('2026-08-19T09-00-00-000Z');
    expect(JSON.parse(readText(h.userSettingsPath))).toEqual({ model: 'opus' });
  });

  it('produces two distinctly named backups for two successive saves', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const first = await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: {
          model: 'opus',
          permissionsAllow: [],
          permissionsDeny: [],
          env: {},
          crossSessionInbound: null,
        },
      }),
    );

    h.clock.advance(61_000);

    const second = await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: {
          model: 'haiku',
          permissionsAllow: [],
          permissionsDeny: [],
          env: {},
          crossSessionInbound: null,
        },
      }),
    );

    expect(second.backupDisplayPath).not.toBe(first.backupDisplayPath);
    expect(JSON.parse(readText(first.backupDisplayPath))).toEqual({ model: 'sonnet' });
    expect(JSON.parse(readText(second.backupDisplayPath))).toEqual({ model: 'opus' });
  });

  it('keeps two backups apart when both saves land in the SAME millisecond', async () => {
    const h = makeHarness();
    const original = writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    // The clock is never advanced between these two saves, so both derive the
    // same stamp. Before the sequence suffix existed the second `copyFileSync`
    // clobbered the first backup and the 'sonnet' content was gone.
    const first = await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: { ...(await h.service.load('user')).managed, model: 'opus' },
      }),
    );
    const second = await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: { ...(await h.service.load('user')).managed, model: 'haiku' },
      }),
    );

    // The first keeps the deterministic name; only the second is suffixed.
    expect(first.backupDisplayPath).toBe(backupPathFor(h.userSettingsPath, h.clock()));
    expect(second.backupDisplayPath).toBe(
      backupPathForSequence(h.userSettingsPath, h.clock(), 1),
    );
    expect(second.backupDisplayPath).not.toBe(first.backupDisplayPath);

    // Both survive, and each holds what was on disk immediately before its own
    // write — which is the whole point of keeping them apart.
    expect(readText(first.backupDisplayPath)).toBe(original);
    expect(JSON.parse(readText(second.backupDisplayPath))).toEqual({ model: 'opus' });
    expect(JSON.parse(readText(h.userSettingsPath))).toEqual({ model: 'haiku' });

    // The success path is otherwise untouched: the result still carries a
    // document reflecting what was written.
    expect(first.document.managed.model).toBe('opus');
    expect(second.document.managed.model).toBe('haiku');
  });

  it('keeps two backups apart when two services save one file in the SAME millisecond', async () => {
    const h = makeHarness();
    // Same deps, so the same un-advanced clock and the same settings file. The
    // ordinal is process-wide: a second service must not restart it at 0 and
    // let its `copyFileSync` clobber the first service's backup.
    const other = anotherService(h.deps);
    const original = writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    const firstDoc = await h.service.load('user');
    await h.service.save(draftFrom('user', firstDoc, { managed: { ...firstDoc.managed, model: 'opus' } }));
    const savedByFirst = readText(h.userSettingsPath);

    const secondDoc = await other.load('user');
    await other.save(draftFrom('user', secondDoc, { managed: { ...secondDoc.managed, model: 'haiku' } }));

    const zeroth = backupPathFor(h.userSettingsPath, h.clock());
    const oneth = backupPathForSequence(h.userSettingsPath, h.clock(), 1);
    expect(existsSync(zeroth)).toBe(true);
    expect(existsSync(oneth)).toBe(true);
    expect(readText(zeroth)).toBe(original);
    expect(readText(oneth)).toBe(savedByFirst);
  });

  it('takes the deterministic first name again once the clock moves on', async () => {
    const h = makeHarness();
    writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: { ...(await h.service.load('user')).managed, model: 'opus' },
      }),
    );
    await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: { ...(await h.service.load('user')).managed, model: 'haiku' },
      }),
    );

    h.clock.advance(1);

    // A new stamp is a new count. Nothing accumulates across milliseconds, and
    // the ordinary case keeps the ordinary name.
    const third = await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: { ...(await h.service.load('user')).managed, model: 'sonnet' },
      }),
    );
    expect(third.backupDisplayPath).toBe(backupPathFor(h.userSettingsPath, h.clock()));
  });

  it('gives the deterministic first name to the first save that actually backs up', async () => {
    const h = makeHarness();

    // No file yet: nothing to lose, so no backup file and a null backup path.
    // That save must NOT consume the deterministic name.
    const created = await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: { ...(await h.service.load('user')).managed, model: 'opus' },
      }),
    );
    expect(created.backupDisplayPath).toBe('');
    expect(listFiles(h.root)).toEqual([relative(h.root, h.userSettingsPath)]);

    const second = await h.service.save(
      draftFrom('user', await h.service.load('user'), {
        managed: { ...(await h.service.load('user')).managed, model: 'haiku' },
      }),
    );
    expect(second.backupDisplayPath).toBe(backupPathFor(h.userSettingsPath, h.clock()));
  });

  it('aborts the write when the backup cannot be taken', async () => {
    const h = makeHarness();
    const original = writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    // A directory sitting where the backup must go: the copy cannot succeed,
    // so rule 2 says the write must not happen at all.
    const backupPath = backupPathFor(h.userSettingsPath, h.clock());
    mkdirSync(backupPath);

    const doc = await h.service.load('user');
    const failure = await catchIpcFailure(() =>
      h.service.save(draftFrom('user', doc, { managed: { ...doc.managed, model: 'opus' } })),
    );

    expect(readText(h.userSettingsPath)).toBe(original);

    // Criterion 12: the OS message, unmodified. Captured by performing the very
    // same copy the service performed.
    let expected = '';
    try {
      copyFileSync(h.userSettingsPath, backupPath);
    } catch (err) {
      expected = (err as Error).message;
    }
    expect(expected).not.toBe('');
    expect(failure.message).toBe(expected);
    expect(failure.code).toBe('IO');
  });

  it('does not step past an obstruction onto a suffixed name', async () => {
    const h = makeHarness();
    const original = writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });
    const before = listFiles(h.root);

    // Same obstruction as above, asserted against the ONE thing the sequence
    // suffix could have broken: an implementation that probed the disk would
    // see the directory, call the name taken, move to `.1.bak` and let the
    // write proceed — rule 7 silently gone. The count lives in memory and is
    // zero here, so the obstructed name is the only name tried.
    mkdirSync(backupPathFor(h.userSettingsPath, h.clock()));

    const doc = await h.service.load('user');
    await catchIpcFailure(() =>
      h.service.save(draftFrom('user', doc, { managed: { ...doc.managed, model: 'opus' } })),
    );

    expect(readText(h.userSettingsPath)).toBe(original);
    // No `.1.bak`, no temp file, nothing new at all beyond the directory the
    // test itself planted.
    expect(listFiles(h.root)).toEqual(before);
  });
});

describe('verbatim OS errors', () => {
  it('surfaces the write failure message unmodified when the target cannot be written', async () => {
    const h = makeHarness();
    const original = writeOutOfBand(h.userSettingsPath, { model: 'sonnet' });

    // A directory where the atomic temp file has to go makes the location
    // unwritable for the one syscall that matters.
    const tempPath = tempPathFor(h.userSettingsPath, h.clock());
    mkdirSync(tempPath);

    const doc = await h.service.load('user');
    const failure = await catchIpcFailure(() =>
      h.service.save(draftFrom('user', doc, { managed: { ...doc.managed, model: 'opus' } })),
    );

    let expected = '';
    try {
      writeFileSync(tempPath, 'x', 'utf8');
    } catch (err) {
      expected = (err as Error).message;
    }
    expect(expected).not.toBe('');
    expect(failure.message).toBe(expected);
    // The verbatim message must not have cost the file its contents.
    expect(readText(h.userSettingsPath)).toBe(original);
  });
});
