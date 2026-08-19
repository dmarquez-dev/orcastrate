/**
 * The rule the design got wrong: a `projects/<dir>` name cannot be decoded back
 * to a working directory, so the recorded `cwd` decides — and `orphan` may only
 * ever be claimed about a recorded path.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createBeachcomberService } from '../../../src/main/beachcomber';
import { decodeDirectoryName } from '../../../src/main/beachcomber/paths';
import { CHUNK_BYTES, readFirstCwd } from '../../../src/main/beachcomber/session-record';
import {
  cleanupFixtures,
  entryNamed,
  jsonlLine,
  makeClaudeHome,
  makeDeps,
  makeDir,
  makeProject,
  writeAt,
} from './helpers';

/** The directory name that reads two ways. Both readings appear below. */
const AMBIGUOUS = 'C--Users-x-Repos-dir-ect';
const READING_HYPHEN = 'C:\\Users\\x\\Repos\\dir-ect';
const READING_SEPARATOR = 'C:\\Users\\x\\Repos\\dir\\ect';

afterEach(() => {
  cleanupFixtures();
});

describe('resolving a project directory to its working directory', () => {
  it('reports the cwd from the session record verbatim, and marks it authoritative', async () => {
    const home = makeClaudeHome();
    makeProject(home, AMBIGUOUS, [
      { type: 'summary' },
      { type: 'user', cwd: READING_HYPHEN, sessionId: 's1' },
    ]);

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, AMBIGUOUS);

    expect(entry.displayPath).toBe(READING_HYPHEN);
    expect(entry.pathSource).toBe('session-record');
  });

  it('reports the recorded cwd when the directory name is ambiguous, not the decoded guess', async () => {
    const home = makeClaudeHome();
    makeProject(home, AMBIGUOUS, [{ type: 'user', cwd: READING_SEPARATOR }]);

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, AMBIGUOUS);

    expect(entry.displayPath).toBe(READING_SEPARATOR);
    expect(entry.pathSource).toBe('session-record');
  });

  it('ships the record rather than the decoded guess when the two disagree', async () => {
    const home = makeClaudeHome();
    makeProject(home, AMBIGUOUS, [{ type: 'user', cwd: READING_HYPHEN }]);

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, AMBIGUOUS);

    // Decoding this name yields the OTHER reading. The decoded guess is not
    // what ships, and this is the assertion that keeps it that way.
    expect(decodeDirectoryName(AMBIGUOUS)).toBe(READING_SEPARATOR);
    expect(entry.displayPath).not.toBe(decodeDirectoryName(AMBIGUOUS));
    expect(entry.displayPath).toBe(READING_HYPHEN);
  });

  it('gives one directory name two different paths when the records differ, proving the name decides nothing', async () => {
    const homeA = makeClaudeHome();
    const homeB = makeClaudeHome();
    makeProject(homeA, AMBIGUOUS, [{ type: 'user', cwd: READING_HYPHEN }]);
    makeProject(homeB, AMBIGUOUS, [{ type: 'user', cwd: READING_SEPARATOR }]);

    const scanA = await createBeachcomberService(makeDeps(homeA)).scan();
    const scanB = await createBeachcomberService(makeDeps(homeB)).scan();

    expect(entryNamed(scanA, AMBIGUOUS).displayPath).toBe(READING_HYPHEN);
    expect(entryNamed(scanB, AMBIGUOUS).displayPath).toBe(READING_SEPARATOR);
  });

  it('stops at the first cwd-bearing record even when later records moved', async () => {
    const home = makeClaudeHome();
    makeProject(home, 'C--work-first', [
      { type: 'summary', leafUuid: 'abc' },
      { type: 'user', cwd: 'C:\\work\\first' },
      { type: 'assistant', cwd: 'D:\\somewhere\\else' },
      { type: 'user', cwd: 'E:\\later\\still' },
    ]);

    const scan = await createBeachcomberService(makeDeps(home)).scan();

    expect(entryNamed(scan, 'C--work-first').displayPath).toBe('C:\\work\\first');
  });

  it('reads only the head of a multi-megabyte transcript to find the cwd', async () => {
    const home = makeClaudeHome();
    const dir = makeDir(home, 'projects/C--work-big');
    const filler = jsonlLine({ type: 'assistant', text: 'x'.repeat(4096) });
    const body = jsonlLine({ type: 'user', cwd: 'C:\\work\\big' }) + filler.repeat(1400);
    const file = writeAt(dir, 'session-a.jsonl', body);

    // The fixture really is multi-megabyte, so the bound below means something.
    expect(body.length).toBeGreaterThan(5 * 1024 * 1024);

    const result = await readFirstCwd(file);

    expect(result.cwd).toBe('C:\\work\\big');
    expect(result.bytesRead).toBeLessThanOrEqual(CHUNK_BYTES);
  });
});

describe('orphan detection', () => {
  it('never calls a directory an orphan when its path is only a decoded guess', async () => {
    const home = makeClaudeHome();
    // A transcript with records but no cwd anywhere: nothing authoritative.
    makeProject(home, 'C--nowhere-at-all', [{ type: 'summary' }, { type: 'assistant' }]);

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, 'C--nowhere-at-all');

    expect(entry.pathSource).toBe('decoded-name');
    // The decoded path certainly does not exist, and the entry still is not an
    // orphan: unfalsifiable is not the same as absent.
    expect(entry.displayPath).toBe('C:\\nowhere\\at\\all');
    expect(entry.orphan).toBe(false);
  });

  it('never calls a directory an orphan when it holds no session transcript at all', async () => {
    const home = makeClaudeHome();
    makeDir(home, 'projects/C--empty-project');

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, 'C--empty-project');

    expect(entry.pathSource).toBe('decoded-name');
    expect(entry.orphan).toBe(false);
  });

  it('reports an orphan when the recorded working directory is gone', async () => {
    const home = makeClaudeHome();
    const missing = `${home}-vanished-project`;
    makeProject(home, 'C--work-vanished', [{ type: 'user', cwd: missing }]);

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, 'C--work-vanished');

    expect(entry.pathSource).toBe('session-record');
    expect(entry.orphan).toBe(true);
  });

  it('reports no orphan when the recorded working directory still exists', async () => {
    const home = makeClaudeHome();
    const live = makeDir(home, 'live-working-directory');
    makeProject(home, 'C--work-live', [{ type: 'user', cwd: live }]);

    const scan = await createBeachcomberService(makeDeps(home)).scan();
    const entry = entryNamed(scan, 'C--work-live');

    expect(entry.pathSource).toBe('session-record');
    expect(entry.orphan).toBe(false);
  });
});
