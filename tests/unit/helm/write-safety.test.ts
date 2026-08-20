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

import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { backupPathFor, tempPathFor, writeAtomic } from '../../../src/main/helm';

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
