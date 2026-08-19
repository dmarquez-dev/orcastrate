/**
 * Preview shows exactly what will be removed, and trash reports partial success
 * as a value rather than as a failed operation.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createBeachcomberService } from '../../../src/main/beachcomber';
import {
  cleanupFixtures,
  entryNamed,
  fakeTrash,
  makeClaudeHome,
  makeDeps,
  makeProject,
  writeAt,
} from './helpers';

afterEach(() => {
  cleanupFixtures();
});

function seededHome(): string {
  const home = makeClaudeHome();
  const alpha = makeProject(home, 'C--Users-x-Repos-alpha', [
    { type: 'user', cwd: 'C:\\Users\\x\\Repos\\alpha' },
  ]);
  writeAt(alpha, join('nested', 'deep-note.txt'), '12345');
  makeProject(home, 'C--Users-x-Repos-beta', [{ type: 'user', cwd: 'C:\\Users\\x\\Repos\\beta' }]);
  makeProject(home, 'C--Users-x-Repos-gamma', [{ type: 'user', cwd: 'C:\\Users\\x\\Repos\\gamma' }]);
  return home;
}

describe('preview', () => {
  it('totals exactly the items it lists', async () => {
    const service = createBeachcomberService(makeDeps(seededHome()));
    const scan = await service.scan();
    const ids = scan.entries.map((entry) => entry.id);

    const preview = await service.preview({ scanId: scan.scanId, ids });

    expect(preview.items).toHaveLength(3);
    expect(preview.totalBytes).toBe(
      preview.items.reduce((total, item) => total + item.sizeBytes, 0),
    );
    expect(preview.totalFiles).toBe(
      preview.items.reduce((total, item) => total + item.fileCount, 0),
    );
    expect(preview.refused).toHaveLength(0);
  });

  it('samples bare file names that contain no path separator at all', async () => {
    const service = createBeachcomberService(makeDeps(seededHome()));
    const scan = await service.scan();
    const alpha = entryNamed(scan, 'C--Users-x-Repos-alpha');

    const preview = await service.preview({ scanId: scan.scanId, ids: [alpha.id] });
    const names = preview.items[0]?.sampleNames ?? [];

    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThanOrEqual(20);
    expect(names).toContain('deep-note.txt');
    for (const name of names) {
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
    }
  });

  it('caps the sample at twenty names however many files there are', async () => {
    const home = makeClaudeHome();
    const many = makeProject(home, 'C--work-many', [{ type: 'user', cwd: 'C:\\work\\many' }]);
    for (let i = 0; i < 40; i += 1) {
      writeAt(many, `file-${String(i).padStart(3, '0')}.txt`, 'x');
    }
    const service = createBeachcomberService(makeDeps(home));
    const scan = await service.scan();

    const preview = await service.preview({
      scanId: scan.scanId,
      ids: [entryNamed(scan, 'C--work-many').id],
    });

    expect(preview.items[0]?.sampleNames).toHaveLength(20);
  });

  it('marks an entry stale when it vanished between the scan and the preview', async () => {
    const home = seededHome();
    const service = createBeachcomberService(makeDeps(home));
    const scan = await service.scan();
    const beta = entryNamed(scan, 'C--Users-x-Repos-beta');

    // Something outside Orcastrate removed it after the scan.
    rmSync(join(home, 'projects', 'C--Users-x-Repos-beta'), { recursive: true, force: true });

    const preview = await service.preview({ scanId: scan.scanId, ids: [beta.id] });

    expect(preview.items[0]?.stale).toBe(true);
    expect(preview.items[0]?.sampleNames).toEqual([]);
  });
});

describe('trash', () => {
  it('moves each selected entry through the injected port and nothing else', async () => {
    const home = seededHome();
    const trash = fakeTrash();
    const service = createBeachcomberService(makeDeps(home, { trashItem: trash.trashItem }));
    const scan = await service.scan();
    const beta = entryNamed(scan, 'C--Users-x-Repos-beta');

    const result = await service.trash({ scanId: scan.scanId, ids: [beta.id] });

    expect(result.trashed).toEqual([beta.id]);
    expect(result.failed).toEqual([]);
    expect(trash.calls).toEqual([join(home, 'projects', 'C--Users-x-Repos-beta')]);
    expect(result.scan.entries.map((entry) => entry.name)).toEqual([
      'C--Users-x-Repos-alpha',
      'C--Users-x-Repos-gamma',
    ]);
  });

  it('hands the port the location under ~/.claude, never the working directory it describes', async () => {
    const home = seededHome();
    const trash = fakeTrash();
    const service = createBeachcomberService(makeDeps(home, { trashItem: trash.trashItem }));
    const scan = await service.scan();
    const beta = entryNamed(scan, 'C--Users-x-Repos-beta');

    await service.trash({ scanId: scan.scanId, ids: [beta.id] });

    expect(trash.calls[0]).toBe(join(home, 'projects', beta.name));
    expect(trash.calls[0]).not.toBe(beta.displayPath);
  });

  it('reports partial success as a value, listing the rest as trashed and not throwing', async () => {
    const home = seededHome();
    const locked = join(home, 'projects', 'C--Users-x-Repos-beta');
    const trash = fakeTrash({ rejectFor: [locked], message: 'EBUSY: resource busy or locked' });
    const service = createBeachcomberService(makeDeps(home, { trashItem: trash.trashItem }));
    const scan = await service.scan();
    const alpha = entryNamed(scan, 'C--Users-x-Repos-alpha');
    const beta = entryNamed(scan, 'C--Users-x-Repos-beta');
    const gamma = entryNamed(scan, 'C--Users-x-Repos-gamma');

    const result = await service.trash({
      scanId: scan.scanId,
      ids: [alpha.id, beta.id, gamma.id],
    });

    expect(result.trashed).toEqual([alpha.id, gamma.id]);
    expect(result.failed).toEqual([
      { id: beta.id, displayPath: beta.displayPath, message: 'EBUSY: resource busy or locked' },
    ]);
    expect(result.scan.entries.map((entry) => entry.name)).toEqual(['C--Users-x-Repos-beta']);
    expect(result.scan.scanId).not.toBe(scan.scanId);
  });
});
