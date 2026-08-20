/**
 * Pod CRUD, ordering, partial update semantics, and cascading delete.
 * Acceptance criteria 1, 6, 8, 10, 11.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { catchStoreError, cleanupStores, eventInput, fileStore, laneInput, memoryStore, podInput, rawDb, tempDbPath } from './helpers';

afterEach(cleanupStores);

describe('createPod / getPod', () => {
  it('returns a fully populated Pod with store-assigned defaults', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput({ id: 'pod-a', title: 'Alpha', tabOrder: 3 }));

    expect(pod.id).toBe('pod-a');
    expect(pod.title).toBe('Alpha');
    expect(pod.ccSessionId).toBeNull();
    expect(pod.status).toBe('closed');
    expect(pod.tabOrder).toBe(3);
    expect(pod.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(pod.lastActiveAt).toBe(pod.createdAt);
    expect(store.getPod('pod-a')).toEqual(pod);
  });

  it('round-trips env_overrides as JSON (criterion 10)', () => {
    const store = memoryStore();
    const envOverrides = {
      ANTHROPIC_BASE_URL: 'https://example.invalid/v1',
      WEIRD: 'quote " backslash \\ newline \n unicode ✓',
      EMPTY: '',
    };
    const pod = store.createPod(podInput({ envOverrides }));
    expect(store.getPod(pod.id)?.envOverrides).toStrictEqual(envOverrides);
  });

  it('getPod returns null for an unknown id rather than throwing (criterion 8)', () => {
    expect(memoryStore().getPod('nope')).toBeNull();
  });

  it('throws CONFLICT on a duplicate id (criterion 8)', () => {
    const store = memoryStore();
    store.createPod(podInput({ id: 'dupe' }));
    expect(catchStoreError(() => store.createPod(podInput({ id: 'dupe' }))).code).toBe('CONFLICT');
  });
});

describe('listPods', () => {
  it('orders by tabOrder ascending, then createdAt ascending', () => {
    const store = memoryStore();
    store.createPod(podInput({ id: 'c', tabOrder: 2 }));
    store.createPod(podInput({ id: 'a', tabOrder: 0 }));
    store.createPod(podInput({ id: 'b', tabOrder: 1 }));

    expect(store.listPods().map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('is empty on a fresh store', () => {
    expect(memoryStore().listPods()).toEqual([]);
  });
});

describe('updatePod', () => {
  it('applies only the supplied keys and refreshes lastActiveAt', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput({ title: 'before', tabOrder: 1 }));

    const updated = store.updatePod(pod.id, { title: 'after', status: 'running' });

    expect(updated.title).toBe('after');
    expect(updated.status).toBe('running');
    expect(updated.tabOrder).toBe(1);
    expect(updated.cwd).toBe(pod.cwd);
    expect(updated.createdAt).toBe(pod.createdAt);
    expect(Date.parse(updated.lastActiveAt)).toBeGreaterThanOrEqual(Date.parse(pod.lastActiveAt));
  });

  it('honours an explicitly supplied lastActiveAt instead of refreshing it', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput());
    const stamp = '2020-01-01T00:00:00.000Z';

    expect(store.updatePod(pod.id, { lastActiveAt: stamp }).lastActiveAt).toBe(stamp);
  });

  it('can set ccSessionId and clear it back to null', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput());

    expect(store.updatePod(pod.id, { ccSessionId: 'cc-123' }).ccSessionId).toBe('cc-123');
    expect(store.updatePod(pod.id, { ccSessionId: null }).ccSessionId).toBeNull();
  });

  it('replaces envOverrides wholesale', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput({ envOverrides: { A: '1', B: '2' } }));
    expect(store.updatePod(pod.id, { envOverrides: { C: '3' } }).envOverrides).toStrictEqual({ C: '3' });
  });

  it('throws NOT_FOUND for an unknown id (criterion 8)', () => {
    const store = memoryStore();
    expect(catchStoreError(() => store.updatePod('ghost', { title: 'x' })).code).toBe('NOT_FOUND');
  });

  it('throws CONFLICT when the patch would violate the status CHECK (criterion 3)', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput());
    const err = catchStoreError(() =>
      // Deliberately bypassing the type to prove the database, not TypeScript,
      // is what refuses the value.
      store.updatePod(pod.id, { status: 'capsized' as never }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(store.getPod(pod.id)?.status).toBe('closed');
  });
});

describe('deletePod (criterion 6)', () => {
  it('cascades to the Pod lanes and events, verified by row counts', () => {
    const path = tempDbPath();
    const store = fileStore(path);
    store.migrate();

    const kept = store.createPod(podInput({ id: 'kept', tabOrder: 0 }));
    const doomed = store.createPod(podInput({ id: 'doomed', tabOrder: 1 }));

    const keptLane = store.createLane(laneInput(kept.id, { id: 'lane-kept' }));
    const doomedMatriarch = store.createLane(laneInput(doomed.id, { id: 'lane-doomed-m' }));
    store.createLane(
      laneInput(doomed.id, {
        id: 'lane-doomed-calf',
        kind: 'calf',
        toolUseId: 'toolu_1',
        parentLaneId: doomedMatriarch.id,
        depth: 1,
      }),
    );

    store.appendMany([
      eventInput(kept.id, keptLane.id),
      eventInput(kept.id, keptLane.id),
      eventInput(doomed.id, doomedMatriarch.id),
      eventInput(doomed.id, 'lane-doomed-calf'),
      eventInput(doomed.id, 'lane-doomed-calf'),
    ]);

    const db = rawDb(path);
    const count = (table: string): number =>
      db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? -1;

    expect(count('pods')).toBe(2);
    expect(count('lanes')).toBe(3);
    expect(count('events')).toBe(5);

    store.deletePod(doomed.id);

    expect(count('pods')).toBe(1);
    expect(count('lanes')).toBe(1);
    expect(count('events')).toBe(2);
    expect(store.listLanes(kept.id).map((l) => l.id)).toEqual(['lane-kept']);
    expect(store.readEvents({ podId: kept.id })).toHaveLength(2);
    expect(store.readEvents({ podId: doomed.id })).toEqual([]);
  });

  it('throws NOT_FOUND for an unknown id (criterion 8)', () => {
    const store = memoryStore();
    expect(catchStoreError(() => store.deletePod('ghost')).code).toBe('NOT_FOUND');
  });
});
