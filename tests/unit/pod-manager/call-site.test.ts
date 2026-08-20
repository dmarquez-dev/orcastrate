/**
 * Criteria 13 and 14 — where the sweep is called from, and the comment beside it.
 *
 * `src/main/index.ts` imports `electron` at module scope and its whole body is
 * one `app.whenReady()` continuation, so it cannot be imported into a Node test
 * without a full Electron double — a double large enough that it would be
 * asserting its own shape rather than the file's. The ordering is therefore
 * pinned by reading the SOURCE, which is exactly what a reviewer would do and
 * is the assertion the contract asks for: "a test now pins it rather than
 * leaving it to luck".
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  fileURLToPath(new URL('../../../src/main/index.ts', import.meta.url)),
  'utf8',
);

/** Index of a single occurrence, asserted to occur exactly once. */
function only(needle: string): number {
  const first = SOURCE.indexOf(needle);
  const second = SOURCE.indexOf(needle, first + 1);
  expect(first, `expected \`${needle}\` in src/main/index.ts`).toBeGreaterThan(-1);
  expect(second, `expected \`${needle}\` exactly once in src/main/index.ts`).toBe(-1);
  return first;
}

/**
 * The FIRST `createMainWindow()` call — the one inside `app.whenReady()`. The
 * `activate` handler further down calls it a second time, and that occurrence
 * is not what the ordering is about.
 */
function firstWindow(): number {
  const index = SOURCE.indexOf('createMainWindow();');
  expect(index).toBeGreaterThan(-1);
  return index;
}

describe('criterion 13: the boot sweep is called once, in order, with no logic', () => {
  it('runs inside app.whenReady(), after the store migrated and the manager exists', () => {
    const ready = only('app.whenReady()');
    const migrate = only('store.migrate();');
    const construct = only('new PodManager({');
    const sweep = only('manager.reconcileStartup();');

    expect(sweep).toBeGreaterThan(ready);
    // Migration 3 widens the `pods.status` CHECK, and the sweep WRITES
    // `'closed'`. A sweep ordered before the migration would fail every write
    // with `CHECK constraint failed`.
    expect(sweep).toBeGreaterThan(migrate);
    // After, because there is no manager before it.
    expect(sweep).toBeGreaterThan(construct);
  });

  it('runs BEFORE createMainWindow(), so no renderer can observe an unreconciled row', () => {
    const sweep = only('manager.reconcileStartup();');

    expect(sweep).toBeLessThan(firstWindow());
  });

  it('is one line with no logic: the result is neither branched on nor awaited', () => {
    const line = SOURCE.split('\n').find((text) => text.includes('reconcileStartup'));
    // `index.ts`'s own docblock forbids logic in that file; the behaviour lives
    // in `src/main/pod-manager/`.
    expect(line?.trim()).toBe('manager.reconcileStartup();');
  });

  it('depends on no push: the sweep result is discarded, not routed to a renderer', () => {
    // `sendToRenderers` drops payloads when no window exists, and at this point
    // in startup there are none. Everything the renderer needs is READ from the
    // store on its first `pod:list`, so the result is deliberately unused here
    // — it exists for the log and for a test, not for the wire.
    const sweep = only('manager.reconcileStartup();');
    expect(SOURCE.slice(sweep - 40, sweep)).not.toContain('=');
    expect(SOURCE.indexOf('reconcileStartup')).toBe(SOURCE.lastIndexOf('reconcileStartup'));
  });
});

describe('criterion 14: the stale comment about idle is corrected', () => {
  it("no longer claims 'idle' covers both open-and-quiet and closed", () => {
    expect(SOURCE).not.toContain("`status: 'idle'` covers both open-and-quiet");
  });

  it('says the distinction now exists and that this provider deliberately ignores it', () => {
    const docblock = SOURCE.slice(
      SOURCE.indexOf('Every Pod Orcastrate knows about'),
      SOURCE.indexOf('const pods: PodDirectoryProvider'),
    );
    expect(docblock).toContain("'closed'");
    expect(docblock).toMatch(/deliberately ignores/);
  });

  it('leaves the CODE listing every KNOWN Pod, regardless of status', () => {
    const body = SOURCE.slice(
      SOURCE.indexOf('const pods: PodDirectoryProvider'),
      SOURCE.indexOf('const beachcomber'),
    );
    expect(body).toContain('manager.listPods().map(');
    expect(body).not.toContain('status');
  });
});
