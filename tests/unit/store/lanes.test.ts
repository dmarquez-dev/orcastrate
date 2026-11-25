/**
 * Lane creation, the routing lookups from spec 4.3, ordering, and status
 * transitions. Acceptance criteria 1, 2, 3, 8, 11.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { catchStoreError, cleanupStores, laneInput, memoryStore, podInput } from './helpers';

afterEach(cleanupStores);

function podWithMatriarch(): { store: ReturnType<typeof memoryStore>; podId: string; matriarchId: string } {
  const store = memoryStore();
  const pod = store.createPod(podInput({ id: 'pod-1' }));
  const matriarch = store.createLane(laneInput(pod.id, { id: 'lane-m' }));
  return { store, podId: pod.id, matriarchId: matriarch.id };
}

describe('createLane', () => {
  it('persists the tree columns from day one (criterion 2)', () => {
    const { store, podId, matriarchId } = podWithMatriarch();

    const calf = store.createLane(
      laneInput(podId, {
        id: 'lane-c1',
        kind: 'calf',
        toolUseId: 'toolu_abc',
        agentId: 'agent_xyz',
        parentLaneId: matriarchId,
        depth: 1,
        subagentType: 'code-reviewer',
        description: 'review the diff',
      }),
    );

    expect(calf).toStrictEqual({
      id: 'lane-c1',
      podId,
      kind: 'calf',
      toolUseId: 'toolu_abc',
      agentId: 'agent_xyz',
      parentLaneId: matriarchId,
      depth: 1,
      subagentType: 'code-reviewer',
      description: 'review the diff',
      status: 'running',
      startedAt: calf.startedAt,
      endedAt: null,
      resumedAt: null,
    });
    expect(store.getLane('lane-c1')).toStrictEqual(calf);
  });

  it('supports a nested calf at depth 2', () => {
    const { store, podId, matriarchId } = podWithMatriarch();
    const parent = store.createLane(
      laneInput(podId, { id: 'lane-c1', kind: 'calf', toolUseId: 'toolu_1', parentLaneId: matriarchId, depth: 1 }),
    );
    const nested = store.createLane(
      laneInput(podId, { id: 'lane-c2', kind: 'calf', toolUseId: 'toolu_2', parentLaneId: parent.id, depth: 2 }),
    );
    expect(nested.parentLaneId).toBe('lane-c1');
    expect(nested.depth).toBe(2);
  });

  it('throws NOT_FOUND when the Pod does not exist (criterion 8)', () => {
    const store = memoryStore();
    expect(catchStoreError(() => store.createLane(laneInput('no-such-pod'))).code).toBe('NOT_FOUND');
  });

  it('throws CONFLICT on a duplicate lane id (criterion 8)', () => {
    const { store, podId } = podWithMatriarch();
    expect(
      catchStoreError(() => store.createLane(laneInput(podId, { id: 'lane-m', kind: 'calf', toolUseId: 't' }))).code,
    ).toBe('CONFLICT');
  });

  it('throws CONFLICT on a second Matriarch for the same Pod', () => {
    const { store, podId } = podWithMatriarch();
    expect(catchStoreError(() => store.createLane(laneInput(podId, { id: 'lane-m2' }))).code).toBe('CONFLICT');
  });

  it('throws CONFLICT on a duplicate tool_use_id within one Pod', () => {
    const { store, podId, matriarchId } = podWithMatriarch();
    store.createLane(
      laneInput(podId, { id: 'lane-c1', kind: 'calf', toolUseId: 'toolu_dup', parentLaneId: matriarchId, depth: 1 }),
    );
    expect(
      catchStoreError(() =>
        store.createLane(
          laneInput(podId, { id: 'lane-c2', kind: 'calf', toolUseId: 'toolu_dup', parentLaneId: matriarchId, depth: 1 }),
        ),
      ).code,
    ).toBe('CONFLICT');
  });

  it('allows the same tool_use_id in a different Pod', () => {
    const { store, podId, matriarchId } = podWithMatriarch();
    store.createLane(
      laneInput(podId, { id: 'lane-c1', kind: 'calf', toolUseId: 'toolu_same', parentLaneId: matriarchId, depth: 1 }),
    );

    const other = store.createPod(podInput({ id: 'pod-2', tabOrder: 1 }));
    const otherM = store.createLane(laneInput(other.id, { id: 'lane-m2' }));
    const otherCalf = store.createLane(
      laneInput(other.id, { id: 'lane-c2', kind: 'calf', toolUseId: 'toolu_same', parentLaneId: otherM.id, depth: 1 }),
    );

    expect(store.getLaneByToolUseId(podId, 'toolu_same')?.id).toBe('lane-c1');
    expect(store.getLaneByToolUseId(other.id, 'toolu_same')?.id).toBe(otherCalf.id);
  });
});

describe('lookups return null rather than throwing (criterion 8)', () => {
  it('getLane, getLaneByToolUseId and getMatriarchLane', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput());

    expect(store.getLane('nope')).toBeNull();
    expect(store.getLaneByToolUseId(pod.id, 'toolu_nope')).toBeNull();
    expect(store.getLaneByToolUseId('no-such-pod', 'toolu_nope')).toBeNull();
    // "Returns null before the Pod's first lane exists."
    expect(store.getMatriarchLane(pod.id)).toBeNull();
    expect(store.getMatriarchLane('no-such-pod')).toBeNull();
  });

  it('getMatriarchLane finds the Matriarch and ignores Calves', () => {
    const { store, podId, matriarchId } = podWithMatriarch();
    store.createLane(
      laneInput(podId, { id: 'lane-c1', kind: 'calf', toolUseId: 'toolu_1', parentLaneId: matriarchId, depth: 1 }),
    );
    expect(store.getMatriarchLane(podId)?.id).toBe(matriarchId);
  });
});

describe('listLanes', () => {
  it('puts the Matriarch first, then Calves by startedAt ascending', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput());
    // Calves first, so a naive insertion-order query would fail this.
    const matriarch = store.createLane(laneInput(pod.id, { id: 'lane-m' }));
    const c1 = store.createLane(
      laneInput(pod.id, { id: 'lane-c1', kind: 'calf', toolUseId: 't1', parentLaneId: matriarch.id, depth: 1 }),
    );
    const c2 = store.createLane(
      laneInput(pod.id, { id: 'lane-c2', kind: 'calf', toolUseId: 't2', parentLaneId: matriarch.id, depth: 1 }),
    );

    expect(store.listLanes(pod.id).map((l) => l.id)).toEqual([matriarch.id, c1.id, c2.id]);
  });

  it('returns [] for an unknown Pod', () => {
    expect(memoryStore().listLanes('nope')).toEqual([]);
  });

  it('does not leak lanes from another Pod', () => {
    const { store, podId } = podWithMatriarch();
    const other = store.createPod(podInput({ id: 'pod-2', tabOrder: 1 }));
    store.createLane(laneInput(other.id, { id: 'lane-other' }));
    expect(store.listLanes(podId).map((l) => l.id)).toEqual(['lane-m']);
  });
});

describe('setLaneStatus', () => {
  it('stamps endedAt on a terminal status and clears it on a return to running', () => {
    const { store, matriarchId } = podWithMatriarch();

    const done = store.setLaneStatus(matriarchId, 'done');
    expect(done.status).toBe('done');
    expect(done.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const running = store.setLaneStatus(matriarchId, 'running');
    expect(running.status).toBe('running');
    expect(running.endedAt).toBeNull();
  });

  it('uses an explicitly supplied endedAt', () => {
    const { store, matriarchId } = podWithMatriarch();
    const stamp = '2026-08-18T19:30:00.000Z';
    expect(store.setLaneStatus(matriarchId, 'orphaned', stamp).endedAt).toBe(stamp);
  });

  it('throws NOT_FOUND for an unknown lane (criterion 8)', () => {
    const store = memoryStore();
    expect(catchStoreError(() => store.setLaneStatus('ghost', 'done')).code).toBe('NOT_FOUND');
  });

  it('throws CONFLICT for a status outside running|done|orphaned (criterion 3)', () => {
    const { store, matriarchId } = podWithMatriarch();
    const err = catchStoreError(() => store.setLaneStatus(matriarchId, 'adrift' as never));
    expect(err.code).toBe('CONFLICT');
    expect(store.getLane(matriarchId)?.status).toBe('running');
  });
});

/**
 * The resume stamp. A resume is 'running' written over a stored terminal
 * status; only a resume stamps `resumedAt`. A terminal write stamps `endedAt`
 * and leaves `resumedAt` alone, 'running' over 'running' changes neither, and
 * `startedAt` is never restamped.
 */
describe('setLaneStatus resume stamp', () => {
  const ENDED = '2026-08-18T19:00:00.000Z';
  const X = '2026-08-18T19:30:00.000Z';
  const Y = '2026-08-18T19:45:00.000Z';
  const Z = '2026-08-18T20:00:00.000Z';

  // Every terminal member of LaneStatus: 'done', 'orphaned', 'stopped'.
  for (const terminal of ['done', 'orphaned', 'stopped'] as const) {
    it(`resuming from '${terminal}' clears endedAt and stamps resumedAt with the supplied at`, () => {
      const { store, matriarchId } = podWithMatriarch();
      store.setLaneStatus(matriarchId, terminal, ENDED);

      const resumed = store.setLaneStatus(matriarchId, 'running', X);
      expect(resumed).toMatchObject({ status: 'running', endedAt: null, resumedAt: X });
      expect(store.getLane(matriarchId)).toMatchObject({ status: 'running', endedAt: null, resumedAt: X });
    });
  }

  it("stamps the store's now when a resume supplies no at", () => {
    const { store, matriarchId } = podWithMatriarch();
    store.setLaneStatus(matriarchId, 'stopped', ENDED);
    store.setLaneStatus(matriarchId, 'running');
    expect(store.getLane(matriarchId)?.resumedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("'running' on a never-resumed running lane leaves resumedAt null", () => {
    const { store, matriarchId } = podWithMatriarch();
    expect(store.setLaneStatus(matriarchId, 'running', X).resumedAt).toBeNull();
    expect(store.getLane(matriarchId)?.resumedAt).toBeNull();
  });

  it("'running' on a resumed running lane keeps the first resume's stamp", () => {
    const { store, matriarchId } = podWithMatriarch();
    store.setLaneStatus(matriarchId, 'done', ENDED);
    store.setLaneStatus(matriarchId, 'running', X);

    expect(store.setLaneStatus(matriarchId, 'running', Y).resumedAt).toBe(X);
    expect(store.getLane(matriarchId)?.resumedAt).toBe(X);
  });

  it('a terminal status after a resume stamps endedAt and keeps resumedAt', () => {
    const { store, matriarchId } = podWithMatriarch();
    store.setLaneStatus(matriarchId, 'done', ENDED);
    store.setLaneStatus(matriarchId, 'running', X);

    store.setLaneStatus(matriarchId, 'stopped', Z);
    expect(store.getLane(matriarchId)).toMatchObject({ status: 'stopped', endedAt: Z, resumedAt: X });
  });

  it('never restamps startedAt across a stop and a resume', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput({ id: 'pod-1' }));
    const created = store.createLane(laneInput(pod.id, { id: 'lane-m' }));

    store.setLaneStatus(created.id, 'stopped', ENDED);
    store.setLaneStatus(created.id, 'running', X);
    expect(store.getLane(created.id)?.startedAt).toBe(created.startedAt);
  });

  it('listLanes reads back the stored resume stamp', () => {
    const { store, podId, matriarchId } = podWithMatriarch();
    const calf = store.createLane(
      laneInput(podId, { id: 'lane-c1', kind: 'calf', toolUseId: 'toolu_1', parentLaneId: matriarchId, depth: 1 }),
    );
    store.setLaneStatus(matriarchId, 'orphaned', ENDED);
    store.setLaneStatus(matriarchId, 'running', X);

    const listed = store.listLanes(podId);
    expect(listed.find((l) => l.id === matriarchId)?.resumedAt).toBe(X);
    expect(listed.find((l) => l.id === calf.id)?.resumedAt).toBeNull();
  });
});

describe('setLaneAgentId', () => {
  it('backfills agentId without disturbing anything else', () => {
    const { store, podId, matriarchId } = podWithMatriarch();
    const calf = store.createLane(
      laneInput(podId, { id: 'lane-c1', kind: 'calf', toolUseId: 'toolu_1', parentLaneId: matriarchId, depth: 1 }),
    );
    expect(calf.agentId).toBeNull();

    const backfilled = store.setLaneAgentId(calf.id, 'agent_42');
    expect(backfilled).toStrictEqual({ ...calf, agentId: 'agent_42' });
  });

  it('throws NOT_FOUND for an unknown lane (criterion 8)', () => {
    const store = memoryStore();
    expect(catchStoreError(() => store.setLaneAgentId('ghost', 'agent_1')).code).toBe('NOT_FOUND');
  });
});
