import type { ToolResultPayload } from '@shared/contracts/events';

/** The tool name a Bash call carries on its `tool_use`. */
export const BASH_TOOL_NAME = 'Bash';

/**
 * The first line of a Bash result whose command exited non-zero. `$` without
 * the `m` flag is end of input, so a bare `Exit code 3` with no output matches.
 */
const EXIT_CODE_LINE = /^Exit code ([0-9]+)(\r?\n|$)/;

/**
 * The result's text: `content` itself when it is a string, or the `text` of
 * the first block when `content` is an array whose first element is a text
 * block. Anything else has no text to read, and that is a legitimate state —
 * the SDK value is opaque — so it yields `null` rather than throwing.
 */
function resultText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const first: unknown = content[0];
  if (typeof first !== 'object' || first === null) return null;
  if (!('type' in first) || first.type !== 'text') return null;
  if (!('text' in first) || typeof first.text !== 'string') return null;
  return first.text;
}

/**
 * THE ONE DEFINITION OF A BASH NON-ZERO EXIT. Returns the exit code N exactly
 * when all three hold, and `null` otherwise:
 *
 *  - the result's `isError` is `true`;
 *  - `toolName` — the name on the `tool_use` with the result's `toolUseId` —
 *    is exactly `'Bash'`;
 *  - the result's text starts with an `Exit code N` line, N not 0.
 *
 * WHY THE TOOL NAME IS REQUIRED. The `tool_result` payload carries no tool
 * name, so the prefix alone is all a result says about itself, and any tool
 * may return text that starts `Exit code 1`. Matching on the prefix alone
 * would relabel a real failure from another tool as an ordinary outcome. A
 * result whose call is not known (`toolName` is `undefined`) is therefore NOT
 * recognised, and keeps the error treatment — the safe direction.
 *
 * WHY A RECOGNISED EXIT IS NOT AN ERROR. A command that exits non-zero ran; its
 * exit status is the command's own outcome, reported faithfully by a tool that
 * worked. The SDK flags it `isError` all the same, which is why this has to be
 * recognised rather than read off the flag.
 */
export function bashExitCode(result: ToolResultPayload, toolName: string | undefined): number | null {
  if (!result.isError) return null;
  if (toolName !== BASH_TOOL_NAME) return null;
  const text = resultText(result.content);
  if (text === null) return null;
  const match = EXIT_CODE_LINE.exec(text);
  if (match === null) return null;
  const digits = match[1];
  if (digits === undefined) return null;
  const code = Number(digits);
  return code === 0 ? null : code;
}
