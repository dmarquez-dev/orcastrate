/**
 * Narrow, total readers for the raw Claude Code stream JSON.
 *
 * Nothing here throws and nothing here trusts a field's presence or type: the
 * router's contract is that `ingest` never throws, so every accessor returns
 * `null`/`undefined` rather than asserting. The shapes are taken from the T2
 * capture in `tests/fixtures/protocol/` (CLI 2.1.235), not from the SDK types —
 * importing the SDK would break the router's no-I/O purity requirement.
 */

/** The complete set of top-level `type` values observed in the T2 corpus. */
export const KNOWN_MESSAGE_TYPES = [
  'assistant',
  'user',
  'result',
  'rate_limit_event',
  'system',
] as const;

/**
 * The dispatch tool.
 *
 * `findings.json` fixtures[0].notes: "The dispatch tool is named 'Agent' in CLI
 * 2.1.235, not 'Task'; match on both." Spec 4.3 says `Task` throughout; the
 * measured name is `Agent`. Both are accepted so a CLI rename in either
 * direction keeps routing.
 */
export const DISPATCH_TOOL_NAMES: readonly string[] = ['Agent', 'Task'];

export function isDispatchTool(name: unknown): boolean {
  return typeof name === 'string' && DISPATCH_TOOL_NAMES.includes(name);
}

/**
 * `system/task_updated.patch.status` values that end a Calf. Anything outside
 * this set (e.g. `in_progress`) leaves the lane running.
 */
export const TERMINAL_TASK_STATUSES: readonly string[] = [
  'completed',
  'failed',
  'error',
  'cancelled',
  'canceled',
  'aborted',
  'stopped',
  'killed',
];

export function isTerminalTaskStatus(status: unknown): boolean {
  return typeof status === 'string' && TERMINAL_TASK_STATUSES.includes(status);
}

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a property as a string, or returns null for anything else. */
export function str(source: unknown, key: string): string | null {
  if (!isObject(source)) return null;
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

export function obj(source: unknown, key: string): JsonObject | null {
  if (!isObject(source)) return null;
  const value = source[key];
  return isObject(value) ? value : null;
}

/** JSON.stringify that cannot throw on cycles or BigInt. */
export function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    const text = JSON.stringify(value, (_key, inner: unknown) => {
      if (typeof inner === 'bigint') return `${inner.toString()}n`;
      if (typeof inner === 'object' && inner !== null) {
        if (seen.has(inner)) return '[Circular]';
        seen.add(inner);
      }
      return inner;
    });
    return text ?? String(value);
  } catch {
    return String(value);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : safeStringify(error);
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export interface TextBlock {
  kind: 'text';
  text: string;
}

export interface ThinkingBlock {
  kind: 'thinking';
  text: string;
}

export interface ToolUseBlock {
  kind: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  kind: 'tool_result';
  toolUseId: string;
  isError: boolean;
  content: unknown;
}

export interface UnreadableBlock {
  kind: 'unreadable';
  raw: unknown;
  reason: string;
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | UnreadableBlock;

/**
 * Flattens `message.message.content` into an ordered block list.
 *
 * A bare string content (the SDK's shorthand for a single text block) becomes
 * one text block. Anything unreadable becomes an `unreadable` block rather than
 * being dropped — the router turns those into `malformed` events (spec 8).
 */
export function readContentBlocks(message: unknown): ContentBlock[] {
  const inner = obj(message, 'message');
  const content = inner ? inner['content'] : undefined;

  if (typeof content === 'string') {
    return content.length > 0 ? [{ kind: 'text', text: content }] : [];
  }
  if (!Array.isArray(content)) return [];

  const blocks: ContentBlock[] = [];
  for (const rawBlock of content) {
    blocks.push(readBlock(rawBlock));
  }
  return blocks;
}

function readBlock(rawBlock: unknown): ContentBlock {
  if (!isObject(rawBlock)) {
    return { kind: 'unreadable', raw: rawBlock, reason: 'content block is not an object' };
  }

  const type = rawBlock['type'];
  switch (type) {
    case 'text': {
      return { kind: 'text', text: str(rawBlock, 'text') ?? '' };
    }
    case 'thinking':
    case 'redacted_thinking': {
      // The measured field is `thinking` (01-parallel-dispatch line 9);
      // `text` is accepted as a fallback in case the block is reshaped.
      return { kind: 'thinking', text: str(rawBlock, 'thinking') ?? str(rawBlock, 'text') ?? '' };
    }
    case 'tool_use':
    case 'server_tool_use': {
      const id = str(rawBlock, 'id');
      const name = str(rawBlock, 'name');
      if (id === null || name === null) {
        return { kind: 'unreadable', raw: rawBlock, reason: 'tool_use block has no id or name' };
      }
      return { kind: 'tool_use', id, name, input: rawBlock['input'] };
    }
    case 'tool_result': {
      const toolUseId = str(rawBlock, 'tool_use_id');
      if (toolUseId === null) {
        return {
          kind: 'unreadable',
          raw: rawBlock,
          reason: 'tool_result block has no tool_use_id',
        };
      }
      return {
        kind: 'tool_result',
        toolUseId,
        // Measured: `is_error` is absent on the dispatch tool_result
        // (01-parallel-dispatch line 25). Absent means "not an error".
        isError: rawBlock['is_error'] === true,
        content: rawBlock['content'],
      };
    }
    default: {
      return {
        kind: 'unreadable',
        raw: rawBlock,
        reason: `unrecognized content block type ${safeStringify(type)}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Correlation fields
// ---------------------------------------------------------------------------

/**
 * `findings.json` parentToolUseId.fieldPath === "parent_tool_use_id", carried by
 * message types `assistant` and `user`. `parent_agent_id` is NOT read: the same
 * findings record `nesting.parentAgentIdFieldPath === null` — it never appears
 * on a streamed message, only on the disk-read `SessionMessage` shape. Depth is
 * recovered by chaining `parent_tool_use_id` instead
 * (`nesting.distinguishableFromDepth1 === true`).
 */
export function readParentToolUseId(message: unknown): string | null {
  return str(message, 'parent_tool_use_id');
}
