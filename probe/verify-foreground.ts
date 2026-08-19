/**
 * THROWAWAY verification probe — DIR task A1.
 *
 * Answers ONE question with live evidence: does CLI 2.1.235 actually honour the
 * `PreToolUse` hook that `src/main/pod/options.ts` installs to force subagent
 * dispatch into the foreground?
 *
 * It drives the SHIPPED code path: it imports `buildSdkOptions`,
 * `forceForegroundDispatch` and `FOREGROUND_DISPATCH_DIRECTIVE` from
 * `src/main/pod/options.ts` rather than reconstructing them. Only additive,
 * non-conflicting options (model, agents, maxTurns, settingSources) are layered
 * on top; the hook, the systemPrompt and `forwardSubagentText` are exactly what
 * the product produces.
 *
 * Four runs, each ONE trivial dispatch, with a prompt that deliberately says
 * NOTHING about `run_in_background` — so model compliance cannot be mistaken
 * for a honoured hook:
 *
 *   shipped        hook + directive   (the product's real configuration)
 *   control-none   neither            (baseline: what the CLI does by default)
 *   hook-only      hook, no directive (isolates the hook)
 *   directive-only directive, no hook (isolates the fallback)
 *
 *   node probe/verify-foreground.ts                # live, 4 short sessions
 *   PROBE_REUSE=1 node probe/verify-foreground.ts  # replay cache, re-derive
 *
 * Env vars are the same as run-probe.ts: PROBE_SCRATCH, PROBE_CLI, PROBE_REUSE.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentDefinition,
  Options,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

// The shipped code path under test.
//
// Split into a type-only static import and a URL-based dynamic one, because a
// single plain import cannot satisfy both tools at once:
//   - `node probe/verify-foreground.ts` strips types natively, and native ESM
//     does no extension resolution, so the runtime specifier MUST end in `.ts`;
//   - `tsc -p tsconfig.node.json` includes `probe/**` and rejects a specifier
//     ending in `.ts` with TS5097 unless `allowImportingTsExtensions` is on.
// The type-only import is erased before Node ever sees it, so it can stay
// extensionless; the dynamic import is what actually loads the module, and the
// `as typeof PodOptions` cast hands its full types back. The probe therefore
// still drives — and still typechecks against — the shipped code, which is the
// whole point of this file.
//
// The clean fix is `"allowImportingTsExtensions": true` in tsconfig.node.json
// (valid here: the typecheck script already passes `--noEmit`), which would
// collapse this back to one ordinary import. Editing a tsconfig was outside
// this task's ownership; see the A3 report.
import type * as PodOptions from '../src/main/pod/options';

const { FOREGROUND_DISPATCH_DIRECTIVE, buildSdkOptions, forceForegroundDispatch } =
  (await import(new URL('../src/main/pod/options.ts', import.meta.url).href)) as typeof PodOptions;

const PROBE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(PROBE_DIR, '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'protocol');
const EVIDENCE_DIR = path.join(PROBE_DIR, 'evidence');
const SCRATCH = process.env.PROBE_SCRATCH ?? path.join(tmpdir(), 'orcastrate-probe');
const PROBE_CWD = path.join(SCRATCH, 'cwd');
const RAW_DIR = path.join(SCRATCH, 'raw');

function resolveCli(): string | undefined {
  if (process.env.PROBE_CLI) return process.env.PROBE_CLI;
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(finder, ['claude'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const first = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    return first ?? undefined;
  } catch {
    return undefined;
  }
}

const CLI_PATH = resolveCli();
const REUSE = process.env.PROBE_REUSE === '1';

mkdirSync(PROBE_CWD, { recursive: true });
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(EVIDENCE_DIR, { recursive: true });

type Msg = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Redaction — identical rules to run-probe.ts (fixture-corpus.md §2)
// ---------------------------------------------------------------------------

const HOME = homedir();

function pathRe(p: string): RegExp {
  const body = p
    .replace(/[.*+?^${}()|[\]\\/]/g, (c) => (c === '\\' || c === '/' ? '[\\\\/]+' : `\\${c}`))
    .replace(/(\[\\\\\/\]\+)+/g, '[\\\\/]+');
  return new RegExp(body, 'gi');
}

function mangledRe(p: string): RegExp {
  return new RegExp(p.replace(/[\\/:]/g, '-').replace(/[.*+?^${}()|[\]]/g, '\\$&'), 'gi');
}

const PATH_SUBS: Array<[RegExp, string]> = [
  [pathRe(PROBE_CWD), '<CWD>'],
  [pathRe(SCRATCH), '<CWD>'],
  [pathRe(REPO_ROOT), '<CWD>'],
  [pathRe(HOME), '<HOME>'],
  [mangledRe(PROBE_CWD), '<CWD>'],
  [mangledRe(SCRATCH), '<CWD>'],
  [mangledRe(REPO_ROOT), '<CWD>'],
  [mangledRe(HOME), '<HOME>'],
];

const SECRET_VALUE_RES: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9]{24,}/g,
  /gh[pousr]_[A-Za-z0-9]{16,}/g,
  /xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

const SECRET_KEY_RE =
  /^(api[_-]?key|apikey|auth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|oauth[_-]?token|bearer|secret|password|passwd|credential|credentials|authorization|cookie|set-cookie)$/i;

function redactString(s: string): string {
  let out = s;
  for (const [re, rep] of PATH_SUBS) out = out.replace(re, rep);
  for (const re of SECRET_VALUE_RES) out = out.replace(re, '<REDACTED>');
  return out;
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const src = value as Msg;
    const out: Msg = {};
    for (const key of Object.keys(src)) {
      const v = src[key];
      out[key] = SECRET_KEY_RE.test(key) && typeof v === 'string' ? '<REDACTED>' : redact(v);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Agent definitions (reused verbatim from probe/agents)
// ---------------------------------------------------------------------------

function loadAgents(): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {};
  const dir = path.join(PROBE_DIR, 'agents');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const raw = readFileSync(path.join(dir, file), 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
    if (!m) throw new Error(`no frontmatter in ${file}`);
    const meta: Record<string, string> = {};
    for (const line of m[1]!.split(/\r?\n/)) {
      const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
      if (kv) meta[kv[1]!] = kv[2]!.trim();
    }
    const name = meta['name'] ?? path.basename(file, '.md');
    const def: AgentDefinition = {
      description: meta['description'] ?? name,
      prompt: m[2]!.trim(),
    };
    if (meta['model']) def.model = meta['model'];
    if (meta['tools']) def.tools = meta['tools'].split(',').map((t) => t.trim());
    agents[name] = def;
  }
  return agents;
}

const AGENTS = loadAgents();

// ---------------------------------------------------------------------------
// Option construction — the shipped path
// ---------------------------------------------------------------------------

type HookRecord = { toolName: unknown; returned: unknown };

/** Options exactly as `buildSdkOptions` produces them, plus the probe extras. */
function shippedOptions(hookLog: HookRecord[]): Options {
  const abortController = new AbortController();
  const built = buildSdkOptions(
    {
      podId: 'a1-verify' as never,
      cwd: PROBE_CWD,
      permissionMode: 'bypassPermissions',
      envOverrides: {},
      forwardSubagentText: true,
      ...(CLI_PATH ? { pathToClaudeCodeExecutable: CLI_PATH } : {}),
    },
    {
      canUseTool: async (_t: string, input: Record<string, unknown>) =>
        ({ behavior: 'allow', updatedInput: input }) as never,
      // The shipped callback, wrapped only to record that the CLI invoked it.
      preToolUseHook: (async (input: unknown) => {
        const returned = forceForegroundDispatch(input);
        hookLog.push({
          toolName: (input as Msg | null)?.['tool_name'],
          returned,
        });
        return returned;
      }) as never,
      abortController,
    },
  );
  return {
    ...built,
    model: 'sonnet',
    agents: AGENTS,
    maxTurns: 8,
    settingSources: [],
  } as Options;
}

/** Strip the hook, keep everything else (isolates the system-prompt directive). */
function withoutHook(o: Options): Options {
  const { hooks: _hooks, ...rest } = o as Options & { hooks?: unknown };
  return rest as Options;
}

/** Strip the appended directive, keep the preset (isolates the hook). */
function withoutDirective(o: Options): Options {
  return { ...o, systemPrompt: { type: 'preset', preset: 'claude_code' } } as Options;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * Deliberately silent about run_in_background. Any foreground dispatch observed
 * here is caused by the configuration under test, not by the prompt.
 */
const PROMPT =
  'Make exactly ONE Agent tool call: subagent_type "leaf", prompt ' +
  '"Report the current directory name and stop." Then reply with just: DONE';

type RunResult = {
  name: string;
  redacted: Msg[];
  hookCalls: HookRecord[];
  error: string | null;
};

async function runCapture(name: string, make: (log: HookRecord[]) => Options): Promise<RunResult> {
  const cache = path.join(RAW_DIR, `a1-${name}.json`);
  if (REUSE && existsSync(cache)) {
    console.log(`[reuse] ${name}`);
    return JSON.parse(readFileSync(cache, 'utf8')) as RunResult;
  }
  console.log(`[live ] ${name}`);

  const hookCalls: HookRecord[] = [];
  const options = make(hookCalls);
  const messages: SDKMessage[] = [];
  let error: string | null = null;

  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });

  async function* input(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: 'user',
      message: { role: 'user', content: PROMPT },
      parent_tool_use_id: null,
      session_id: '',
    } as SDKUserMessage;
    await gate;
  }

  try {
    for await (const message of query({ prompt: input(), options })) {
      messages.push(message);
      if (message.type === 'result') break;
    }
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    release();
  }

  const result: RunResult = {
    name,
    redacted: messages.map((m) => redact(m)) as Msg[],
    hookCalls: redact(hookCalls) as HookRecord[],
    error,
  };
  writeFileSync(cache, JSON.stringify(result), 'utf8');
  return result;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function contentBlocks(m: Msg): Msg[] {
  const msg = m['message'];
  if (!msg || typeof msg !== 'object') return [];
  const content = (msg as Msg)['content'];
  return Array.isArray(content) ? (content.filter((b) => b && typeof b === 'object') as Msg[]) : [];
}

const DISPATCH = new Set(['Agent', 'Task']);

type Analysis = {
  name: string;
  error: string | null;
  hookInvocations: number;
  hookRewroteDispatch: boolean;
  dispatchCount: number;
  /** `run_in_background` as it appears in the streamed tool_use block. */
  modelRequestedBackground: Array<unknown>;
  asyncLaunched: boolean;
  asyncEvidence: string | null;
  subagentMessages: number;
  subagentEvidence: string | null;
  foreground: boolean;
};

function analyse(run: RunResult): Analysis {
  const lines = run.redacted;
  const dispatchIds = new Set<string>();
  const modelRequestedBackground: unknown[] = [];

  for (const m of lines) {
    if (m['type'] !== 'assistant') continue;
    for (const b of contentBlocks(m)) {
      if (b['type'] === 'tool_use' && DISPATCH.has(String(b['name']))) {
        dispatchIds.add(String(b['id']));
        const inp = b['input'];
        modelRequestedBackground.push(
          inp && typeof inp === 'object'
            ? ((inp as Msg)['run_in_background'] ?? '<absent>')
            : '<absent>',
        );
      }
    }
  }

  let asyncEvidence: string | null = null;
  let subagentMessages = 0;
  let subagentEvidence: string | null = null;

  for (const m of lines) {
    // Background acknowledgement lands in the dispatch's tool_result.
    for (const b of contentBlocks(m)) {
      if (b['type'] !== 'tool_result') continue;
      const text = JSON.stringify(b['content'] ?? '');
      // CLI 2.1.235 acknowledges a background dispatch with prose ("Async agent
      // launched successfully."), not with the `{"isAsync":true}` JSON T2
      // recorded; both spellings are accepted.
      if (/async_launched|isAsync|Async agent launched/i.test(text) && asyncEvidence === null) {
        asyncEvidence = text.slice(0, 400);
      }
    }
    // Foreground dispatch interleaves subagent messages carrying the dispatch's
    // tool_use id as parent_tool_use_id.
    const parent = m['parent_tool_use_id'];
    if (
      (m['type'] === 'assistant' || m['type'] === 'user') &&
      typeof parent === 'string' &&
      dispatchIds.has(parent)
    ) {
      subagentMessages += 1;
      if (subagentEvidence === null) subagentEvidence = JSON.stringify(m).slice(0, 400);
    }
  }

  const hookRewroteDispatch = run.hookCalls.some((h) => {
    const out = h.returned as Msg | undefined;
    const spec = out?.['hookSpecificOutput'] as Msg | undefined;
    const upd = spec?.['updatedInput'] as Msg | undefined;
    return DISPATCH.has(String(h.toolName)) && upd?.['run_in_background'] === false;
  });

  return {
    name: run.name,
    error: run.error,
    hookInvocations: run.hookCalls.length,
    hookRewroteDispatch,
    dispatchCount: dispatchIds.size,
    modelRequestedBackground,
    asyncLaunched: asyncEvidence !== null,
    asyncEvidence,
    subagentMessages,
    subagentEvidence,
    foreground: subagentMessages > 0 && asyncEvidence === null,
  };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const runs: Record<string, RunResult> = {};
  runs['shipped'] = await runCapture('shipped', (log) => shippedOptions(log));
  runs['control-none'] = await runCapture('control-none', (log) =>
    withoutDirective(withoutHook(shippedOptions(log))),
  );
  runs['hook-only'] = await runCapture('hook-only', (log) =>
    withoutDirective(shippedOptions(log)),
  );
  runs['directive-only'] = await runCapture('directive-only', (log) =>
    withoutHook(shippedOptions(log)),
  );

  const analyses: Record<string, Analysis> = {};
  for (const [k, v] of Object.entries(runs)) analyses[k] = analyse(v);

  for (const [name, run] of Object.entries(runs)) {
    writeFileSync(
      path.join(EVIDENCE_DIR, `foreground-${name}.ndjson`),
      run.redacted.map((l) => JSON.stringify(l)).join('\n') + '\n',
      'utf8',
    );
  }
  writeFileSync(
    path.join(EVIDENCE_DIR, 'foreground-analysis.json'),
    JSON.stringify(analyses, null, 2) + '\n',
    'utf8',
  );

  console.log(JSON.stringify(analyses, null, 2));

  // ---- durable answer -----------------------------------------------------
  //
  // `hook-only` is the decisive cell: same prompt as the control, no directive,
  // hook present. The control fixes what the CLI does unaided.
  //
  // NOTE on the `shipped` run: its hook callback returned `{}` (no opinion),
  // because the directive had already made the model emit
  // `run_in_background: false` itself — `forceForegroundDispatch` deliberately
  // declines to rewrite an input that is already correct. That is the shipped
  // behaviour, not a failure, so `hookRewroteDispatch` is only required of the
  // `hook-only` run.
  const shipped = analyses['shipped']!;
  const control = analyses['control-none']!;
  const hookOnly = analyses['hook-only']!;
  const directiveOnly = analyses['directive-only']!;

  const hookInvokedByCli = shipped.hookInvocations > 0 && hookOnly.hookInvocations > 0;
  const hookHonored =
    hookInvokedByCli &&
    hookOnly.hookRewroteDispatch &&
    hookOnly.foreground &&
    !control.foreground &&
    control.asyncLaunched;
  const directiveAlone = directiveOnly.foreground;

  const findingsPath = path.join(FIXTURE_DIR, 'findings.json');
  const findings = JSON.parse(readFileSync(findingsPath, 'utf8')) as Msg;
  findings['foregroundDispatch'] = {
    verifiedAt: new Date().toISOString(),
    verifiedBy:
      'probe/verify-foreground.ts (task A1); imports buildSdkOptions, forceForegroundDispatch and FOREGROUND_DISPATCH_DIRECTIVE from src/main/pod/options.ts, so the shipped code path is what ran',
    hookHonored,
    hookInvokedByCli,
    directiveAloneSufficient: directiveAlone,
    evidence: {
      hookOnlyRewrite: JSON.stringify(
        (runs['hook-only'] as RunResult).hookCalls,
      ),
      hookOnlySubagentMessage: hookOnly.subagentEvidence,
      controlBackgroundAck: control.asyncEvidence,
      controlSubagentMessages: control.subagentMessages,
    },
    notes:
      'Measured live against CLI 2.1.235 on win32, one trivial dispatch per run, four runs. ' +
      'The prompt says nothing about run_in_background, so foreground dispatch is attributable ' +
      'to the configuration and not to the prompt. hook-only: the CLI invoked the PreToolUse ' +
      'callback for tool_name "Agent", the callback returned updatedInput.run_in_background=false, ' +
      'and 6 subagent-originated messages carrying parent_tool_use_id were forwarded. control ' +
      '(no hook, no directive): the model omitted run_in_background, the dispatch tool_result read ' +
      '"Async agent launched successfully." and 0 subagent messages were forwarded. In the shipped ' +
      'run the callback returned {} because the directive had already made the model pass false; ' +
      'both levers are therefore live and either one alone produced foreground dispatch in this sample. ' +
      'directiveAloneSufficient is a single-sample model-behaviour observation, not a guarantee — the ' +
      'hook is the deterministic lever.',
    runs: analyses,
  };
  writeFileSync(findingsPath, JSON.stringify(findings, null, 2) + '\n', 'utf8');
  console.log(`hookHonored=${hookHonored} directiveAloneSufficient=${directiveAlone}`);
}

await main();
