/**
 * Blocking a `projects` entry whose path was never recorded.
 *
 * The directory name IS the encoding of the true cwd, and the encoding is a
 * total function while the decoding is a guess. So the question "does a Pod
 * hold this directory's cwd?" is asked forwards — encode the Pod's cwd and
 * compare against the name on disk — rather than backwards against a decoded
 * guess that the module's own docblocks describe as ambiguous.
 *
 * THE FIXTURE IS NOT A ROUND TRIP, deliberately. `C:\Users\x\Repos\dir-ect`
 * encodes to `C--Users-x-Repos-dir-ect`, and `decodeDirectoryName` reads that
 * back as `C:\Users\x\Repos\dir\ect` — the literal hyphen its own docblock
 * names as the ambiguous case. A cwd the decoder happens to get right would
 * make every assertion here vacuous, because the old comparison would already
 * have matched it.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createBeachcomberService } from '../../../src/main/beachcomber';
import { decodeDirectoryName, podBlockerFor } from '../../../src/main/beachcomber/paths';
import { encodeCwdForProjects } from '../../../src/main/pod-session';
import type { PodDirectory } from '../../../src/shared/contracts/panel-host';
import {
  cleanupFixtures,
  entryNamed,
  makeClaudeHome,
  makeDeps,
  makeProject,
  podProvider,
  writeAt,
} from './helpers';

afterEach(() => {
  cleanupFixtures();
});

/** A cwd the decoder demonstrably gets wrong: the literal hyphen is ambiguous. */
const AMBIGUOUS_CWD = 'C:\\Users\\x\\Repos\\dir-ect';
const AMBIGUOUS_DIR = encodeCwdForProjects(AMBIGUOUS_CWD);

const POD: PodDirectory = {
  podId: 'pod-0007',
  title: 'Work on dir-ect',
  cwd: AMBIGUOUS_CWD,
};

describe('the fixture is genuinely not a round trip', () => {
  it('encodes to the directory name, and decodes back to a different path', () => {
    expect(AMBIGUOUS_DIR).toBe('C--Users-x-Repos-dir-ect');
    expect(decodeDirectoryName(AMBIGUOUS_DIR)).toBe('C:\\Users\\x\\Repos\\dir\\ect');
    expect(decodeDirectoryName(AMBIGUOUS_DIR)).not.toBe(AMBIGUOUS_CWD);
  });
});

describe('a decoded projects entry is blocked by encoding the Pod cwd (R2)', () => {
  it('blocks the entry and names the Pod, through a full scan', async () => {
    const home = makeClaudeHome();
    // No `cwd` in any record, so the path stays a decoded guess.
    makeProject(home, AMBIGUOUS_DIR, [{ type: 'user', text: 'hello' }]);

    const scan = await createBeachcomberService(
      makeDeps(home, { pods: podProvider([POD]) }),
    ).scan();

    const entry = entryNamed(scan, AMBIGUOUS_DIR);
    expect(entry.pathSource).toBe('decoded-name');
    expect(entry.blocked).toBe('pod-cwd');
    expect(entry.blockedBy).toEqual({ podId: 'pod-0007', title: 'Work on dir-ect' });
  });

  it('folds case, because over-refusing is the safe direction for a deletion guard', () => {
    const blocker = podBlockerFor({
      root: 'projects',
      name: AMBIGUOUS_DIR.toUpperCase(),
      pathSource: 'decoded-name',
      displayPath: decodeDirectoryName(AMBIGUOUS_DIR),
      pods: [POD],
    });
    expect(blocker?.podId).toBe('pod-0007');
  });

  it('is a pure function of the entry fields and the Pod list, with no filesystem at all', () => {
    expect(
      podBlockerFor({
        root: 'projects',
        name: AMBIGUOUS_DIR,
        pathSource: 'decoded-name',
        displayPath: decodeDirectoryName(AMBIGUOUS_DIR),
        pods: [POD],
      })?.podId,
    ).toBe('pod-0007');

    expect(
      podBlockerFor({
        root: 'projects',
        name: AMBIGUOUS_DIR,
        pathSource: 'decoded-name',
        displayPath: decodeDirectoryName(AMBIGUOUS_DIR),
        pods: [],
      }),
    ).toBeNull();
  });

  it('leaves everything else about the entry where it was (R5)', async () => {
    const home = makeClaudeHome();
    makeProject(home, AMBIGUOUS_DIR, [{ type: 'user', text: 'hello' }]);

    const scan = await createBeachcomberService(
      makeDeps(home, { pods: podProvider([POD]) }),
    ).scan();

    const entry = entryNamed(scan, AMBIGUOUS_DIR);
    // A guessed path may never be called missing, blocked or not.
    expect(entry.orphan).toBe(false);
    expect(entry.displayPath).toBe(decodeDirectoryName(AMBIGUOUS_DIR));
    expect(entry.name).toBe(AMBIGUOUS_DIR);
    expect(entry.root).toBe('projects');
  });
});

describe('the root matters as much as the pathSource (R4)', () => {
  it('does not encode a Pod cwd against a shell-snapshot, file-history or paste-cache name', async () => {
    const home = makeClaudeHome();
    for (const dir of ['shell-snapshots', 'file-history', 'paste-cache']) {
      writeAt(home, `${dir}/${AMBIGUOUS_DIR}`, 'not a working directory');
    }

    const scan = await createBeachcomberService(
      makeDeps(home, { pods: podProvider([POD]) }),
    ).scan();

    for (const root of ['shellSnapshots', 'fileHistory', 'pasteCache'] as const) {
      const entry = scan.entries.find((e) => e.root === root && e.name === AMBIGUOUS_DIR);
      expect(entry?.pathSource).toBe('decoded-name');
      expect(entry?.blocked).toBeNull();
      expect(entry?.blockedBy).toBeNull();
    }
  });

  it('refuses the encoding comparison for every non-projects root, as a pure call', () => {
    for (const root of ['shellSnapshots', 'fileHistory', 'pasteCache'] as const) {
      expect(
        podBlockerFor({
          root,
          name: AMBIGUOUS_DIR,
          pathSource: 'decoded-name',
          displayPath: `C:\\fixture\\.claude\\somewhere\\${AMBIGUOUS_DIR}`,
          pods: [POD],
        }),
      ).toBeNull();
    }
  });
});

describe('recorded paths are compared exactly as before (R1)', () => {
  const recordedCwd = 'C:\\Users\\x\\Repos\\router';
  const recordedPod: PodDirectory = {
    podId: 'pod-0001',
    title: 'Refactor the router',
    cwd: recordedCwd,
  };

  it('blocks a recorded entry whose recorded cwd is a Pod cwd', async () => {
    const home = makeClaudeHome();
    makeProject(home, 'C--Users-x-Repos-router', [{ type: 'user', cwd: recordedCwd }]);

    const scan = await createBeachcomberService(
      makeDeps(home, { pods: podProvider([recordedPod]) }),
    ).scan();

    const entry = entryNamed(scan, 'C--Users-x-Repos-router');
    expect(entry.pathSource).toBe('session-record');
    expect(entry.blocked).toBe('pod-cwd');
  });

  it('does not block a recorded entry whose recorded cwd belongs to no Pod', async () => {
    const home = makeClaudeHome();
    // The NAME encodes the Pod cwd, but the transcript records a different
    // directory. A recorded path is the truth; the name is not consulted.
    makeProject(home, AMBIGUOUS_DIR, [{ type: 'user', cwd: 'C:\\Users\\x\\Repos\\elsewhere' }]);

    const scan = await createBeachcomberService(
      makeDeps(home, { pods: podProvider([POD]) }),
    ).scan();

    const entry = entryNamed(scan, AMBIGUOUS_DIR);
    expect(entry.pathSource).toBe('session-record');
    expect(entry.blocked).toBeNull();
    expect(entry.blockedBy).toBeNull();
  });
});

describe('the two comparisons are a union, never a replacement (R3)', () => {
  // `my_project` is the case that separates them: the decoder returns it
  // verbatim, so the OLD comparison matches a Pod at `my_project` — while the
  // encoder turns that cwd into `my-project`, which is NOT this entry's name.
  // If the encoding comparison had replaced the normalized one, this entry
  // would have become unblocked, which is the regression R3 forbids.
  const underscoreCwd = 'my_project';

  it('keeps blocking a decoded entry that only the normalized comparison matches', async () => {
    const home = makeClaudeHome();
    makeProject(home, underscoreCwd, [{ type: 'user', text: 'no cwd here' }]);

    const pod: PodDirectory = { podId: 'pod-0009', title: 'Underscored', cwd: underscoreCwd };
    const scan = await createBeachcomberService(
      makeDeps(home, { pods: podProvider([pod]) }),
    ).scan();

    const entry = entryNamed(scan, underscoreCwd);
    expect(entry.pathSource).toBe('decoded-name');
    expect(entry.blocked).toBe('pod-cwd');
    expect(entry.blockedBy?.podId).toBe('pod-0009');
  });

  it('proves that entry is matched by the normalized side alone', () => {
    expect(decodeDirectoryName(underscoreCwd)).toBe(underscoreCwd);
    expect(encodeCwdForProjects(underscoreCwd)).toBe('my-project');
    expect(encodeCwdForProjects(underscoreCwd)).not.toBe(underscoreCwd);
  });
});
