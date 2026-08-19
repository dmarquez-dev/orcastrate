/**
 * Ids are opaque tokens, scoped to the scan that minted them.
 *
 * This is the whole reason the no-paths rule survives a panel whose subject is
 * paths: the renderer holds a token, main holds the map, and a token from a
 * stale scan is refused outright rather than rematched onto whatever directory
 * has since taken that row's place.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createBeachcomberService } from '../../../src/main/beachcomber';
import {
  catchAsync,
  cleanupFixtures,
  makeClaudeHome,
  makeDeps,
  makeProject,
} from './helpers';

afterEach(() => {
  cleanupFixtures();
});

function seededHome(): string {
  const home = makeClaudeHome();
  makeProject(home, 'C--Users-x-Repos-alpha', [{ type: 'user', cwd: 'C:\\Users\\x\\Repos\\alpha' }]);
  makeProject(home, 'C--Users-x-Repos-beta', [{ type: 'user', cwd: 'C:\\Users\\x\\Repos\\beta' }]);
  return home;
}

describe('scan-scoped ids', () => {
  it('mints a disjoint id set and a different scanId on every scan', async () => {
    const service = createBeachcomberService(makeDeps(seededHome()));

    const first = await service.scan();
    const second = await service.scan();

    expect(second.scanId).not.toBe(first.scanId);
    const firstIds = new Set(first.entries.map((entry) => entry.id));
    expect(first.entries).toHaveLength(2);
    expect(second.entries).toHaveLength(2);
    for (const entry of second.entries) {
      expect(firstIds.has(entry.id)).toBe(false);
    }
  });

  it('cannot be reverse-engineered into a path', async () => {
    const scan = await createBeachcomberService(makeDeps(seededHome())).scan();

    for (const entry of scan.entries) {
      expect(entry.id).not.toBe(entry.name);
      expect(entry.id).not.toBe(entry.displayPath);
      expect(entry.id.includes(entry.name)).toBe(false);
      expect(entry.id.includes(entry.displayPath)).toBe(false);
      expect(entry.name.includes(entry.id)).toBe(false);
      expect(entry.displayPath.includes(entry.id)).toBe(false);
    }
  });
});

describe('refusing stale references', () => {
  it('answers NOT_FOUND when preview carries a scanId from an earlier scan', async () => {
    const service = createBeachcomberService(makeDeps(seededHome()));
    const stale = await service.scan();
    await service.scan();

    const err = await catchAsync(() =>
      service.preview({ scanId: stale.scanId, ids: [stale.entries[0]?.id ?? ''] }),
    );

    expect((err as { code?: string }).code).toBe('NOT_FOUND');
  });

  it('answers NOT_FOUND when trash carries a scanId from an earlier scan', async () => {
    const service = createBeachcomberService(makeDeps(seededHome()));
    const stale = await service.scan();
    await service.scan();

    const err = await catchAsync(() =>
      service.trash({ scanId: stale.scanId, ids: [stale.entries[0]?.id ?? ''] }),
    );

    expect((err as { code?: string }).code).toBe('NOT_FOUND');
  });

  it('answers NOT_FOUND for an id from an earlier scan rather than matching it by path', async () => {
    const service = createBeachcomberService(makeDeps(seededHome()));
    const stale = await service.scan();
    const fresh = await service.scan();
    const staleId = stale.entries[0]?.id ?? '';

    const err = await catchAsync(() =>
      service.preview({ scanId: fresh.scanId, ids: [staleId] }),
    );

    expect((err as { code?: string }).code).toBe('NOT_FOUND');
    expect((err as Error).message).toContain(staleId);
  });

  it('answers NOT_FOUND for an id this service never minted', async () => {
    const service = createBeachcomberService(makeDeps(seededHome()));
    const scan = await service.scan();

    const err = await catchAsync(() =>
      service.trash({ scanId: scan.scanId, ids: ['not-a-real-id'] }),
    );

    expect((err as { code?: string }).code).toBe('NOT_FOUND');
  });

  it('answers NOT_FOUND when no scan has happened yet', async () => {
    const service = createBeachcomberService(makeDeps(seededHome()));

    const err = await catchAsync(() => service.preview({ scanId: 'anything', ids: [] }));

    expect((err as { code?: string }).code).toBe('NOT_FOUND');
  });
});
