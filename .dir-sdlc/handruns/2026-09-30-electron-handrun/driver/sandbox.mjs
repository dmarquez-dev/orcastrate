/**
 * Sandbox construction for the driven hand-run.
 *
 * THE WHOLE POINT: the app resolves `CLAUDE_HOME` as `join(homedir(), '.claude')`
 * once, at module load (`src/main/index.ts:47`). `os.homedir()` on Windows reads
 * `USERPROFILE`. So handing Electron a different `USERPROFILE` moves the app's
 * entire notion of "my Claude home" into a directory we own — with no code
 * change and no flag.
 *
 * `app.getPath('userData')` derives from the OS app-data directory instead, so
 * `APPDATA` is redirected too. Otherwise the Pod store (sqlite) would be the
 * real one and Pods created by a test run would persist into the user's app.
 *
 * Nothing here touches the real `~/.claude`. The real home is never read and
 * never written.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The app's own encoder, reproduced here so fixtures match byte for byte.
 *  Mirrors `encodeCwdForProjects` in `src/main/pod-session/paths.ts`. */
export function encodeCwdForProjects(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/** The app's own decoder. Mirrors `decodeDirectoryName` in
 *  `src/main/beachcomber/paths.ts`. Lossy by design. */
export function decodeDirectoryName(name) {
  const drive = /^([A-Za-z])--(.*)$/.exec(name);
  if (drive) return `${drive[1]}:\\${drive[2].replace(/-/g, '\\')}`;
  if (name.startsWith('-')) return `/${name.slice(1).replace(/-/g, '/')}`;
  return name;
}

function writeJsonl(path, records) {
  writeFileSync(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

/**
 * Builds a complete throwaway home under `root` and returns the facts the
 * tests assert against.
 */
export function buildSandbox(root) {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });

  const home = join(root, 'home');
  const claude = join(home, '.claude');
  const repos = join(root, 'repos');

  /**
   * THE APPDATA SKELETON IS NOT OPTIONAL, and this cost an hour to learn.
   *
   * Pointing `USERPROFILE` at a bare directory makes Electron abort with
   * `0xC0000003` before a single line of app JS runs — no output at all, not
   * even the `better-sqlite3 loaded` line main prints first. Chromium derives
   * its profile location from the Windows profile and cannot cope when the
   * standard `AppData\Roaming` / `AppData\Local` pair is absent.
   *
   * Creating the skeleton fixes it. Redirecting `APPDATA`/`LOCALAPPDATA`/`TEMP`
   * into it as well is what makes the isolation total: `app.getPath('userData')`
   * follows those, so the Pod sqlite store lands in the sandbox too and each
   * run starts with no Pods rather than inheriting the real app's.
   *
   * (`--user-data-dir=<path>` was also verified to work, and would move only
   * Chromium's profile. The skeleton is preferred because it isolates the Pod
   * store as well.)
   */
  const roaming = join(home, 'AppData', 'Roaming');
  const localApp = join(home, 'AppData', 'Local');
  const temp = join(localApp, 'Temp');
  const appData = roaming;

  // The Pod working directories. Real directories, because `createPod` refuses
  // a cwd that is not one (`pod-manager.ts:391`).
  const blockedRepo = join(repos, 'blocked-repo');
  const plainRepo = join(repos, 'plain-repo');

  for (const d of [claude, roaming, localApp, temp, blockedRepo, plainRepo]) {
    mkdirSync(d, { recursive: true });
  }
  for (const d of [blockedRepo, plainRepo]) {
    writeFileSync(join(d, 'README.md'), '# sandbox throwaway\n', 'utf8');
  }

  const roots = {
    projects: join(claude, 'projects'),
    shellSnapshots: join(claude, 'shell-snapshots'),
    fileHistory: join(claude, 'file-history'),
    pasteCache: join(claude, 'paste-cache'),
  };
  for (const d of Object.values(roots)) mkdirSync(d, { recursive: true });

  // ---- the crown-jewel fixture -------------------------------------------
  // Directory name IS the encoding of blockedRepo. Its transcripts record NO
  // cwd, so `resolveProjectPath` falls back to the decoded name — a guess that
  // does not equal the real path. Pre-C2 that mismatch meant a live Pod did
  // not block this entry.
  const encodedBlocked = encodeCwdForProjects(blockedRepo);
  const decodedGuess = decodeDirectoryName(encodedBlocked);

  const blockedEntry = join(roots.projects, encodedBlocked);
  mkdirSync(blockedEntry, { recursive: true });
  for (const n of [1, 2]) {
    writeJsonl(join(blockedEntry, `oc-test-session-${n}.jsonl`), [
      { type: 'summary', summary: 'sandbox fixture, no cwd anywhere' },
      { type: 'user', sessionId: `oc-test-nocwd-${n}`, message: 'no cwd recorded' },
    ]);
  }

  // ---- a recorded entry: blocked the OLD way, proving the union holds -----
  const recordedEntry = join(roots.projects, 'oc-test-recorded');
  mkdirSync(recordedEntry, { recursive: true });
  writeJsonl(join(recordedEntry, 'oc-test-session-1.jsonl'), [
    { type: 'summary', summary: 'leading record carries no cwd on purpose' },
    { type: 'user', cwd: plainRepo, sessionId: 'oc-test-recorded-1' },
  ]);

  // ---- a recorded entry whose cwd is gone: orphan marker -----------------
  const orphanEntry = join(roots.projects, 'oc-test-orphan');
  mkdirSync(orphanEntry, { recursive: true });
  writeJsonl(join(orphanEntry, 'oc-test-session-1.jsonl'), [
    { type: 'user', cwd: join(repos, 'this-was-deleted'), sessionId: 'oc-test-orphan-1' },
  ]);

  // ---- the R4 guard ------------------------------------------------------
  // The SAME encoded name under each non-projects root. Every non-projects
  // entry is labelled `decoded-name` while carrying a true absolute path, so
  // these must NOT be blocked. That is the half of the condition which would
  // otherwise be invisible.
  for (const key of ['shellSnapshots', 'fileHistory', 'pasteCache']) {
    for (const name of [encodedBlocked, 'oc-test-decoy']) {
      const d = join(roots[key], name);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'oc-test-payload.txt'), 'sandbox fixture\n', 'utf8');
    }
  }

  return {
    root,
    home,
    claude,
    appData,
    repos,
    blockedRepo,
    plainRepo,
    encodedBlocked,
    decodedGuess,
    settingsPath: join(claude, 'settings.json'),
    roots,
    /** Env for `_electron.launch`. This is what redirects the app's home. */
    env: {
      ...process.env,
      USERPROFILE: home,
      HOME: home,
      APPDATA: roaming,
      LOCALAPPDATA: localApp,
      TEMP: temp,
      TMP: temp,
    },
  };
}

export const BASELINE_SETTINGS = {
  model: 'claude-opus-5',
  permissions: {
    allow: ['Bash(npm run test:*)', 'Read(//sandbox/**)'],
    deny: ['Bash(rm -rf:*)'],
  },
  env: { OC_HANDRUN: 'baseline', OC_MARKER: 'do-not-ship' },
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo sandbox-baseline' }] },
    ],
  },
};

export function writeSettings(sandbox, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  writeFileSync(sandbox.settingsPath, text, 'utf8');
}
