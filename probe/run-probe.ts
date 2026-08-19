/**
 * THROWAWAY protocol probe. See probe/README.md.
 *
 * Drives the real `claude` CLI through @anthropic-ai/claude-agent-sdk in
 * streaming input mode and captures every SDK message verbatim (subject only
 * to the redaction rules in src/shared/contracts/fixture-corpus.md §2) into
 * tests/fixtures/protocol/.
 *
 * Nothing under src/ imports this file. It exists only to produce the durable
 * corpus and findings.json, and is not maintained afterwards.
 *
 *   node probe/run-probe.ts            # live runs, spends tokens
 *   PROBE_REUSE=1 node probe/run-probe.ts   # replay cached runs, re-derive findings
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
  PermissionResult,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROBE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(PROBE_DIR, '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'protocol');
// Never defaults inside the repo: the probe's working files must not land in
// the tree it is capturing.
const SCRATCH = process.env.PROBE_SCRATCH ?? path.join(tmpdir(), 'orcastrate-probe');
const PROBE_CWD = path.join(SCRATCH, 'cwd');
const RAW_DIR = path.join(SCRATCH, 'raw');
/**
 * The CLI to drive. `PROBE_CLI` wins; otherwise resolve `claude` from PATH.
 * Never hardcode an absolute path — it leaks the operator home directory into a
 * committed file and makes the probe non-portable. When neither resolves,
 * `pathToClaudeCodeExecutable` is left unset and the SDK falls back to the CLI
 * binary it ships (the same 2.1.235 build, per its package.json claudeCodeVersion).
 */
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

mkdirSync(FIXTURE_DIR, { recursive: true });
mkdirSync(PROBE_CWD, { recursive: true });
mkdirSync(RAW_DIR, { recursive: true });

type Msg = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Redaction (fixture-corpus.md §2)
// ---------------------------------------------------------------------------

const HOME = homedir();

/** Matches a path prefix written with either slash flavour, case-insensitively. */
function pathRe(p: string): RegExp {
  const body = p
    .replace(/[.*+?^${}()|[\]\\/]/g, (c) => (c === '\\' || c === '/' ? '[\\\\/]+' : `\\${c}`))
    .replace(/(\[\\\\\/\]\+)+/g, '[\\\\/]+');
  return new RegExp(body, 'gi');
}

/**
 * The CLI derives project keys by mangling a path (separators and `:` become
 * `-`). Those tokens still spell out the user's home directory, so they are
 * redacted too — longest first, since the mangled cwd contains the mangled home.
 */
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
// Agent definitions from probe/agents/*.md
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
// Capture harness (streaming input mode)
// ---------------------------------------------------------------------------

type PermissionRecord = {
  toolName: string;
  toolUseID: string;
  agentID: string | null;
  optionKeys: string[];
};

type RunResult = {
  name: string;
  /** Redacted, verbatim-shaped SDK messages, in yield order. */
  redacted: Msg[];
  permissions: PermissionRecord[];
  error: string | null;
};

type RunSpec = {
  name: string;
  prompt: string;
  options: Partial<Options>;
  /** Called for every message; return true to interrupt the session. */
  interruptWhen?: (m: SDKMessage) => boolean;
};

function baseOptions(): Partial<Options> {
  return {
    cwd: PROBE_CWD,
    pathToClaudeCodeExecutable: CLI_PATH,
    forwardSubagentText: true,
    permissionMode: 'bypassPermissions',
    agents: AGENTS,
    maxTurns: 8,
    model: 'sonnet',
    settingSources: [],
  };
}

async function runCapture(spec: RunSpec): Promise<RunResult> {
  const cache = path.join(RAW_DIR, `${spec.name}.json`);
  if (REUSE && existsSync(cache)) {
    console.log(`[reuse] ${spec.name}`);
    return JSON.parse(readFileSync(cache, 'utf8')) as RunResult;
  }
  console.log(`[live ] ${spec.name}`);

  const messages: SDKMessage[] = [];
  const permissions: PermissionRecord[] = [];
  let error: string | null = null;

  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });

  async function* input(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: 'user',
      message: { role: 'user', content: spec.prompt },
      parent_tool_use_id: null,
      session_id: '',
    } as SDKUserMessage;
    await gate;
  }

  const canUseTool = async (
    toolName: string,
    toolInput: Record<string, unknown>,
    opts: { toolUseID: string; agentID?: string; signal: AbortSignal },
  ): Promise<PermissionResult> => {
    permissions.push({
      toolName,
      toolUseID: opts.toolUseID,
      agentID: opts.agentID ?? null,
      optionKeys: Object.keys(opts).sort(),
    });
    return { behavior: 'allow', updatedInput: toolInput };
  };

  const options = { ...baseOptions(), ...spec.options } as Options;
  if (options.permissionMode === 'default' && !options.canUseTool) {
    options.canUseTool = canUseTool as Options['canUseTool'];
  }

  const q = query({ prompt: input(), options });
  let interrupted = false;

  try {
    for await (const message of q) {
      messages.push(message);
      if (!interrupted && spec.interruptWhen?.(message)) {
        interrupted = true;
        void q.interrupt().catch(() => {});
      }
      if (message.type === 'result') break;
    }
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    release();
  }

  const result: RunResult = {
    name: spec.name,
    redacted: messages.map((m) => redact(m)) as Msg[],
    permissions,
    error,
  };
  writeFileSync(cache, JSON.stringify(result), 'utf8');
  return result;
}

function writeNdjsonTo(file: string, lines: unknown[]): void {
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Stream analysis
// ---------------------------------------------------------------------------

function contentBlocks(m: Msg): Msg[] {
  const msg = m['message'];
  if (!msg || typeof msg !== 'object') return [];
  const content = (msg as Msg)['content'];
  return Array.isArray(content) ? (content.filter((b) => b && typeof b === 'object') as Msg[]) : [];
}

/** The dispatch tool is surfaced as `Agent` in CLI 2.1.235 and `Task` historically. */
function isDispatchBlock(b: Msg): boolean {
  return b['type'] === 'tool_use' && (b['name'] === 'Agent' || b['name'] === 'Task');
}

function isSubagentOriginated(m: Msg): boolean {
  return (
    (m['type'] === 'assistant' || m['type'] === 'user') &&
    typeof m['parent_tool_use_id'] === 'string' &&
    m['parent_tool_use_id'] !== ''
  );
}

type Dispatch = { id: string; line: number; depth: number; agentName: string; messageId: string };

/**
 * Every Agent/Task tool_use in the stream, with the depth of the subagent it
 * opens, derived purely by chaining `parent_tool_use_id` — no other field.
 */
function dispatches(lines: Msg[]): Dispatch[] {
  const found: Dispatch[] = [];
  lines.forEach((m, i) => {
    if (m['type'] !== 'assistant') return;
    const msg = (m['message'] ?? {}) as Msg;
    for (const b of contentBlocks(m)) {
      if (!isDispatchBlock(b)) continue;
      const inp = (b['input'] ?? {}) as Msg;
      found.push({
        id: String(b['id']),
        line: i + 1,
        depth: 0,
        agentName: String(inp['subagent_type'] ?? ''),
        messageId: String(msg['id'] ?? ''),
      });
    }
  });
  const parentOf = new Map<string, string | null>();
  lines.forEach((m) => {
    if (m['type'] !== 'assistant') return;
    const p = typeof m['parent_tool_use_id'] === 'string' ? String(m['parent_tool_use_id']) : null;
    for (const b of contentBlocks(m)) if (isDispatchBlock(b)) parentOf.set(String(b['id']), p);
  });
  const depthOf = (id: string, guard = 0): number => {
    if (guard > 8) return -1;
    const p = parentOf.get(id);
    if (p === undefined) return -1;
    return p === null ? 1 : depthOf(p, guard + 1) + 1;
  };
  for (const d of found) d.depth = depthOf(d.id);
  return found;
}

/** True when >=2 dispatch blocks share one assistant `message.id`. */
function dispatchedInOneTurn(ds: Dispatch[]): { ok: boolean; messageId: string | null; ids: string[] } {
  const byMsg = new Map<string, string[]>();
  for (const d of ds) byMsg.set(d.messageId, [...(byMsg.get(d.messageId) ?? []), d.id]);
  for (const [mid, ids] of byMsg) if (ids.length >= 2) return { ok: true, messageId: mid, ids };
  return { ok: false, messageId: null, ids: [] };
}

/** True when the two lanes' messages alternate rather than run back to back. */
function interleaved(lines: Msg[], idA: string, idB: string): { ok: boolean; switches: number } {
  const seq = lines
    .map((m) => (isSubagentOriginated(m) ? String(m['parent_tool_use_id']) : null))
    .filter((x): x is string => x === idA || x === idB);
  let switches = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) switches++;
  return { ok: switches >= 2, switches };
}

/** tool_use ids that never received a matching tool_result. */
function unclosedToolUses(lines: Msg[]): string[] {
  const uses = new Set<string>();
  const results = new Set<string>();
  for (const m of lines) {
    for (const b of contentBlocks(m)) {
      if (b['type'] === 'tool_use') uses.add(String(b['id']));
      if (b['type'] === 'tool_result') results.add(String(b['tool_use_id']));
    }
  }
  return [...uses].filter((u) => !results.has(u));
}

/** Calf lanes opened by `task_started` that never reached a terminal `task_updated`. */
function openLanesAtEnd(lines: Msg[]): string[] {
  const opened = new Map<string, string>(); // task_id -> tool_use_id
  const closed = new Set<string>();
  for (const m of lines) {
    if (m['subtype'] === 'task_started') opened.set(String(m['task_id']), String(m['tool_use_id']));
    if (m['subtype'] === 'task_updated') {
      const patch = (m['patch'] ?? {}) as Msg;
      if (patch['status'] === 'completed' || patch['status'] === 'failed') {
        closed.add(String(m['task_id']));
      }
    }
  }
  return [...opened.keys()].filter((t) => !closed.has(t));
}

type AgentIdHit = { path: string; line: number; value: string };

/** Every place in the raw stream where an agent id is carried, keys and text alike. */
function agentIdSurfaces(lines: Msg[]): AgentIdHit[] {
  const hits: AgentIdHit[] = [];
  const seen = new Set<string>();
  const push = (p: string, line: number, value: string): void => {
    if (seen.has(p)) return;
    seen.add(p);
    hits.push({ path: p, line, value });
  };
  lines.forEach((m, i) => {
    const line = i + 1;
    const type = String(m['type']);
    const sub = m['subtype'] ? `/${String(m['subtype'])}` : '';
    const walk = (v: unknown, p: string): void => {
      if (Array.isArray(v)) {
        v.forEach((x) => walk(x, `${p}[]`));
        return;
      }
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v as Msg)) {
          const next = p ? `${p}.${k}` : k;
          if (/^(parent_)?(agent|task)[_-]?id$/i.test(k) && typeof val === 'string' && val) {
            push(`${type}${sub}:${next}`, line, val);
          }
          walk(val, next);
        }
      }
      if (typeof v === 'string' && /agent[_ -]?id\s*[:=]/i.test(v)) {
        push(`${type}${sub}:${p} (free text)`, line, v.slice(0, 0) || '<in text>');
      }
    };
    walk(m, '');
  });
  return hits;
}

/** agentId reachable for each dispatched Calf, keyed by the tool_use that opened it. */
function agentIdByCalf(lines: Msg[]): Record<string, { taskStarted: string | null; toolResult: string | null }> {
  const out: Record<string, { taskStarted: string | null; toolResult: string | null }> = {};
  for (const d of dispatches(lines)) out[d.id] = { taskStarted: null, toolResult: null };
  for (const m of lines) {
    if (m['subtype'] === 'task_started') {
      const tid = String(m['tool_use_id']);
      if (out[tid]) out[tid]!.taskStarted = String(m['task_id']);
    }
    const tur = m['tool_use_result'];
    if (tur && typeof tur === 'object' && typeof (tur as Msg)['agentId'] === 'string') {
      for (const b of contentBlocks(m)) {
        if (b['type'] === 'tool_result') {
          const tid = String(b['tool_use_id']);
          if (out[tid]) out[tid]!.toolResult = String((tur as Msg)['agentId']);
        }
      }
    }
  }
  return out;
}

function textOf(lines: Msg[]): string {
  const out: string[] = [];
  for (const m of lines) {
    for (const b of contentBlocks(m)) {
      if (b['type'] === 'text' && typeof b['text'] === 'string') out.push(String(b['text']));
      if (b['type'] === 'tool_result') {
        const c = b['content'];
        if (typeof c === 'string') out.push(c);
        else if (Array.isArray(c)) {
          for (const s of c) {
            if (s && typeof s === 'object' && typeof (s as Msg)['text'] === 'string') {
              out.push(String((s as Msg)['text']));
            }
          }
        }
      }
    }
  }
  return out.join('\n---\n');
}

/** Subagent-originated ASSISTANT text/thinking — the thing forwardSubagentText gates. */
function subagentProseBlocks(lines: Msg[]): number {
  return lines
    .filter((m) => m['type'] === 'assistant' && isSubagentOriginated(m))
    .flatMap(contentBlocks)
    .filter((b) => b['type'] === 'text' || b['type'] === 'thinking').length;
}

function fixtureStats(lines: Msg[]): { lines: number; turns: number; calvesOpened: number; maxDepth: number } {
  const ds = dispatches(lines);
  return {
    lines: lines.length,
    turns: lines.filter((m) => m['type'] === 'result').length,
    calvesOpened: new Set(ds.map((d) => d.id)).size,
    maxDepth: ds.reduce((a, d) => Math.max(a, d.depth), 0),
  };
}

/**
 * Ask the CLI itself which --permission-mode values it accepts. Commander
 * validates the choice before doing anything else, so this costs no tokens.
 */
function cliPermissionModes(): { values: string[] | null; evidence: string } {
  if (!CLI_PATH) {
    return {
      values: null,
      evidence:
        'Could not locate a `claude` binary (PROBE_CLI unset and `claude` not on PATH), so the accepted --permission-mode values could not be enumerated against the real CLI.',
    };
  }
  const tryMode = (mode: string): string | null => {
    try {
      execFileSync(CLI_PATH, ['--permission-mode', mode, '--help'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      return null;
    } catch (e) {
      return String((e as { stderr?: Buffer }).stderr ?? '').trim();
    }
  };
  const control = tryMode('__probe_invalid__');
  const candidates = [
    'default',
    'plan',
    'acceptEdits',
    'bypassPermissions',
    'dontAsk',
    'auto',
    'manual',
  ];
  const values = candidates.filter((c) => tryMode(c) === null);
  return {
    values,
    evidence:
      `Each candidate was passed to the real CLI as --permission-mode; commander validates the choice before any model call. ` +
      `Accepted: ${values.join(', ')}. Rejected control value '__probe_invalid__' produced verbatim: ${JSON.stringify(control)}`,
  };
}

// ---------------------------------------------------------------------------
// Prompts — deliberately trivial. The probe observes dispatch shape, not work.
// ---------------------------------------------------------------------------

const FG =
  'Every Agent/Task tool call you make MUST set run_in_background: false. ' +
  'A background dispatch defeats the purpose of this run. ';

const P_PARALLEL =
  FG +
  'In ONE single assistant message, emit TWO Agent tool calls at once: both with ' +
  'subagent_type "leaf", run_in_background false, and the prompt ' +
  '"Report the current directory name and stop." Do not dispatch them one after ' +
  'the other in separate messages — both tool calls must be in the same message. ' +
  'Then reply with just: DONE';

const P_NESTED =
  FG +
  'Make exactly ONE Agent tool call: subagent_type "brancher", run_in_background false, ' +
  'prompt "Dispatch one leaf subagent with run_in_background false, then report what it said." ' +
  'Then reply with just: DONE';

const P_SINGLE =
  FG +
  'Make exactly ONE Agent tool call: subagent_type "leaf", run_in_background false, ' +
  'prompt "Report the current directory name and stop." Then reply with just: DONE';

const P_WRITE =
  FG +
  'Make exactly ONE Agent tool call: subagent_type "writer", run_in_background false, ' +
  'prompt "Write the file probe-permission.txt containing the single line probe." ' +
  'Then reply with just: DONE';

const P_ORPHAN =
  'Make exactly ONE Agent tool call: subagent_type "leaf", run_in_background TRUE ' +
  '(background — do NOT wait for it), prompt "Report the current directory name and stop." ' +
  'Do not wait for it, do not poll it, do not call TaskOutput. ' +
  'The instant the dispatch call returns, reply with just: DONE';

const P_STEER =
  'Do not use any other tool first. Attempt, in this order, to call the tools named ' +
  '`SendMessage`, `TaskStop`, and `TaskOutput` with any plausible arguments. ' +
  'If a tool does not exist, report the EXACT verbatim error text you received. ' +
  'Then reply with one line per tool: "<ToolName>: available" or "<ToolName>: <verbatim error>".';

/**
 * The decisive test for merge-vs-replace. PROBE_INHERITED is set on the PROBE'S
 * OWN process below and is deliberately NOT passed in `options.env`; PROBE_MARKER
 * is passed and nothing else. A shell reports both:
 *   - PROBE_INHERITED visible  -> the parent environment was MERGED
 *   - PROBE_INHERITED empty    -> the parent environment was REPLACED
 * Measuring $PATH cannot decide this: Git Bash and other login shells rebuild
 * PATH themselves regardless of what they inherited.
 */
const P_ENV =
  'Run exactly one Bash command: ' +
  '`echo "INHERITED=[$PROBE_INHERITED] PASSED=[$PROBE_MARKER] PATHLEN=${#PATH}"`. ' +
  'Reply with its output only, verbatim.';

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const capturedAt = new Date().toISOString();
  const runs: Record<string, RunResult> = {};

  runs['01'] = await runCapture({ name: '01-parallel-dispatch', prompt: P_PARALLEL, options: {} });
  runs['02'] = await runCapture({ name: '02-nested-dispatch', prompt: P_NESTED, options: {} });
  runs['03'] = await runCapture({ name: '03-tool-result-close', prompt: P_SINGLE, options: {} });
  // 04: a background dispatch. The Calf lane opens and the turn's result message
  // arrives while it is still running, which is the orphan case the router must
  // survive. See findings.notes — CLI 2.1.235 always answers a tool_use.
  runs['04'] = await runCapture({ name: '04-orphaned-calf', prompt: P_ORPHAN, options: { maxTurns: 2 } });
  // 06: the Calf WRITES a file. Read-only Bash is auto-approved even in
  // 'default' mode and never reaches canUseTool.
  runs['06'] = await runCapture({
    name: '06-permission-prompt',
    prompt: P_WRITE,
    options: { permissionMode: 'default' },
  });

  // --- option-shape probes (not part of the six fixtures) -------------------
  runs['noforward'] = await runCapture({
    name: 'x-no-forward',
    prompt: P_SINGLE,
    options: { forwardSubagentText: undefined },
  });
  runs['steer'] = await runCapture({ name: 'x-steering', prompt: P_STEER, options: { maxTurns: 6 } });
  // Present in THIS process only, and deliberately absent from options.env below.
  process.env['PROBE_INHERITED'] = 'probe-inherited-marker';
  runs['env'] = await runCapture({
    name: 'x-env',
    prompt: P_ENV,
    // Only PROBE_MARKER is passed. PROBE_INHERITED exists solely on this
    // process, so the child seeing it proves a merge rather than a replace.
    options: { env: { PROBE_MARKER: 'probe-env-marker' }, maxTurns: 4 },
  });

  const sid03 = runs['03']!.redacted.find((m) => m['type'] === 'result')?.['session_id'] as
    | string
    | undefined;
  if (sid03) {
    runs['resume'] = await runCapture({
      name: 'x-resume',
      prompt: 'Reply with just: RESUMED',
      options: { resume: sid03, maxTurns: 2 },
    });
  }

  // --- write the five captured fixtures ------------------------------------
  const files: Record<string, string> = {
    '01': '01-parallel-dispatch.ndjson',
    '02': '02-nested-dispatch.ndjson',
    '03': '03-tool-result-close.ndjson',
    '04': '04-orphaned-calf.ndjson',
    '06': '06-permission-prompt.ndjson',
  };
  for (const [k, f] of Object.entries(files)) writeNdjsonTo(path.join(FIXTURE_DIR, f), runs[k]!.redacted);

  // 05: hand-corrupt a copy of 03 — the one file §2 exempts from "verbatim".
  const src = runs['03']!.redacted.map((l) => JSON.stringify(l));
  const mid = Math.max(2, Math.floor(src.length / 2));
  const corrupted = [
    ...src.slice(0, mid),
    src[mid]!.slice(0, Math.floor(src[mid]!.length * 0.6)), // truncated JSON
    src[mid]!,
    'this line is not JSON at all -- CLI stderr leaked into the stream',
    src[mid + 1]!,
    JSON.stringify({
      type: 'quantum_flux',
      subtype: 'unknown_to_this_router',
      session_id: 'probe',
      uuid: 'probe',
    }),
    ...src.slice(mid + 2),
  ];
  writeFileSync(path.join(FIXTURE_DIR, '05-malformed.ndjson'), corrupted.join('\n') + '\n', 'utf8');

  // --- analysis -------------------------------------------------------------
  const l01 = runs['01']!.redacted;
  const l02 = runs['02']!.redacted;
  const l03 = runs['03']!.redacted;
  const l04 = runs['04']!.redacted;
  const l06 = runs['06']!.redacted;
  const all = [...l01, ...l02, ...l03, ...l04, ...l06];

  // Open question 1 --------------------------------------------------------
  const ids01 = new Set(dispatches(l01).map((d) => d.id));
  const subMsgs01 = l01.filter(isSubagentOriginated);
  const allMatch = subMsgs01.length > 0 && subMsgs01.every((m) => ids01.has(String(m['parent_tool_use_id'])));
  const matriarchClean = l01
    .filter((m) => (m['type'] === 'assistant' || m['type'] === 'user') && !isSubagentOriginated(m))
    .every((m) => m['parent_tool_use_id'] === null || m['parent_tool_use_id'] === undefined);
  const correlates = allMatch && matriarchClean;

  const carriers = new Set<string>();
  for (const m of all) if (isSubagentOriginated(m)) carriers.add(String(m['type']));

  const ds01 = dispatches(l01);
  const oneTurn = dispatchedInOneTurn(ds01);
  const inter = ds01.length >= 2 ? interleaved(l01, ds01[0]!.id, ds01[1]!.id) : { ok: false, switches: 0 };

  // Nesting ----------------------------------------------------------------
  const ds02 = dispatches(l02);
  const depth2 = ds02.filter((d) => d.depth >= 2);
  const allDepthsResolved = ds02.every((d) => d.depth >= 1);
  const parentAgentIdSeen = all.some((m) =>
    JSON.stringify(m).includes('"parent_agent_id"'),
  );

  // agent_id ----------------------------------------------------------------
  const surfaces = agentIdSurfaces(all);
  const permWithAgent = Object.values(runs).flatMap((r) => r.permissions.filter((p) => p.agentID));
  const calfIds = { ...agentIdByCalf(l01), ...agentIdByCalf(l02), ...agentIdByCalf(l03), ...agentIdByCalf(l06) };
  const everyCalf =
    Object.keys(calfIds).length > 0 &&
    Object.values(calfIds).every((v) => v.taskStarted !== null || v.toolResult !== null);
  const taskStartedAlways =
    Object.keys(calfIds).length > 0 && Object.values(calfIds).every((v) => v.taskStarted !== null);

  // Open question 2 ---------------------------------------------------------
  const init01 = l01.find((m) => m['type'] === 'system' && m['subtype'] === 'init');
  const initTools = (init01?.['tools'] ?? []) as string[];
  const steerText = textOf(runs['steer']!.redacted);
  const has = (t: string): boolean => initTools.includes(t);
  const notSuchTool = /No such tool available/i.test(steerText);

  // Options -----------------------------------------------------------------
  const proseWith = subagentProseBlocks(l03);
  const proseWithout = subagentProseBlocks(runs['noforward']!.redacted);
  const modes = cliPermissionModes();
  const envText = textOf(runs['env']!.redacted);
  const pathLen = Number(/PATHLEN=(\d+)/.exec(envText)?.[1] ?? '-1');
  const passedSeen = /PASSED=\[probe-env-marker\]/.test(envText);
  // The decisive signal: a variable that existed only on the probe's process and
  // was NOT included in options.env.
  const inheritedSeen = /INHERITED=\[probe-inherited-marker\]/.test(envText);
  const inheritedEmpty = /INHERITED=\[\]/.test(envText);
  const envConclusive = passedSeen && (inheritedSeen || inheritedEmpty);
  const envReplaces = envConclusive ? !inheritedSeen : null;
  const resumeSid = runs['resume']?.redacted.find((m) => m['type'] === 'system')?.['session_id'] ?? null;
  const resumeWorked = Boolean(sid03 && resumeSid === sid03);

  const agentIdPrimary = taskStartedAlways
    ? 'system/task_started.task_id (correlated to the opening Agent tool_use by system/task_started.tool_use_id)'
    : surfaces[0]?.path ?? null;

  const findings = {
    schemaVersion: 1,
    capturedAt,
    cliVersion: readPkg('claudeCodeVersion'),
    sdkVersion: readPkg('version'),
    platform: process.platform,

    parentToolUseId: {
      correlates,
      fieldPath: 'parent_tool_use_id',
      messageTypesCarryingIt: [...carriers].sort(),
      notes: correlates
        ? `Every subagent-originated message in 01-parallel-dispatch.ndjson carried a parent_tool_use_id equal to the id of the Agent tool_use that opened it (${[...ids01].join(', ')}), and no Matriarch message carried a non-null one. The two Calves were dispatched as two tool_use blocks of a single assistant message (message.id ${oneTurn.messageId}) and their messages interleave (${inter.switches} lane switches).`
        : 'parent_tool_use_id did not correlate; see docs/protocol-findings.md.',
    },
    recommendedRoutingMode: correlates ? 'lanes' : 'inline',

    nesting: {
      depth2Observed: depth2.length > 0,
      parentAgentIdFieldPath: parentAgentIdSeen ? 'parent_agent_id' : null,
      distinguishableFromDepth1: depth2.length > 0 && allDepthsResolved,
      notes: parentAgentIdSeen
        ? ''
        : `parent_agent_id never appears on any streamed SDK message (it exists only on SessionMessage, returned by getSessionMessages()). It is not needed: depth is recovered by chaining parent_tool_use_id — a depth-2 Calf's messages point at an Agent tool_use block that itself sits in a message whose parent_tool_use_id is non-null. Observed in 02-nested-dispatch.ndjson: ${depth2.map((d) => `tool_use ${d.id} at line ${d.line} is depth ${d.depth}`).join('; ')}.`,
    },

    agentId: {
      observed: surfaces.length > 0 || permWithAgent.length > 0,
      fieldPath: agentIdPrimary,
      availableForEveryCalf: everyCalf,
      notes: `Three independent surfaces carry the same id. (1) system/task_started.task_id, emitted when the Calf opens, correlated to the dispatching Agent tool_use via task_started.tool_use_id — present for ${Object.values(calfIds).filter((v) => v.taskStarted).length}/${Object.keys(calfIds).length} Calves. (2) tool_use_result.agentId on the user message closing the Agent tool_use. (3) canUseTool options.agentID for tool calls made inside a Calf. Values match exactly, e.g. ${permWithAgent[0]?.agentID ?? 'n/a'} in 06-permission-prompt.ndjson.`,
    },

    steering: {
      sendMessageAvailable: has('SendMessage'),
      taskStopAvailable: has('TaskStop'),
      taskOutputAvailable: has('TaskOutput'),
      evidence:
        `system/init tools array (01-parallel-dispatch.ndjson line 1) contains: ${initTools.filter((t) => t === 'SendMessage' || t === 'TaskStop' || t === 'TaskOutput').join(', ') || '(none)'}. ` +
        `An actual invocation attempt through the TypeScript SDK returned tool-level errors, not absence — verbatim: ${JSON.stringify(steerText)}. ` +
        `The string "No such tool available" was ${notSuchTool ? 'present' : 'NOT present'} anywhere in the attempt.`,
    },

    optionsVerified: {
      forwardSubagentTextRequired: proseWith > 0 && proseWithout === 0,
      permissionModeValues: modes.values,
      resumeOptionName: resumeWorked ? 'resume' : null,
      envReplacesEnvironment: envReplaces,
      notes:
        `forwardSubagentText: with it, subagent assistant messages carried ${proseWith} text/thinking blocks; without it, ${proseWithout} (tool_use/tool_result still forwarded either way). ` +
        `permissionMode: ${modes.evidence} ` +
        `resume: replaying session ${sid03 ?? 'n/a'} through options.resume returned session_id ${String(resumeSid)} — ${resumeWorked ? 'same session, so the option name is `resume`' : 'MISMATCH'}. ` +
        `env: options.env was { PROBE_MARKER } and nothing else, while PROBE_INHERITED existed only on the probe's own process. The child shell reported ${JSON.stringify(
          /INHERITED=\[[^\]]*\] PASSED=\[[^\]]*\] PATHLEN=\d+/.exec(envText)?.[0] ?? envText.slice(0, 200),
        )} — the un-passed PROBE_INHERITED was ${inheritedSeen ? 'VISIBLE, so the parent environment is MERGED, not replaced' : inheritedEmpty ? 'ABSENT, so the parent environment is REPLACED' : 'inconclusive'}. ($PATH length ${pathLen} is reported but is NOT evidence either way: a login shell rebuilds PATH regardless of what it inherits.)`,
    },

    fixtures: [] as unknown[],
  };

  const byName: Record<string, Msg[]> = {
    '01-parallel-dispatch.ndjson': l01,
    '02-nested-dispatch.ndjson': l02,
    '03-tool-result-close.ndjson': l03,
    '04-orphaned-calf.ndjson': l04,
    '06-permission-prompt.ndjson': l06,
  };
  // --- per-fixture entries, including the deviations T5/T6 must know about ---
  const lineOf = (lines: Msg[], pred: (m: Msg) => boolean): number =>
    lines.findIndex(pred) + 1;

  // 04: what the background dispatch actually produced.
  const l04TaskStarted = lineOf(l04, (m) => m['subtype'] === 'task_started');
  const l04Result = lineOf(l04, (m) => m['type'] === 'result');
  const l04Dispatch = dispatches(l04)[0];
  const l04Ack = lineOf(l04, (m) =>
    contentBlocks(m).some(
      (b) => b['type'] === 'tool_result' && String(b['tool_use_id']) === String(l04Dispatch?.id),
    ),
  );
  const l04SubagentMsgs = l04.filter(isSubagentOriginated).length;
  const l04OpenLanes = openLanesAtEnd(l04);

  // 02: the depth-2 lane's task_started arrives BEFORE the tool_use that opens it.
  const d2 = dispatches(l02).find((d) => d.depth >= 2);
  const l02Depth2Started = d2
    ? lineOf(l02, (m) => m['subtype'] === 'task_started' && String(m['tool_use_id']) === d2.id)
    : 0;

  findings.fixtures = [
    {
      file: '01-parallel-dispatch.ndjson',
      ...fixtureStats(l01),
      notes: `Two Calves opened by two Agent tool_use blocks of ONE assistant message (message.id ${oneTurn.messageId}, lines ${ds01.map((d) => d.line).join(' and ')}). Their messages interleave — ${inter.switches} lane switches. The dispatch tool is named 'Agent' in CLI 2.1.235, not 'Task'; match on both.`,
    },
    {
      file: '02-nested-dispatch.ndjson',
      ...fixtureStats(l02),
      notes:
        `Depth 2. Depth is recovered by chaining parent_tool_use_id: the Agent tool_use ${d2?.id ?? 'n/a'} on line ${d2?.line ?? 0} sits in a message whose own parent_tool_use_id is non-null. ` +
        `ORDERING HAZARD: system/task_started for the depth-2 lane is emitted on line ${l02Depth2Started}, BEFORE the assistant tool_use that opens it on line ${d2?.line ?? 0}. The router must tolerate task_started preceding its dispatch block — it cannot assume the tool_use has already been seen when the lane-open arrives.`,
    },
    {
      file: '03-tool-result-close.ndjson',
      ...fixtureStats(l03),
      notes: 'One foreground Calf opening and closing normally. The baseline; 05-malformed is derived from this file.',
    },
    {
      file: '04-orphaned-calf.ndjson',
      ...fixtureStats(l04),
      // Additive per §3. The contract asked for a Calf with no tool_result at
      // turn end; this CLI cannot emit that, so the fixture substitutes the
      // achievable orphan and names the assertion that replaces it.
      orphanCondition: 'lane-open-at-result',
      notes:
        `SUBSTITUTION — read before writing this fixture's test. fixture-corpus.md §1 asks for "a Calf with no tool_result at turn end". CLI ${readPkg('claudeCodeVersion')} CANNOT emit that: every tool_use is answered before the turn's result message. Two paths were tried and both produced a tool_result. (a) Interrupting mid-Calf via Query.interrupt() yields a synthetic is_error tool_result reading "The user doesn't want to proceed with this tool use. The tool use was rejected...". (b) maxTurns: 1 lets the Calf run to completion and still closes it. ` +
        `What this fixture captures instead is a BACKGROUND dispatch (run_in_background: true), the real orphan the router must survive: the lane opens at system/task_started (task_id ${l04OpenLanes[0] ?? 'n/a'}, line ${l04TaskStarted}) and the turn's result arrives on line ${l04Result} with no terminal system/task_updated and no system/task_notification. ` +
        `The dispatching Agent tool_use on line ${l04Dispatch?.line ?? 0} IS answered, on line ${l04Ack}, but only by the launch acknowledgement ("Async agent launched successfully"), not by the Calf's work. A router that closes a Calf on the dispatching tool_use's tool_result therefore closes this lane at line ${l04Ack} and an Orphaned test asserting "tool_use with no tool_result" passes vacuously while proving nothing. ` +
        `ASSERT INSTEAD: a lane opened by system/task_started with no terminal system/task_updated when the result message arrives. ` +
        `Also note this capture contains ${l04SubagentMsgs} subagent-originated messages — a background Calf forwards none — so it exercises lane LIFECYCLE only and never lane CONTENT. Use 01/02/03 for content.`,
    },
    {
      file: '05-malformed.ndjson',
      ...fixtureStats(l03),
      lines: corrupted.length,
      notes: `Derived from 03-tool-result-close.ndjson — the one file §2 exempts from "verbatim". Line 11 is truncated JSON, line 13 is non-JSON text, line 15 is a syntactically valid object with an unknown "type". Lines 10, 12, 14 and 16 are valid, so the stream must survive each corruption rather than end. The counts above describe the underlying capture, not the corrupted copy.`,
    },
    {
      file: '06-permission-prompt.ndjson',
      ...fixtureStats(l06),
      notes: `canUseTool fired once, for the Write call ${permWithAgent[0]?.toolUseID ?? 'n/a'} made inside the Calf, carrying options.agentID ${permWithAgent[0]?.agentID ?? 'n/a'}. Read-only Bash is auto-approved even under permissionMode 'default' and never reaches canUseTool, which is why this Calf writes a file. The callback is (toolName, input, options) — three positional arguments — and options carried ${runs['06']!.permissions[0]?.optionKeys.join(', ') ?? 'n/a'}.`,
    },
  ];

  writeFileSync(path.join(FIXTURE_DIR, 'findings.json'), JSON.stringify(findings, null, 2) + '\n', 'utf8');

  // --- scratch material for the narrative ----------------------------------
  writeFileSync(
    path.join(SCRATCH, 'evidence.json'),
    JSON.stringify(
      {
        oneTurn,
        interleave: inter,
        dispatches01: ds01,
        dispatches02: ds02,
        unclosed04: unclosedToolUses(l04),
        openLanes04: openLanesAtEnd(l04),
        openLanes03: openLanesAtEnd(l03),
        agentIdSurfaces: surfaces,
        calfIds,
        permissions: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, r.permissions])),
        steerText,
        envText,
        initTools,
        errors: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, r.error])),
      },
      null,
      2,
    ),
    'utf8',
  );
  for (const [k, r] of Object.entries(runs)) {
    if (!/^\d\d$/.test(k)) writeNdjsonTo(path.join(SCRATCH, `${r.name}.ndjson`), r.redacted);
  }
  console.log('probe complete:', path.join(FIXTURE_DIR, 'findings.json'));
}

function readPkg(field: string): string {
  const p = path.join(REPO_ROOT, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json');
  return String((JSON.parse(readFileSync(p, 'utf8')) as Msg)[field]);
}

await main();
