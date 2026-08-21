/**
 * Compact tool activity (`contracts/transcript-turns.ts` sections 2 and 3).
 *
 * TOTALITY IS THE PROPERTY. Every tool renders something useful, including
 * tools nobody anticipated and tools that do not exist yet — so the table is
 * keyed on ARGUMENT NAMES, not on tool names. A table of tool names is wrong
 * the day a new tool ships and degrades silently to nothing; argument names
 * are shared across tools, so an unknown tool with a familiar argument still
 * summarises and an unknown tool with an unfamiliar argument falls through to
 * a STATED FALLBACK rather than to an empty string.
 */

/**
 * Ordered. First match wins. Extending this array is a normal change; keying
 * on a tool name instead is not.
 */
export const PRIMARY_ARG_KEYS: readonly string[] = [
  'file_path',
  'notebook_path',
  'path',
  'url',
  'command',
  'pattern',
  'query',
  'prompt',
  'description',
  'skill',
  'subagent_type',
  'name',
  'text',
];

/**
 * Elision budget for the value inside the brackets. The name and the brackets
 * are not counted against it.
 */
export const TOOL_SUMMARY_MAX_CHARS = 120;

/** The display name when `name` is empty or is not a string at all. */
export const UNKNOWN_TOOL_NAME = 'unknown tool';

/**
 * A value the brackets can show as itself. `null` and `undefined` are
 * deliberately NOT usable: `Read("null")` is worse than `Read(1 arg)`, so they
 * fall through to the counted fallback.
 */
function isShowable(value: unknown): boolean {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol':
      return true;
    default:
      return false;
  }
}

/** `String()` on a `symbol` throws under implicit coercion; this never does. */
function show(value: unknown): string {
  try {
    return typeof value === 'symbol' ? value.toString() : String(value);
  } catch {
    return '';
  }
}

/**
 * ONE LINE BY CONSTRUCTION, AND CUT ON CODE POINTS.
 *
 * Newlines and runs of whitespace collapse to single spaces BEFORE the cut, so
 * a multi-line value can never put a newline in the summary. `[...text]`
 * iterates code points, so the cut never splits a surrogate pair and an emoji
 * at the boundary survives whole.
 */
function elide(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  const points = [...oneLine];
  if (points.length <= TOOL_SUMMARY_MAX_CHARS) return oneLine;
  return `${points.slice(0, TOOL_SUMMARY_MAX_CHARS - 1).join('')}…`;
}

/** Own enumerable STRING keys. Symbol keys are not arguments a reader named. */
function ownKeys(input: object): string[] {
  try {
    return Object.keys(input);
  } catch {
    return [];
  }
}

/** Reading a property can throw — a getter, a revoked Proxy, a hostile object. */
function readKey(input: object, key: string): { ok: boolean; value: unknown } {
  try {
    return { ok: true, value: (input as Record<string, unknown>)[key] };
  } catch {
    return { ok: false, value: undefined };
  }
}

/** THE STATED FALLBACK. Never empty, never "unknown", never a raw JSON dump. */
function countedFallback(count: number): string {
  if (count === 0) return 'no args';
  return `${count} ${count === 1 ? 'arg' : 'args'}`;
}

/**
 * A one-line summary of a tool call.
 *
 * THE LADDER, in order; the FIRST branch that applies wins.
 *
 *   1. `input` is a non-empty string        -> `Name("<elided input>")`
 *   2. `input` is a non-null object and some key in `PRIMARY_ARG_KEYS` is
 *      present with a showable value, taken in the order that array declares
 *                                           -> `Name("<elided value>")`
 *   3. `input` is a non-null object with EXACTLY ONE own enumerable key whose
 *      value is showable                    -> `Name("<elided value>")`
 *   4. `input` is a non-null object with N own enumerable keys
 *                                           -> `Name(no args)` / `Name(1 arg)`
 *                                              / `Name(N args)`
 *   5. anything else                        -> `Name(<elided JSON or String()>)`
 *
 * GUARANTEED, for EVERY `(name, input)` pair without exception: returns a
 * non-empty `string`; NEVER throws; starts with the display name; contains no
 * newline; and the bracket content is at most `TOOL_SUMMARY_MAX_CHARS` code
 * points long.
 */
export function summarizeToolCall(name: string, input: unknown): string {
  const displayName =
    typeof name === 'string' && name.trim().length > 0
      ? name.replace(/\s+/g, ' ')
      : UNKNOWN_TOOL_NAME;

  return `${displayName}(${bracketContent(input)})`;
}

function bracketContent(input: unknown): string {
  // 1 — a bare string input is the whole argument.
  if (typeof input === 'string') {
    if (input.trim().length > 0) return `"${elide(input)}"`;
    // An empty or all-whitespace string is not an argument worth quoting.
    return countedFallback(0);
  }

  if (typeof input === 'object' && input !== null) {
    const keys = ownKeys(input);

    // 2 — a recognised argument name, in the order the table declares.
    for (const key of PRIMARY_ARG_KEYS) {
      if (!keys.includes(key)) continue;
      const read = readKey(input, key);
      if (read.ok && isShowable(read.value)) return `"${elide(show(read.value))}"`;
    }

    // 3 — exactly one own key, whatever it is called.
    if (keys.length === 1) {
      const read = readKey(input, keys[0]!);
      if (read.ok && isShowable(read.value)) return `"${elide(show(read.value))}"`;
    }

    // 4 — THE STATED FALLBACK.
    return countedFallback(keys.length);
  }

  // 5 — null, undefined, a number, a boolean, a symbol, a BigInt, a function.
  let rendered: string;
  try {
    rendered = JSON.stringify(input) ?? show(input);
  } catch {
    rendered = show(input);
  }
  if (rendered.trim().length === 0) rendered = show(input);
  if (rendered.trim().length === 0) rendered = countedFallback(0);
  return elide(rendered);
}

/**
 * The size the collapsed tool-result row reports. TOTAL; never throws.
 *
 * IT IS A SIZE, NOT A CHECKSUM. Nobody should read meaning into the exact
 * number; it exists so a reader can tell a one-line result from a wall of
 * output before deciding to open it.
 */
export function toolResultCharCount(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (content === null || content === undefined) return 0;
  try {
    const json = JSON.stringify(content);
    if (typeof json === 'string') return json.length;
  } catch {
    // Circular, a throwing getter, a BigInt — fall through to `String()`.
  }
  try {
    return show(content).length;
  } catch {
    return 0;
  }
}

/**
 * `1 char` / `312 chars` — SINGULAR AT ONE. `LaneRail.tsx`'s `finishedLabel`
 * is the local precedent and gets it right.
 */
export function toolResultSizeLabel(count: number): string {
  return `${count} ${count === 1 ? 'char' : 'chars'}`;
}
