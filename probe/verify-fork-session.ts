/**
 * THROWAWAY verification probe — fork-session verification.
 *
 * Answers ONE question with live evidence: does the SDK's STANDALONE
 * `forkSession(sessionId, { dir })` behave as its docblock says, against each
 * CLI binary that could be driving the product?
 *
 *   C1  the id `forkSession` returns differs from the source session id
 *   C2  a transcript exists at `sessionFilePath(<claude home>, <cwd>, <fork id>)`
 *       once `forkSession` resolves, before any resume
 *   C3  the source transcript's sha256 is identical immediately before and
 *       immediately after `forkSession`
 *   C4  a turn sent to the resumed fork, asking for the remembered value, is
 *       answered with the nonce
 *   C5  after that turn, the source transcript's sha256 still equals its
 *       pre-fork value
 *   C6  every `session_id` carried by the resumed fork's messages equals the
 *       fork id, not the source id
 *   C7  with the source transcript moved out of its projects directory, a
 *       resumed fork still answers with the nonce (the source is moved back
 *       afterwards and re-hashed)
 *
 * The claim set runs once per binary, each with its own fresh source session:
 *
 *   sdk-builtin   no `pathToClaudeCodeExecutable` — the SDK's built-in
 *                 executable, which is what the product drives
 *   path-claude   the `claude` on PATH, passed as `pathToClaudeCodeExecutable`
 *
 * Three live model turns per binary: one to the source (remember the nonce),
 * one to the resumed fork (C4–C6), one to the resumed fork with the source
 * transcript moved away (C7). No prompt sent to the fork contains the nonce.
 *
 *   node probe/verify-fork-session.ts
 *   PROBE_SCRATCH=/some/scratch/dir node probe/verify-fork-session.ts
 *
 * Env vars, as for the other probes: PROBE_SCRATCH (session cwd, outside the
 * repo), PROBE_CLI (overrides the PATH lookup for the `path-claude` run).
 * There is no PROBE_REUSE mode: every claim here is about live disk state.
 *
 * Writes `probe/evidence/fork-session.json`. The only session file it moves is
 * the source transcript it created itself, and it always moves it back.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { forkSession, query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// The shipped path rule under test, loaded the way verify-foreground.ts loads
// shipped code: a type-only static import (erased before Node sees it, so it
// may stay extensionless for tsc) plus a URL-based dynamic import ending in
// `.ts` (native ESM does no extension resolution). See verify-foreground.ts
// for the full reasoning.
import type * as PodSessionPaths from '../src/main/pod-session/paths';

const { sessionFilePath } = (await import(
  new URL('../src/main/pod-session/paths.ts', import.meta.url).href
)) as typeof PodSessionPaths;

const PROBE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(PROBE_DIR, '..');
const EVIDENCE_DIR = path.join(PROBE_DIR, 'evidence');
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, 'fork-session.json');
const SCRATCH = path.resolve(process.env.PROBE_SCRATCH ?? path.join(tmpdir(), 'orcastrate-probe'));
const PARK_DIR = path.join(SCRATCH, 'fork-session-parked');

/** Same rule as the product: `src/main/index.ts` uses `join(homedir(), '.claude')`. */
const HOME = homedir();
const CLAUDE_HOME = path.join(HOME, '.claude');

/** Per-turn ceiling; the CLI is a separate process (backend discipline: timeout). */
const TURN_TIMEOUT_MS = 240_000;

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

if (isInside(REPO_ROOT, SCRATCH)) {
  throw new Error(`PROBE_SCRATCH must be outside the repository (got a path under the repo root)`);
}

mkdirSync(EVIDENCE_DIR, { recursive: true });
mkdirSync(PARK_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Redaction — no home directory path, in any spelling, reaches the evidence
// ---------------------------------------------------------------------------

function pathRe(p: string): RegExp {
  const body = p
    .replace(/[.*+?^${}()|[\]\\/]/g, (c) => (c === '\\' || c === '/' ? '[\\\\/]+' : `\\${c}`))
    .replace(/(\[\\\\\/\]\+)+/g, '[\\\\/]+');
  return new RegExp(body, 'gi');
}

function mangledRe(p: string): RegExp {
  return new RegExp(p.replace(/[^A-Za-z0-9]/g, '-').replace(/[.*+?^${}()|[\]]/g, '\\$&'), 'gi');
}

const PATH_SUBS: Array<[RegExp, string]> = [
  [pathRe(SCRATCH), '<SCRATCH>'],
  [pathRe(REPO_ROOT), '<REPO>'],
  [pathRe(HOME), '<HOME>'],
  [mangledRe(SCRATCH), '<SCRATCH>'],
  [mangledRe(REPO_ROOT), '<REPO>'],
  [mangledRe(HOME), '<HOME>'],
];

function redact(s: string): string {
  let out = s;
  for (const [re, rep] of PATH_SUBS) out = out.replace(re, rep);
  return out;
}

// ---------------------------------------------------------------------------
// Binaries and versions
// ---------------------------------------------------------------------------

/** The SDK package directory, found from what Node actually resolves. */
function sdkPackageDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.resolve('@anthropic-ai/claude-agent-sdk')));
  for (;;) {
    const pj = path.join(dir, 'package.json');
    if (existsSync(pj)) {
      const name = (JSON.parse(readFileSync(pj, 'utf8')) as { name?: unknown }).name;
      if (name === '@anthropic-ai/claude-agent-sdk') return dir;
    }
    const up = path.dirname(dir);
    if (up === dir) throw new Error('could not locate @anthropic-ai/claude-agent-sdk/package.json');
    dir = up;
  }
}

const SDK_DIR = sdkPackageDir();
const SDK_VERSION = (
  JSON.parse(readFileSync(path.join(SDK_DIR, 'package.json'), 'utf8')) as { version: string }
).version;

/** The platform package the SDK ships its built-in executable in. */
function builtinExecutable(): string {
  const req = createRequire(path.join(SDK_DIR, 'package.json'));
  const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  const dir = path.dirname(req.resolve(`${pkg}/package.json`));
  const exe = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
  if (!existsSync(exe)) throw new Error(`built-in executable missing from ${pkg}`);
  return exe;
}

function pathClaude(): string {
  if (process.env.PROBE_CLI) return process.env.PROBE_CLI;
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const out = execFileSync(finder, ['claude'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const first = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) throw new Error('no `claude` on PATH');
  return first;
}

function versionOf(exe: string): string {
  return execFileSync(exe, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  }).trim();
}

type Binary = {
  label: 'sdk-builtin' | 'path-claude';
  selection: string;
  /** What `--version` is run on. */
  versionExe: string;
  /** What `pathToClaudeCodeExecutable` is set to; undefined = SDK built-in. */
  pathToClaudeCodeExecutable: string | undefined;
};

// ---------------------------------------------------------------------------
// Disk observations
// ---------------------------------------------------------------------------

function sha256(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

type FileObs = { exists: boolean; bytes: number | null };

function observe(file: string): FileObs {
  if (!existsSync(file)) return { exists: false, bytes: null };
  return { exists: true, bytes: statSync(file).size };
}

/** Move one file; falls back to copy+unlink when the rename crosses volumes. */
function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

// ---------------------------------------------------------------------------
// One live turn through `query`
// ---------------------------------------------------------------------------

type SessionIdObs = { type: string; subtype: string | null; session_id: string };

type TurnResult = {
  sessionIds: SessionIdObs[];
  reply: string;
  initClaudeCodeVersion: string | null;
  resultSubtype: string | null;
  error: string | null;
};

async function runTurn(
  bin: Binary,
  cwd: string,
  prompt: string,
  resume: string | undefined,
): Promise<TurnResult> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), TURN_TIMEOUT_MS);
  const options: Options = {
    cwd,
    abortController,
    model: 'haiku',
    maxTurns: 1,
    // No tools: the probe observes session identity and recall, not work.
    tools: [],
    settingSources: [],
    permissionMode: 'default',
    // The option the product's resume uses (src/main/pod/options.ts).
    ...(resume !== undefined ? { resume } : {}),
    ...(bin.pathToClaudeCodeExecutable !== undefined
      ? { pathToClaudeCodeExecutable: bin.pathToClaudeCodeExecutable }
      : {}),
  };

  const sessionIds: SessionIdObs[] = [];
  const assistantText: string[] = [];
  let resultText: string | null = null;
  let resultSubtype: string | null = null;
  let initClaudeCodeVersion: string | null = null;
  let error: string | null = null;

  try {
    for await (const m of query({ prompt, options }) as AsyncIterable<SDKMessage>) {
      const rec = m as unknown as Record<string, unknown>;
      const subtype = typeof rec['subtype'] === 'string' ? (rec['subtype'] as string) : null;
      if (typeof rec['session_id'] === 'string') {
        sessionIds.push({ type: m.type, subtype, session_id: rec['session_id'] as string });
      }
      if (m.type === 'system' && subtype === 'init') {
        const v = rec['claude_code_version'];
        if (typeof v === 'string') initClaudeCodeVersion = v;
      }
      if (m.type === 'assistant') {
        const content = (rec['message'] as { content?: unknown } | undefined)?.content;
        if (Array.isArray(content)) {
          for (const b of content as Array<Record<string, unknown>>) {
            if (b['type'] === 'text' && typeof b['text'] === 'string') assistantText.push(b['text']);
          }
        }
      }
      if (m.type === 'result') {
        resultSubtype = subtype;
        if (typeof rec['result'] === 'string') resultText = rec['result'] as string;
      }
      // Not breaking on `result`: letting the generator finish lets the CLI
      // exit and flush its transcript before the next disk observation.
    }
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    clearTimeout(timer);
  }

  return {
    sessionIds,
    reply: redact(resultText ?? assistantText.join('')),
    initClaudeCodeVersion,
    resultSubtype,
    error: error === null ? null : redact(error),
  };
}

// ---------------------------------------------------------------------------
// The claim set, for one binary
// ---------------------------------------------------------------------------

type Verdict = 'held' | 'refuted';
type Claim = { verdict: Verdict; observed: unknown };

const FORK_PROMPT =
  'What is the exact value I asked you to remember earlier in this conversation? ' +
  'Reply with only that value and nothing else.';

async function runBinary(bin: Binary): Promise<Record<string, unknown>> {
  console.log(`[${bin.label}] version`);
  const cliVersion = versionOf(bin.versionExe);
  const cwd = path.join(SCRATCH, 'fork-session-cwd', bin.label);
  mkdirSync(cwd, { recursive: true });

  const nonce = `nonce-${randomBytes(8).toString('hex')}`;
  const sourcePrompt = `Remember this exact value: ${nonce}. Reply with only the word OK.`;

  const prompts: Array<{ step: string; to: 'source' | 'fork'; text: string }> = [];
  const replies: Array<{ step: string; text: string; resultSubtype: string | null; error: string | null }> = [];
  const forkSessionIds: Array<SessionIdObs & { step: string }> = [];
  const initVersions: Array<{ step: string; claude_code_version: string | null }> = [];

  // ---- source turn ----------------------------------------------------------
  console.log(`[${bin.label}] source turn`);
  prompts.push({ step: 'source', to: 'source', text: sourcePrompt });
  const src = await runTurn(bin, cwd, sourcePrompt, undefined);
  replies.push({ step: 'source', text: src.reply, resultSubtype: src.resultSubtype, error: src.error });
  initVersions.push({ step: 'source', claude_code_version: src.initClaudeCodeVersion });
  const sourceId = src.sessionIds.find((s) => s.type === 'result')?.session_id ?? src.sessionIds[0]?.session_id;
  if (src.error !== null || sourceId === undefined) {
    throw new Error(`[${bin.label}] source turn failed: ${src.error ?? 'no session_id observed'}`);
  }
  const sourceFile = sessionFilePath(CLAUDE_HOME, cwd, sourceId);
  if (!existsSync(sourceFile)) {
    throw new Error(
      `[${bin.label}] source transcript not at sessionFilePath(<claude home>, <cwd>, ${sourceId}); environmental, not a claim`,
    );
  }

  // ---- fork (C1, C2, C3) ----------------------------------------------------
  const shaBeforeFork = sha256(sourceFile);
  console.log(`[${bin.label}] forkSession`);
  const forked = await forkSession(sourceId, { dir: cwd });
  const shaAfterFork = sha256(sourceFile);
  const forkId = forked.sessionId;
  const forkFile = sessionFilePath(CLAUDE_HOME, cwd, forkId);
  const forkAfterFork = observe(forkFile);

  // ---- resumed fork turn (C4, C5, C6) ---------------------------------------
  console.log(`[${bin.label}] fork turn`);
  prompts.push({ step: 'fork', to: 'fork', text: FORK_PROMPT });
  const fk = await runTurn(bin, cwd, FORK_PROMPT, forkId);
  replies.push({ step: 'fork', text: fk.reply, resultSubtype: fk.resultSubtype, error: fk.error });
  initVersions.push({ step: 'fork', claude_code_version: fk.initClaudeCodeVersion });
  for (const s of fk.sessionIds) forkSessionIds.push({ step: 'fork', ...s });
  const shaAfterForkTurn = sha256(sourceFile);
  const forkAfterForkTurn = observe(forkFile);

  // ---- resumed fork turn with the source moved away (C7) --------------------
  const parked = path.join(PARK_DIR, `${sourceId}.jsonl`);
  console.log(`[${bin.label}] fork turn, source parked`);
  moveFile(sourceFile, parked);
  let c7: TurnResult;
  let sourcePresentDuringC7: boolean;
  try {
    sourcePresentDuringC7 = existsSync(sourceFile);
    prompts.push({ step: 'fork-source-moved', to: 'fork', text: FORK_PROMPT });
    c7 = await runTurn(bin, cwd, FORK_PROMPT, forkId);
  } finally {
    // If the CLI recreated a file at the source path while it was parked, the
    // restore below must not clobber it silently.
    if (existsSync(sourceFile)) {
      throw new Error(
        `[${bin.label}] a file appeared at the source path while it was parked; parked copy kept in PROBE_SCRATCH`,
      );
    }
    moveFile(parked, sourceFile);
  }
  replies.push({ step: 'fork-source-moved', text: c7.reply, resultSubtype: c7.resultSubtype, error: c7.error });
  initVersions.push({ step: 'fork-source-moved', claude_code_version: c7.initClaudeCodeVersion });
  for (const s of c7.sessionIds) forkSessionIds.push({ step: 'fork-source-moved', ...s });
  const shaAfterMoveBack = sha256(sourceFile);
  const forkAfterC7Turn = observe(forkFile);

  // ---- verdicts -------------------------------------------------------------
  const v = (b: boolean): Verdict => (b ? 'held' : 'refuted');
  const claims: Record<string, Claim> = {
    C1: { verdict: v(forkId !== sourceId), observed: { sourceSessionId: sourceId, forkSessionId: forkId } },
    C2: { verdict: v(forkAfterFork.exists), observed: forkAfterFork },
    C3: {
      verdict: v(shaBeforeFork !== null && shaBeforeFork === shaAfterFork),
      observed: { beforeFork: shaBeforeFork, afterFork: shaAfterFork },
    },
    C4: {
      verdict: v(fk.error === null && fk.reply.includes(nonce)),
      observed: { reply: fk.reply, error: fk.error },
    },
    C5: {
      verdict: v(shaBeforeFork !== null && shaAfterForkTurn === shaBeforeFork),
      observed: { beforeFork: shaBeforeFork, afterForkTurn: shaAfterForkTurn },
    },
    C6: {
      verdict: v(forkSessionIds.length > 0 && forkSessionIds.every((s) => s.session_id === forkId)),
      observed: {
        distinct: [...new Set(forkSessionIds.map((s) => s.session_id))],
        count: forkSessionIds.length,
      },
    },
    C7: {
      verdict: v(
        !sourcePresentDuringC7 &&
          c7.error === null &&
          c7.reply.includes(nonce) &&
          shaAfterMoveBack === shaBeforeFork,
      ),
      observed: {
        sourcePresentDuringTurn: sourcePresentDuringC7,
        reply: c7.reply,
        error: c7.error,
        sourceSha256AfterMoveBack: shaAfterMoveBack,
        beforeFork: shaBeforeFork,
      },
    },
  };

  return {
    binary: bin.label,
    selection: bin.selection,
    cliVersion,
    initClaudeCodeVersions: initVersions,
    sdkVersion: SDK_VERSION,
    sourceSessionId: sourceId,
    forkSessionId: forkId,
    nonce,
    sourceSha256: {
      beforeFork: shaBeforeFork,
      afterFork: shaAfterFork,
      afterForkTurn: shaAfterForkTurn,
      afterMoveBack: shaAfterMoveBack,
    },
    forkTranscript: {
      afterFork: forkAfterFork,
      afterForkTurn: forkAfterForkTurn,
      afterSourceMovedTurn: forkAfterC7Turn,
    },
    prompts,
    replies,
    forkSessionIdsObserved: forkSessionIds,
    liveTurns: prompts.length,
    claims,
    verdict: Object.values(claims).every((c) => c.verdict === 'held') ? 'held' : 'refuted',
  };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const builtin = builtinExecutable();
  const onPath = pathClaude();
  const binaries: Binary[] = [
    {
      label: 'sdk-builtin',
      selection:
        "SDK built-in executable (no pathToClaudeCodeExecutable), the platform package's claude binary",
      versionExe: builtin,
      pathToClaudeCodeExecutable: undefined,
    },
    {
      label: 'path-claude',
      selection: 'the `claude` on PATH, passed as pathToClaudeCodeExecutable',
      versionExe: onPath,
      pathToClaudeCodeExecutable: onPath,
    },
  ];

  const runs: Array<Record<string, unknown>> = [];
  for (const bin of binaries) runs.push(await runBinary(bin));

  const evidence = {
    generatedBy: 'probe/verify-fork-session.ts',
    generatedAt: new Date().toISOString(),
    command: 'node probe/verify-fork-session.ts',
    sdkVersion: SDK_VERSION,
    transcriptPathRule: 'sessionFilePath(<claude home>, <cwd>, <session id>) from src/main/pod-session/paths.ts',
    totalLiveTurns: runs.reduce((n, r) => n + (r['liveTurns'] as number), 0),
    overallVerdict: runs.every((r) => r['verdict'] === 'held') ? 'held' : 'refuted',
    runs,
  };

  const text = redact(JSON.stringify(evidence, null, 2)) + '\n';
  // Belt and braces: the redaction must have removed every home spelling.
  for (const [re] of PATH_SUBS.slice(2)) {
    re.lastIndex = 0;
    if (re.test(text)) throw new Error('home directory path survived redaction; evidence not written');
  }
  writeFileSync(EVIDENCE_FILE, text, 'utf8');
  console.log(text);
}

await main();
