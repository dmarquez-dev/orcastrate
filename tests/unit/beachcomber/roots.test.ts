/**
 * Root enumeration and per-entry measurement.
 *
 * The two failure modes that matter here are "a root is missing" — normal, a
 * user who never pasted an image has no paste cache — and "a root is there but
 * unreadable", which must cost the user that root and nothing else.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createBeachcomberService } from '../../../src/main/beachcomber';
import { BEACHCOMBER_ROOTS } from '../../../src/shared/contracts/beachcomber';
import {
  cleanupFixtures,
  catchAsync,
  entryNamed,
  makeClaudeHome,
  makeDeps,
  makeDir,
  makeProject,
  makeTempBase,
  setMtime,
  writeAt,
} from './helpers';

afterEach(() => {
  cleanupFixtures();
});

function summaryOf(roots: { key: string }[], key: string): Record<string, unknown> {
  const found = roots.find((root) => root.key === key);
  if (found === undefined) throw new Error(`no summary for root ${key}`);
  return found as unknown as Record<string, unknown>;
}

describe('enumerating the four roots', () => {
  it('summarises all four roots with a display path, an entry count and a byte total', async () => {
    const home = makeClaudeHome();
    makeProject(home, 'C--work-one', [{ type: 'user', cwd: 'C:\\work\\one' }]);
    writeAt(home, join('shell-snapshots', 'snapshot-1.sh'), 'echo hi');
    writeAt(home, join('file-history', 'edit-1.txt'), '0123456789');
    writeAt(home, join('paste-cache', 'image-1.png'), 'PNG');

    const scan = await createBeachcomberService(makeDeps(home)).scan();

    expect(scan.roots.map((root) => root.key)).toEqual([...BEACHCOMBER_ROOTS]);
    for (const root of scan.roots) {
      expect(root.present).toBe(true);
      expect(root.error).toBeNull();
      expect(root.entryCount).toBe(1);
      expect(root.displayPath.length).toBeGreaterThan(0);
    }
    expect(summaryOf(scan.roots, 'fileHistory')['totalBytes']).toBe(10);
    expect(scan.entries).toHaveLength(4);
  });

  it('reports a root that does not exist as absent rather than raising', async () => {
    const home = makeClaudeHome();
    makeProject(home, 'C--work-one', [{ type: 'user', cwd: 'C:\\work\\one' }]);

    const scan = await createBeachcomberService(makeDeps(home)).scan();

    const pasteCache = summaryOf(scan.roots, 'pasteCache');
    expect(pasteCache['present']).toBe(false);
    expect(pasteCache['error']).toBeNull();
    expect(pasteCache['entryCount']).toBe(0);
    expect(pasteCache['totalBytes']).toBe(0);
  });

  it('reports an unreadable root with the OS message verbatim while the others still populate', async () => {
    const home = makeClaudeHome();
    makeProject(home, 'C--work-one', [{ type: 'user', cwd: 'C:\\work\\one' }]);
    writeAt(home, join('file-history', 'edit-1.txt'), '0123456789');
    // A plain file where a root directory belongs. Enumerating it raises the
    // same shape of OS fault as EACCES does — a non-ENOENT error carrying a
    // platform message — which is what the summary must surface untouched.
    writeFileSync(join(home, 'shell-snapshots'), 'not a directory', 'utf8');

    const scan = await createBeachcomberService(makeDeps(home)).scan();

    const broken = summaryOf(scan.roots, 'shellSnapshots');
    expect(broken['present']).toBe(true);
    expect(typeof broken['error']).toBe('string');
    expect(String(broken['error']).length).toBeGreaterThan(0);
    // The OS message, not a rewrite of it.
    expect(String(broken['error'])).toMatch(/shell-snapshots/);

    expect(summaryOf(scan.roots, 'projects')['entryCount']).toBe(1);
    expect(summaryOf(scan.roots, 'fileHistory')['entryCount']).toBe(1);
    expect(scan.entries.map((entry) => entry.name)).toContain('edit-1.txt');
  });

  it('treats a missing ~/.claude as four absent roots, not as a failure', async () => {
    const base = makeTempBase();
    const scan = await createBeachcomberService(makeDeps(join(base, '.claude'))).scan();

    expect(scan.entries).toHaveLength(0);
    expect(scan.roots.every((root) => root.present === false)).toBe(true);
  });

  it('raises IO when ~/.claude itself cannot be enumerated', async () => {
    const base = makeTempBase();
    const home = join(base, '.claude');
    writeFileSync(home, 'not a directory', 'utf8');

    const err = await catchAsync(() => createBeachcomberService(makeDeps(home)).scan());

    expect((err as { code?: string }).code).toBe('IO');
  });
});

describe('per-entry measurement', () => {
  it('totals size, file count and the newest mtime recursively beneath the entry', async () => {
    const home = makeClaudeHome();
    const project = makeProject(home, 'C--work-measured', [{ type: 'user', cwd: 'C:\\work\\measured' }]);
    const nested = makeDir(project, join('nested', 'deeper'));
    setMtime(join(project, 'session-a.jsonl'), '2025-11-02T08:00:00.000Z');
    const older = writeAt(project, 'a.txt', '12345');
    const newest = writeAt(nested, 'b.txt', '1234567890');
    setMtime(older, '2026-01-01T00:00:00.000Z');
    setMtime(newest, '2026-06-15T09:30:00.000Z');

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, 'C--work-measured');

    const transcriptBytes = entry.sizeBytes - 15;
    expect(transcriptBytes).toBeGreaterThan(0);
    expect(entry.fileCount).toBe(3);
    expect(entry.lastModified).toBe('2026-06-15T09:30:00.000Z');
  });

  it('counts jsonl session files for projects entries and reports null elsewhere', async () => {
    const home = makeClaudeHome();
    const project = makeProject(home, 'C--work-sessions', [{ type: 'user', cwd: 'C:\\work\\sessions' }]);
    writeAt(project, 'session-b.jsonl', '{"type":"user"}\n');
    writeAt(project, 'notes.md', 'not a session');
    writeAt(home, join('paste-cache', 'image-1.png'), 'PNG');

    const scan = await createBeachcomberService(makeDeps(home)).scan();

    expect(entryNamed(scan, 'C--work-sessions').sessionCount).toBe(2);
    expect(entryNamed(scan, 'image-1.png').sessionCount).toBeNull();
  });

  it('sorts entries by root order and then by size descending', async () => {
    const home = makeClaudeHome();
    makeProject(home, 'C--small', [{ type: 'user', cwd: 'C:\\small' }]);
    const big = makeProject(home, 'C--big', [{ type: 'user', cwd: 'C:\\big' }]);
    writeAt(big, 'bulk.bin', 'x'.repeat(4096));
    writeAt(home, join('paste-cache', 'image-1.png'), 'PNG');

    const scan = await createBeachcomberService(makeDeps(home)).scan();

    expect(scan.entries.map((entry) => entry.name)).toEqual(['C--big', 'C--small', 'image-1.png']);
  });

  it('reports the entry path as the display path for the three non-project roots', async () => {
    const home = makeClaudeHome();
    writeAt(home, join('file-history', 'edit-1.txt'), 'abc');

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, 'edit-1.txt');

    expect(entry.displayPath).toBe(join(home, 'file-history', 'edit-1.txt'));
    expect(entry.pathSource).toBe('decoded-name');
    expect(entry.orphan).toBe(false);
  });
});
