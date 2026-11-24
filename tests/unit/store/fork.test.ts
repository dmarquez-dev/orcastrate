/**
 * Pod ancestry on `Pod`, and `EventStore.forkPod`.
 *
 * Every fork here runs against a file-backed store so the row counts can be
 * read through an independent raw connection rather than through the API
 * under test.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { EventStore, EventStoreError, ForkPodInput } from '../../../src/shared/contracts/event-store';
import type { Lane, LaneId, NormalizedEvent, Pod, PodId } from '../../../src/shared/contracts/events';
import { catchStoreError, cleanupStores, eventInput, fileStore, laneInput, memoryStore, podInput, rawDb, tempDbPath } from './helpers';

afterEach(cleanupStores);

const FORK_NOW = '2026-11-05T12:00:00.000Z';

interface Parent {
  store: EventStore;
  path: string;
  parent: Pod;
  matriarch: Lane;
  calf1: Lane;
  calf2: Lane;
  /** Every parent event, in seq order. */
  events: NormalizedEvent[];
}

/**
 * A parent Pod with a running Matriarch, a finished depth-1 Calf and a running
 * depth-2 Calf under it, and eight events covering every remapped payload
 * kind. `throughSeq` 6 in the tests leaves seq 7 and 8 uncopied.
 */
function makeParent(parentId: PodId = 'parent'): Parent {
  const path = tempDbPath('fork.db');
  const store = fileStore(path);
  store.migrate();

  const parent = store.createPod(
    podInput({
      id: parentId,
      title: 'Parent',
      cwd: 'C:\\work\\parent',
      permissionMode: 'acceptEdits',
      envOverrides: { FOO: 'bar' },
      tabOrder: 0,
    }),
  );
  store.updatePod(parent.id, { ccSessionId: 'cc-parent', status: 'idle' });

  const matriarch = store.createLane(laneInput(parent.id, { id: 'p-m' }));
  const calf1 = store.createLane(
    laneInput(parent.id, {
      id: 'p-c1',
      kind: 'calf',
      toolUseId: 'toolu_1',
      agentId: 'agent-1',
      parentLaneId: matriarch.id,
      depth: 1,
      subagentType: 'reviewer',
      description: 'review',
    }),
  );
  const calf2 = store.createLane(
    laneInput(parent.id, {
      id: 'p-c2',
      kind: 'calf',
      toolUseId: 'toolu_2',
      parentLaneId: calf1.id,
      depth: 2,
      subagentType: 'tester',
      description: 'test',
    }),
  );
  store.setLaneStatus(calf1.id, 'done', '2026-11-05T11:00:00.000Z');

  const at = (n: number): string => `2026-11-05T10:00:0${n}.000Z`;
  store.appendMany([
    eventInput(parent.id, matriarch.id, {
      type: 'user_message',
      payload: { type: 'user_message', text: 'go' },
      createdAt: at(1),
      raw: { line: 1 },
    }),
    eventInput(parent.id, matriarch.id, {
      type: 'tool_use',
      payload: { type: 'tool_use', toolUseId: 'toolu_1', name: 'Agent', input: { p: 1 }, dispatchedLaneId: calf1.id },
      createdAt: at(2),
      raw: { line: 2 },
    }),
    eventInput(parent.id, calf1.id, {
      type: 'lane_opened',
      payload: { type: 'lane_opened', lane: store.getLane(calf1.id) as Lane },
      createdAt: at(3),
    }),
    eventInput(parent.id, calf1.id, {
      type: 'tool_use',
      payload: { type: 'tool_use', toolUseId: 'toolu_2', name: 'Agent', input: {}, dispatchedLaneId: calf2.id },
      createdAt: at(4),
      raw: null,
    }),
    eventInput(parent.id, calf2.id, {
      type: 'lane_opened',
      payload: { type: 'lane_opened', lane: store.getLane(calf2.id) as Lane },
      createdAt: at(5),
    }),
    eventInput(parent.id, calf1.id, {
      type: 'lane_closed',
      payload: { type: 'lane_closed', laneId: calf1.id, status: 'done' },
      createdAt: at(6),
    }),
    eventInput(parent.id, calf2.id, { createdAt: at(7), raw: { line: 7 } }),
    eventInput(parent.id, matriarch.id, { createdAt: at(8) }),
  ]);

  return {
    store,
    path,
    parent: store.getPod(parent.id) as Pod,
    matriarch: store.getLane(matriarch.id) as Lane,
    calf1: store.getLane(calf1.id) as Lane,
    calf2: store.getLane(calf2.id) as Lane,
    events: store.readEvents({ podId: parent.id }),
  };
}

function minter(prefix = 'f'): { mint: () => LaneId; minted: LaneId[] } {
  const minted: LaneId[] = [];
  let n = 0;
  return {
    minted,
    mint: () => {
      n += 1;
      const id = `${prefix}-lane-${n}`;
      minted.push(id);
      return id;
    },
  };
}

function forkInput(parentId: PodId, overrides: Partial<ForkPodInput> = {}): ForkPodInput {
  return {
    id: 'fork',
    parentId,
    ccSessionId: 'cc-fork',
    sourceCcSessionId: 'cc-parent',
    title: 'Forked',
    throughSeq: 6,
    newLaneId: minter().mint,
    now: FORK_NOW,
    ...overrides,
  };
}

function counts(path: string): { pods: number; lanes: number; events: number } {
  const db = rawDb(path);
  const n = (table: string): number =>
    db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? -1;
  return { pods: n('pods'), lanes: n('lanes'), events: n('events') };
}

/** The fork's copy of a parent lane, located by its parent-side identity. */
function copyOf(store: EventStore, forkId: PodId, original: Lane): Lane {
  const found = store
    .listLanes(forkId)
    .find((l) => l.kind === original.kind && l.toolUseId === original.toolUseId);
  if (found === undefined) throw new Error(`no copy of ${original.id}`);
  return found;
}

// ---------------------------------------------------------------------------
// Ancestry fields on ordinary Pods
// ---------------------------------------------------------------------------

describe('ancestry on a Pod that was never forked', () => {
  it('createPod returns, and getPod and listPods read back, both ancestry fields as null', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput({ id: 'plain' }));
    expect([pod.forkedFromPodId, pod.forkedFromCcSessionId]).toEqual([null, null]);
    expect(store.getPod('plain')).toMatchObject({ forkedFromPodId: null, forkedFromCcSessionId: null });
    expect(store.listPods()[0]).toMatchObject({ forkedFromPodId: null, forkedFromCcSessionId: null });
  });

  it('updatePod does not accept either ancestry key', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput());
    // The two calls below are type errors by contract: ancestry is immutable.
    // At runtime the unknown keys are ignored.
    // @ts-expect-error forkedFromPodId is not an updatePod patch key
    store.updatePod(pod.id, { forkedFromPodId: 'someone' });
    // @ts-expect-error forkedFromCcSessionId is not an updatePod patch key
    store.updatePod(pod.id, { forkedFromCcSessionId: 'cc-x' });
    expect(store.getPod(pod.id)).toMatchObject({ forkedFromPodId: null, forkedFromCcSessionId: null });
  });
});

// ---------------------------------------------------------------------------
// The fork row
// ---------------------------------------------------------------------------

describe('forkPod: the new Pod row', () => {
  it('records the parent id and the source session id, read back through getPod and listPods', () => {
    const { store, parent } = makeParent();
    const fork = store.forkPod(forkInput(parent.id, { sourceCcSessionId: 'cc-source-xyz' }));

    expect(fork).toMatchObject({ forkedFromPodId: parent.id, forkedFromCcSessionId: 'cc-source-xyz' });
    expect(store.getPod('fork')).toEqual(fork);
    expect(store.listPods().find((p) => p.id === 'fork')).toEqual(fork);
  });

  it('takes ccSessionId and title from the input, cwd/permissionMode/envOverrides from the parent, and is closed', () => {
    const { store, parent } = makeParent();
    const fork = store.forkPod(forkInput(parent.id, { ccSessionId: 'cc-new', title: 'A new branch' }));

    expect(fork).toMatchObject({
      id: 'fork',
      ccSessionId: 'cc-new',
      title: 'A new branch',
      cwd: parent.cwd,
      permissionMode: parent.permissionMode,
      envOverrides: parent.envOverrides,
      status: 'closed',
      createdAt: FORK_NOW,
      lastActiveAt: FORK_NOW,
    });
    expect(parent.status).toBe('idle');
  });

  it('gets tabOrder one past the maximum even when tabOrders are not dense (0 and 7 give 8), so it sorts last', () => {
    const { store, parent } = makeParent();
    store.createPod(podInput({ id: 'seven', tabOrder: 7 }));

    const fork = store.forkPod(forkInput(parent.id));

    expect(fork.tabOrder).toBe(8);
    expect(store.listPods().map((p) => p.id).at(-1)).toBe('fork');
  });
});

// ---------------------------------------------------------------------------
// The parent is not written
// ---------------------------------------------------------------------------

describe('forkPod leaves the parent untouched', () => {
  it('parent getPod, listLanes and readEvents deep-equal their values from before the fork', () => {
    const { store, parent } = makeParent();
    const before = {
      pod: store.getPod(parent.id),
      lanes: store.listLanes(parent.id),
      events: store.readEvents({ podId: parent.id }),
    };

    store.forkPod(forkInput(parent.id));

    expect(store.getPod(parent.id)).toEqual(before.pod);
    expect(store.listLanes(parent.id)).toEqual(before.lanes);
    expect(store.readEvents({ podId: parent.id })).toEqual(before.events);
  });
});

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

describe('forkPod: lanes', () => {
  it('copies every parent lane exactly once with an id from newLaneId, and remaps parentLaneId', () => {
    const p = makeParent();
    const { mint, minted } = minter();
    p.store.forkPod(forkInput(p.parent.id, { newLaneId: mint }));

    const forkLanes = p.store.listLanes('fork');
    const parentLanes = p.store.listLanes(p.parent.id);
    expect(minted).toHaveLength(parentLanes.length);
    expect(forkLanes.map((l) => l.id).sort()).toEqual([...minted].sort());
    expect(forkLanes.every((l) => l.podId === 'fork')).toBe(true);

    const m = copyOf(p.store, 'fork', p.matriarch);
    const c1 = copyOf(p.store, 'fork', p.calf1);
    const c2 = copyOf(p.store, 'fork', p.calf2);
    expect(m.parentLaneId).toBeNull();
    expect(c1.parentLaneId).toBe(m.id);
    // The depth-2 Calf's copy points at the COPY of its depth-1 parent.
    expect(c2.parentLaneId).toBe(c1.id);

    // Every other column copied verbatim (status/endedAt aside for running lanes).
    const strip = (l: Lane): Partial<Lane> => {
      const { id: _id, podId: _podId, parentLaneId: _parent, ...rest } = l;
      return rest;
    };
    expect(strip(c1)).toEqual(strip(p.calf1));
  });

  it("writes a parent lane that is 'running' as 'stopped' with endedAt = input.now; the parent lane stays running", () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id));

    for (const original of [p.matriarch, p.calf2]) {
      expect(original.status).toBe('running');
      const copy = copyOf(p.store, 'fork', original);
      expect([copy.status, copy.endedAt]).toEqual(['stopped', FORK_NOW]);
      expect(p.store.getLane(original.id)).toMatchObject({ status: 'running', endedAt: null });
    }
  });

  it("copies a resumed parent lane's resumedAt verbatim to the fork's lane", () => {
    const p = makeParent();
    const resumedAt = '2026-11-05T11:30:00.000Z';
    p.store.setLaneStatus(p.matriarch.id, 'stopped', '2026-11-05T11:15:00.000Z');
    p.store.setLaneStatus(p.matriarch.id, 'running', resumedAt);
    expect(p.store.getLane(p.matriarch.id)?.resumedAt).toBe(resumedAt);

    p.store.forkPod(forkInput(p.parent.id));
    expect(copyOf(p.store, 'fork', p.matriarch).resumedAt).toBe(resumedAt);
  });

  it('forks a never-resumed parent lane to a lane whose resumedAt is null', () => {
    const p = makeParent();
    expect(p.matriarch.resumedAt).toBeNull();

    p.store.forkPod(forkInput(p.parent.id));
    expect(copyOf(p.store, 'fork', p.matriarch).resumedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe('forkPod: events', () => {
  it('copies exactly the parent events with seq <= throughSeq, in order, same seq/type/createdAt/raw, on the fork own lanes', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id, { throughSeq: 6 }));

    const forkEvents = p.store.readEvents({ podId: 'fork' });
    const expected = p.events.filter((e) => e.seq <= 6);
    expect(p.events.some((e) => e.seq > 6)).toBe(true);
    expect(forkEvents.map((e) => e.seq)).toEqual(expected.map((e) => e.seq));

    const forkLaneIds = new Set(p.store.listLanes('fork').map((l) => l.id));
    forkEvents.forEach((e, i) => {
      const src = expected[i] as NormalizedEvent;
      expect({ seq: e.seq, type: e.type, createdAt: e.createdAt, raw: e.raw, hasRaw: 'raw' in e }).toEqual({
        seq: src.seq,
        type: src.type,
        createdAt: src.createdAt,
        raw: src.raw,
        hasRaw: 'raw' in src,
      });
      expect(e.podId).toBe('fork');
      expect(forkLaneIds.has(e.laneId)).toBe(true);
    });
    // The lane mapping is consistent: the event lands on the copy of its own lane.
    const byTool = new Map([p.matriarch, p.calf1, p.calf2].map((l) => [l.id, copyOf(p.store, 'fork', l).id]));
    expect(forkEvents.map((e) => e.laneId)).toEqual(expected.map((e) => byTool.get(e.laneId)));
  });

  it('throughSeq 0 copies no events', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id, { throughSeq: 0 }));
    expect(p.store.readEvents({ podId: 'fork' })).toEqual([]);
  });

  it('remaps lane_opened payload.lane.id, .podId and .parentLaneId to the fork', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id));
    const c1 = copyOf(p.store, 'fork', p.calf1);
    const c2 = copyOf(p.store, 'fork', p.calf2);
    const m = copyOf(p.store, 'fork', p.matriarch);

    const opened = p.store
      .readEvents({ podId: 'fork' })
      .filter((e) => e.payload.type === 'lane_opened')
      .map((e) => (e.payload.type === 'lane_opened' ? e.payload.lane : null));
    expect(opened.map((l) => [l?.id, l?.podId, l?.parentLaneId])).toEqual([
      [c1.id, 'fork', m.id],
      [c2.id, 'fork', c1.id],
    ]);
    // The copied payload is equivalent JSON, lane ids remapped; not byte-identical
    // (it is re-serialized), so it is compared as a parsed value, not as text.
    const original = p.events.find((e) => e.seq === 3)?.payload;
    const copied = p.store.readEvents({ podId: 'fork' }).find((e) => e.seq === 3)?.payload;
    expect({ ...(copied as object), lane: { ...(copied as { lane: Lane }).lane, id: 'x', podId: 'x', parentLaneId: 'x' } }).toEqual({
      ...(original as object),
      lane: { ...(original as { lane: Lane }).lane, id: 'x', podId: 'x', parentLaneId: 'x' },
    });
  });

  it('remaps lane_closed payload.laneId to the fork lane', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id));
    const closed = p.store.readEvents({ podId: 'fork' }).find((e) => e.payload.type === 'lane_closed');
    expect(closed?.payload).toEqual({ type: 'lane_closed', laneId: copyOf(p.store, 'fork', p.calf1).id, status: 'done' });
  });

  it('remaps tool_use payload.dispatchedLaneId to the fork lane and leaves the rest of the payload alone', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id));
    const uses = p.store.readEvents({ podId: 'fork' }).filter((e) => e.payload.type === 'tool_use');
    expect(uses.map((e) => e.payload)).toEqual([
      { type: 'tool_use', toolUseId: 'toolu_1', name: 'Agent', input: { p: 1 }, dispatchedLaneId: copyOf(p.store, 'fork', p.calf1).id },
      { type: 'tool_use', toolUseId: 'toolu_2', name: 'Agent', input: {}, dispatchedLaneId: copyOf(p.store, 'fork', p.calf2).id },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Independence after the fork
// ---------------------------------------------------------------------------

describe('forkPod: parent and fork are independent afterwards', () => {
  it('appending to the parent leaves the fork readEvents unchanged', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id));
    const before = p.store.readEvents({ podId: 'fork' });

    p.store.append(eventInput(p.parent.id, p.matriarch.id));

    expect(p.store.readEvents({ podId: 'fork' })).toEqual(before);
  });

  it('appending to the fork leaves the parent unchanged and is assigned seq throughSeq + 1', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id, { throughSeq: 6 }));
    const before = p.store.readEvents({ podId: p.parent.id });

    const appended = p.store.append(eventInput('fork', copyOf(p.store, 'fork', p.matriarch).id));

    expect(appended.seq).toBe(7);
    expect(p.store.readEvents({ podId: p.parent.id })).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Failure paths are all-or-nothing
// ---------------------------------------------------------------------------

describe('forkPod failures roll back completely', () => {
  it('a minted LaneId that collides with an existing lane is CONFLICT and writes nothing', () => {
    const p = makeParent();
    const before = counts(p.path);
    let n = 0;
    // First id is fresh, second collides with the parent's Calf: the first
    // lane (and the pod row) would already be written without the rollback.
    const mint = (): LaneId => {
      n += 1;
      return n === 2 ? p.calf1.id : `fresh-${n}`;
    };

    const err = catchStoreError(() => p.store.forkPod(forkInput(p.parent.id, { newLaneId: mint })));

    expect(err.code).toBe('CONFLICT');
    expect(counts(p.path)).toEqual(before);
    expect(p.store.getPod('fork')).toBeNull();
  });

  it('an id that already exists is CONFLICT and writes nothing', () => {
    const p = makeParent();
    p.store.createPod(podInput({ id: 'taken', tabOrder: 1 }));
    const before = counts(p.path);

    const err = catchStoreError(() => p.store.forkPod(forkInput(p.parent.id, { id: 'taken' })));

    expect(err.code).toBe('CONFLICT');
    expect(counts(p.path)).toEqual(before);
  });

  it('an unknown parentId is NOT_FOUND and writes nothing', () => {
    const p = makeParent();
    const before = counts(p.path);

    const err = catchStoreError(() => p.store.forkPod(forkInput('no-such-pod')));

    expect(err.code).toBe('NOT_FOUND');
    expect(counts(p.path)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// A lane reference the fork cannot remap
// ---------------------------------------------------------------------------

describe('forkPod refuses a lane reference that names no lane of the parent', () => {
  /** A LaneId that exists in the database, but belongs to a different Pod. */
  function foreignLane(p: Parent): Lane {
    const other = p.store.createPod(podInput({ id: 'other', tabOrder: 1 }));
    return p.store.createLane(laneInput(other.id, { id: 'other-m' }));
  }

  /**
   * Forks every parent event and requires IO with nothing written: the pod,
   * lane and event row counts, read through an independent raw connection,
   * equal their values from before the call.
   */
  function refuse(p: Parent): EventStoreError {
    const before = counts(p.path);
    const err = catchStoreError(() =>
      p.store.forkPod(forkInput(p.parent.id, { throughSeq: p.store.latestSeq(p.parent.id) })),
    );
    expect(err.code).toBe('IO');
    expect(counts(p.path)).toEqual(before);
    expect(p.store.getPod('fork')).toBeNull();
    return err;
  }

  it('an event whose laneId is a lane of a different Pod is IO and writes nothing', () => {
    const p = makeParent();
    const foreign = foreignLane(p);
    p.store.append(eventInput(p.parent.id, foreign.id));

    expect(refuse(p).message).toContain(foreign.id);
  });

  it('a lane whose parentLaneId is a lane of a different Pod is IO and writes nothing', () => {
    const p = makeParent();
    const foreign = foreignLane(p);
    p.store.createLane(
      laneInput(p.parent.id, { id: 'p-stray', kind: 'calf', toolUseId: 'toolu_stray', parentLaneId: foreign.id, depth: 1 }),
    );

    expect(refuse(p).message).toContain(foreign.id);
  });

  it('a lane_opened payload.lane.id that names no lane of the parent is IO and writes nothing', () => {
    const p = makeParent();
    p.store.append(
      eventInput(p.parent.id, p.calf1.id, {
        type: 'lane_opened',
        payload: { type: 'lane_opened', lane: { ...p.calf1, id: 'ghost-opened-id' } },
      }),
    );

    expect(refuse(p).message).toContain('ghost-opened-id');
  });

  it('a lane_opened payload.lane.parentLaneId that names no lane of the parent is IO and writes nothing', () => {
    const p = makeParent();
    p.store.append(
      eventInput(p.parent.id, p.calf1.id, {
        type: 'lane_opened',
        payload: { type: 'lane_opened', lane: { ...p.calf1, parentLaneId: 'ghost-opened-parent' } },
      }),
    );

    expect(refuse(p).message).toContain('ghost-opened-parent');
  });

  it('a lane_closed payload.laneId that names no lane of the parent is IO and writes nothing', () => {
    const p = makeParent();
    p.store.append(
      eventInput(p.parent.id, p.calf1.id, {
        type: 'lane_closed',
        payload: { type: 'lane_closed', laneId: 'ghost-closed', status: 'done' },
      }),
    );

    expect(refuse(p).message).toContain('ghost-closed');
  });

  it('a tool_use payload.dispatchedLaneId that names no lane of the parent is IO and writes nothing', () => {
    const p = makeParent();
    p.store.append(
      eventInput(p.parent.id, p.matriarch.id, {
        type: 'tool_use',
        payload: { type: 'tool_use', toolUseId: 'toolu_9', name: 'Agent', input: {}, dispatchedLaneId: 'ghost-dispatched' },
      }),
    );

    expect(refuse(p).message).toContain('ghost-dispatched');
  });

  it('the message begins "forkPod:" and names the missing LaneId and the parent PodId verbatim', () => {
    // Ids no fixed wording could contain by accident.
    const p = makeParent('pod-7f3a9c');
    p.store.append(
      eventInput(p.parent.id, p.calf1.id, {
        type: 'lane_closed',
        payload: { type: 'lane_closed', laneId: 'lane-e21b04', status: 'done' },
      }),
    );

    const { message } = refuse(p);

    expect(message.startsWith('forkPod:')).toBe(true);
    expect(message).toContain('lane-e21b04');
    expect(message).toContain('pod-7f3a9c');
  });
});

// ---------------------------------------------------------------------------
// Deleting the parent
// ---------------------------------------------------------------------------

describe('deletePod(parent) after a fork', () => {
  it('keeps the fork row, nulls forkedFromPodId and keeps forkedFromCcSessionId', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id, { sourceCcSessionId: 'cc-parent' }));

    p.store.deletePod(p.parent.id);

    expect(p.store.getPod('fork')).toMatchObject({ forkedFromPodId: null, forkedFromCcSessionId: 'cc-parent' });
  });

  it('keeps the fork lane count and event count', () => {
    const p = makeParent();
    p.store.forkPod(forkInput(p.parent.id));
    const db = rawDb(p.path);
    const forkCounts = (): { lanes: number; events: number } => ({
      lanes: db.prepare<unknown[], { n: number }>("SELECT COUNT(*) AS n FROM lanes WHERE pod_id = 'fork'").get()?.n ?? -1,
      events: db.prepare<unknown[], { n: number }>("SELECT COUNT(*) AS n FROM events WHERE pod_id = 'fork'").get()?.n ?? -1,
    });
    const before = forkCounts();
    expect(before.lanes).toBeGreaterThan(0);
    expect(before.events).toBeGreaterThan(0);

    p.store.deletePod(p.parent.id);

    expect(forkCounts()).toEqual(before);
  });
});
