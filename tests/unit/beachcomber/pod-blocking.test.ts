/**
 * Pod directories are hard-blocked.
 *
 * `PodDirectoryProvider` yields EVERY Pod Orcastrate knows about, not only the
 * open ones — `PodManagerApi` exposes no liveness predicate and `idle` cannot
 * answer the question. Blocking the superset refuses more than the design asks
 * for, which is the safe direction when the alternative is deleting the state
 * behind a Pod the user still has.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createBeachcomberService } from '../../../src/main/beachcomber';
import { normalizeForCompare, samePath } from '../../../src/main/beachcomber/paths';
import type { PodDirectory } from '../../../src/shared/contracts/panel-host';
import {
  cleanupFixtures,
  entryNamed,
  fakeTrash,
  makeClaudeHome,
  makeDeps,
  makeProject,
  podProvider,
} from './helpers';

afterEach(() => {
  cleanupFixtures();
});

const POD: PodDirectory = {
  podId: 'pod-0001',
  title: 'Refactor the router',
  cwd: 'C:\\Users\\x\\Repos\\router',
};

function homeWithRouterProject(): string {
  const home = makeClaudeHome();
  makeProject(home, 'C--Users-x-Repos-router', [{ type: 'user', cwd: POD.cwd }]);
  makeProject(home, 'C--Users-x-Repos-other', [{ type: 'user', cwd: 'C:\\Users\\x\\Repos\\other' }]);
  return home;
}

describe('blocking the directory behind a known Pod', () => {
  it('marks the entry blocked and names the Pod that blocked it', async () => {
    const home = homeWithRouterProject();
    const scan = await createBeachcomberService(
      makeDeps(home, { pods: podProvider([POD]) }),
    ).scan();

    const blocked = entryNamed(scan, 'C--Users-x-Repos-router');
    expect(blocked.blocked).toBe('pod-cwd');
    expect(blocked.blockedBy).toEqual({ podId: 'pod-0001', title: 'Refactor the router' });

    const free = entryNamed(scan, 'C--Users-x-Repos-other');
    expect(free.blocked).toBeNull();
    expect(free.blockedBy).toBeNull();
  });

  it('blocks a beached Pod as firmly as any other, because every known Pod counts', async () => {
    // A Pod whose status is `beached` is still a Pod Orcastrate knows about, so
    // `PodDirectoryProvider` still yields its directory — the provider carries
    // no status at all, which is precisely the point of taking the superset.
    const beached: PodDirectory = { podId: 'pod-beached', title: 'Beached run', cwd: POD.cwd };
    const home = homeWithRouterProject();

    const scan = await createBeachcomberService(
      makeDeps(home, { pods: podProvider([beached]) }),
    ).scan();

    const blocked = entryNamed(scan, 'C--Users-x-Repos-router');
    expect(blocked.blocked).toBe('pod-cwd');
    expect(blocked.blockedBy?.podId).toBe('pod-beached');
  });

  it('refuses a blocked entry in preview with a message naming the Pod and what to do', async () => {
    const home = homeWithRouterProject();
    const service = createBeachcomberService(makeDeps(home, { pods: podProvider([POD]) }));
    const scan = await service.scan();
    const blocked = entryNamed(scan, 'C--Users-x-Repos-router');

    const preview = await service.preview({ scanId: scan.scanId, ids: [blocked.id] });

    expect(preview.items).toHaveLength(0);
    expect(preview.refused).toHaveLength(1);
    expect(preview.refused[0]?.id).toBe(blocked.id);
    expect(preview.refused[0]?.reason).toContain('Refactor the router');
    expect(preview.refused[0]?.reason).toContain('pod-0001');
    expect(preview.refused[0]?.reason).toMatch(/delete that pod/i);
  });

  it('never hands a blocked path to the trash port, not even once', async () => {
    const home = homeWithRouterProject();
    const trash = fakeTrash();
    const service = createBeachcomberService(
      makeDeps(home, { pods: podProvider([POD]), trashItem: trash.trashItem }),
    );
    const scan = await service.scan();
    const blocked = entryNamed(scan, 'C--Users-x-Repos-router');
    const free = entryNamed(scan, 'C--Users-x-Repos-other');

    const result = await service.trash({ scanId: scan.scanId, ids: [blocked.id, free.id] });

    expect(result.refused.map((refusal) => refusal.id)).toEqual([blocked.id]);
    expect(result.trashed).toEqual([free.id]);
    expect(trash.calls).toHaveLength(1);
    expect(trash.calls.some((path) => path.includes('router'))).toBe(false);
  });
});

describe('path comparison before blocking', () => {
  it('treats case, separator direction and a trailing separator as the same directory', () => {
    expect(samePath('C:\\X', 'c:\\x')).toBe(true);
    expect(samePath('C:\\X', 'C:\\X\\')).toBe(true);
    expect(samePath('C:\\X', 'C:/X')).toBe(true);
    expect(samePath('C:\\X\\Y', 'c:/x/y/')).toBe(true);
    expect(samePath('C:\\X', 'C:\\Y')).toBe(false);
    expect(normalizeForCompare('C:\\X\\')).toBe('c:/x');
  });

  it('blocks the same entry however the Pod cwd happens to be spelled', async () => {
    for (const spelling of ['C:\\Users\\x\\Repos\\router', 'c:/users/x/repos/router', 'C:\\Users\\x\\Repos\\router\\']) {
      const home = homeWithRouterProject();
      const scan = await createBeachcomberService(
        makeDeps(home, { pods: podProvider([{ ...POD, cwd: spelling }]) }),
      ).scan();

      expect(entryNamed(scan, 'C--Users-x-Repos-router').blocked).toBe('pod-cwd');
    }
  });
});
