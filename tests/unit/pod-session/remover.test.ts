/**
 * The Pod-session remover, exercised against a synthetic tree.
 *
 * NOTHING HERE TOUCHES THE DEVELOPER'S MACHINE. Every fixture lives under
 * `mkdtempSync(join(tmpdir(), …))` — the pattern the store and Beachcomber
 * suites already use — and the trash capability is a fake that RECORDS the
 * absolute path it was handed. That recording is the point: a fake that
 * records nothing looks identical to a fake that was never called, so every
 * assertion below reads the recorded list rather than a call count alone.
 *
 * Four of the five outcomes are decided here. The fifth, `'not-requested'`,
 * belongs to the caller: the port's signature takes only a `Pod`, so
 * `deleteSession: false` is answered by the IPC handler without the port ever
 * being reached — asserted in `tests/unit/ipc/pod-deletion.test.ts`.
 */

import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Pod } from '../../../src/shared/contracts/events';
import {
  createPodSessionRemover,
  encodeCwdForProjects,
  fileExists,
  sessionFilePath,
} from '../../../src/main/pod-session';

const CWD = 'C:\\Users\\tester\\Repos\\orcastrate';
const SESSION_ID = 'cc-session-0001';

function makePod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: 'pod-1',
    title: 'Test Pod',
    cwd: CWD,
    ccSessionId: SESSION_ID,
    status: 'closed',
    permissionMode: 'default',
    envOverrides: {},
    tabOrder: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
    lastActiveAt: '2026-08-20T00:00:00.000Z',
    forkedFromPodId: null,
    forkedFromCcSessionId: null,
    ...overrides,
  };
}

interface Rig {
  claudeHome: string;
  /** Every absolute path the trash capability was handed, in order. */
  binned: string[];
  /** The directory the session file lives in. */
  projectDir: string;
  /** The session file's own absolute path. */
  filePath: string;
  writeSessionFile(): void;
}

function makeRig(): Rig {
  const claudeHome = mkdtempSync(join(tmpdir(), 'orcastrate-pod-session-'));
  const projectDir = join(claudeHome, 'projects', encodeCwdForProjects(CWD));
  return {
    claudeHome,
    binned: [],
    projectDir,
    filePath: join(projectDir, `${SESSION_ID}.jsonl`),
    writeSessionFile(): void {
      mkdirSync(projectDir, { recursive: true });
      // A sibling from another Pod, so "the parent directory was not binned"
      // is a statement about something that would really have been destroyed.
      writeFileSync(join(projectDir, 'someone-elses-session.jsonl'), '{}\n', 'utf8');
      writeFileSync(join(projectDir, `${SESSION_ID}.jsonl`), '{}\n', 'utf8');
    },
  };
}

/**
 * A synchronous stand-in for the real probe, so the seam stays injected. The
 * real one is exercised directly at the bottom of this file.
 *
 * Fixtures are left for the OS temp sweeper on purpose: this suite owns no
 * deletion primitive either, which is the invariant it exists to protect.
 */
const probe = async (path: string): Promise<boolean> => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

describe('the encoding runs FORWARD only', () => {
  it('replaces every non-alphanumeric character with a dash', () => {
    expect(encodeCwdForProjects('C:\\Users\\dmarq\\Repos\\orcastrate')).toBe(
      'C--Users-dmarq-Repos-orcastrate',
    );
    expect(encodeCwdForProjects('/home/tester/work')).toBe('-home-tester-work');
  });

  it('is a total function: two different cwds that collide still both encode', () => {
    // The ambiguity is in the INVERSE, which this module never computes.
    expect(encodeCwdForProjects('C:\\x\\Repos\\dir-ect')).toBe(
      encodeCwdForProjects('C:\\x\\Repos\\dir\\ect'),
    );
  });

  it('composes the file path, never the directory path', () => {
    const path = sessionFilePath('/home/t/.claude', '/w/proj', 'abc');
    expect(path.endsWith(join('projects', '-w-proj', 'abc.jsonl'))).toBe(true);
  });

  it('never decodes a directory name', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const dir = fileURLToPath(new URL('../../../src/main/pod-session/', import.meta.url));
    const names = readdirSync(dir).filter((name) => name.endsWith('.ts'));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const text = readFileSync(join(dir, name), 'utf8');
      const code = text
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .join('\n');
      expect(`${name} decodes: ${code.includes('decodeDirectoryName')}`).toBe(
        `${name} decodes: false`,
      );
      expect(`${name} compares: ${code.includes('normalizeForCompare')}`).toBe(
        `${name} compares: false`,
      );
    }
  });
});

describe('the four outcomes the port itself decides', () => {
  it("answers 'no-session' and bins nothing when the Pod never had a session", async () => {
    const rig = makeRig();
    rig.writeSessionFile();
    const remove = createPodSessionRemover({
      claudeHome: rig.claudeHome,
      trashItem: async (path) => {
        rig.binned.push(path);
      },
      fileExists: probe,
    });

    const result = await remove(makePod({ ccSessionId: null }));

    expect(result).toEqual({ outcome: 'no-session', error: null });
    expect(rig.binned).toEqual([]);
  });

  it("answers 'not-found' when the file is absent", async () => {
    const rig = makeRig();
    // Deliberately NOT written.
    const remove = createPodSessionRemover({
      claudeHome: rig.claudeHome,
      trashItem: async (path) => {
        rig.binned.push(path);
      },
      fileExists: probe,
    });

    const result = await remove(makePod());

    expect(result).toEqual({ outcome: 'not-found', error: null });
    expect(rig.binned).toEqual([]);
  });

  it("answers 'trashed' and hands over THE FILE, never its parent directory", async () => {
    const rig = makeRig();
    rig.writeSessionFile();
    const remove = createPodSessionRemover({
      claudeHome: rig.claudeHome,
      trashItem: async (path) => {
        rig.binned.push(path);
      },
      fileExists: probe,
    });

    const result = await remove(makePod());

    expect(result).toEqual({ outcome: 'trashed', error: null });
    // The exact path, asserted positively...
    expect(rig.binned).toEqual([rig.filePath]);
    // ...and the directory, asserted negatively. Binning the parent would
    // destroy every other Pod's session and every CLI session run there.
    expect(rig.binned).not.toContain(rig.projectDir);
    expect(rig.binned[0]?.endsWith('.jsonl')).toBe(true);
  });

  it("answers 'failed' carrying the platform message VERBATIM", async () => {
    const rig = makeRig();
    rig.writeSessionFile();
    const remove = createPodSessionRemover({
      claudeHome: rig.claudeHome,
      trashItem: async (path) => {
        rig.binned.push(path);
        throw new Error('EPERM: the recycle bin refused the item');
      },
      fileExists: probe,
    });

    const result = await remove(makePod());

    expect(result).toEqual({
      outcome: 'failed',
      error: 'EPERM: the recycle bin refused the item',
    });
    // The fake WAS reached — otherwise this would be indistinguishable from a
    // port that failed before it ever tried.
    expect(rig.binned).toEqual([rig.filePath]);
  });

  it('carries a non-Error rejection through as a string rather than losing it', async () => {
    const rig = makeRig();
    rig.writeSessionFile();
    const remove = createPodSessionRemover({
      claudeHome: rig.claudeHome,
      trashItem: () => Promise.reject('bare string failure'),
      fileExists: probe,
    });

    expect(await remove(makePod())).toEqual({
      outcome: 'failed',
      error: 'bare string failure',
    });
  });
});

describe('the port never rejects', () => {
  it('RESOLVES when the trash capability rejects', async () => {
    const rig = makeRig();
    rig.writeSessionFile();
    const remove = createPodSessionRemover({
      claudeHome: rig.claudeHome,
      trashItem: () => Promise.reject(new Error('platform said no')),
      fileExists: probe,
    });

    // Asserted as a resolution, not merely by reading the value: a rejected
    // promise awaited inside an `expect(...)` argument would fail the test for
    // the wrong reason and read the same in the report.
    let settled: 'resolved' | 'rejected' = 'rejected';
    const value = await remove(makePod()).then(
      (v) => {
        settled = 'resolved';
        return v;
      },
      (err: unknown) => {
        settled = 'rejected';
        return err;
      },
    );

    expect(settled).toBe('resolved');
    expect(value).toEqual({ outcome: 'failed', error: 'platform said no' });
  });

  it('the real probe never throws — an absent path answers false', async () => {
    // The contract's "never throws" clause on `fileExists`, made durable: the
    // port relies on it rather than re-catching around the probe.
    expect(await fileExists(join(tmpdir(), 'orcastrate-no-such-path-ever'))).toBe(false);
  });

  it('the real probe answers false for a DIRECTORY, so a parent is never mistaken for the file', async () => {
    const rig = makeRig();
    rig.writeSessionFile();
    expect(await fileExists(rig.projectDir)).toBe(false);
    expect(await fileExists(rig.filePath)).toBe(true);
  });
});
