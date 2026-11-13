/**
 * The per-session slash-command state behind `push:podCommands`.
 *
 * Pure: no I/O, no clock, no logger. `PodManager` owns the read, the timeout,
 * the log lines and the push; this module only decides WHAT the visible list is
 * and WHETHER it changed. The rules it implements:
 *
 *   1. THE CATALOG is the SDK's command list for the session, or unknown until
 *      one arrives. Two writers only: the initial `supportedCommands()` read,
 *      and a `system`/`commands_changed` message whose `commands` is an array,
 *      which REPLACES the catalog (the SDK tells clients to replace their cached
 *      list with that payload). An initial-read answer that arrives after such a
 *      replacement is stale and is discarded.
 *   2. THE TERMINAL SET is the string members of `terminal_slash_commands` on
 *      the LATEST `system`/`init` this session ingested, or empty when that init
 *      lacks the field (the SDK omits it when it would be empty). Before the
 *      first init it is empty, so nothing is hidden until a turn has begun.
 *   3. THE VISIBLE LIST is the catalog in catalog order, minus every entry whose
 *      `name` is in the terminal set; undefined while the catalog is unknown.
 *   4. A change is reported only when the visible list is defined and differs,
 *      element by element on all four fields, from the last list reported. The
 *      session's first defined list is always reported, even when empty.
 *
 * Every list, from either writer, passes through `normalizeSlashCommands`
 * first, which applies these rules to each entry:
 *
 *   - THE NAME must be one printable token: a non-empty string with no
 *     whitespace (`\s`), no control character (`\p{Cc}`) and no format
 *     character (`\p{Cf}`). An entry whose name fails is dropped; the rest keep
 *     their order. Unicode letters and qualified names such as
 *     `plugin:command` or `mcp__server__tool` pass.
 *   - AN ALIAS that fails the same rule is dropped; valid aliases keep their
 *     order.
 *   - THE DISPLAY TEXT (`description`, `argumentHint`): every `\p{Cf}`
 *     character, and every `\p{Cc}` character other than the five that `\s`
 *     matches (tab, newline, vertical tab, form feed, CR), is removed first.
 *     Then each run of one or more of those five becomes a single space, so
 *     `a\tb` and `a\r\nb` both read `a b`, and a run interrupted only by a
 *     removed character is still one run. Ordinary spaces are left alone and
 *     nothing is trimmed, so `a \nb` reads `a  b`.
 *
 * The raw messages are only READ here. They still reach the LaneRouter and the
 * store exactly as before.
 */

import type { SlashCommandInfo } from '../../shared/contracts/ipc';

/**
 * How long the initial `supportedCommands()` read may take. The SDK's method
 * takes no abort signal, so this bound is the whole of the cancellation the
 * read can be given.
 */
export const SLASH_COMMANDS_READ_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A character that disqualifies a name: whitespace, a control or a format character. */
const NOT_NAME_CHARACTER = /[\s\p{Cc}\p{Cf}]/u;

/**
 * A run of the control characters JavaScript's `\s` matches. Those are exactly
 * tab, newline, vertical tab, form feed and CR; U+0085 is `\p{Cc}` but not `\s`.
 */
const WHITESPACE_CONTROL_RUN = /[\t\n\v\f\r]+/g;

/** Every control and format character except the five in `WHITESPACE_CONTROL_RUN`. */
const REMOVED_CHARACTER = /(?![\t\n\v\f\r])[\p{Cc}\p{Cf}]/gu;

/**
 * Whether `value` is one printable token: a non-empty string with no
 * whitespace (`\s`), no control character (`\p{Cc}`) and no format character
 * (`\p{Cf}`, which covers zero-width and bidi overrides such as U+200B and
 * U+202E). Anything else is allowed, so Unicode letters and qualified names
 * such as `plugin:command` or `mcp__server__tool` pass.
 */
function isCommandName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !NOT_NAME_CHARACTER.test(value);
}

/**
 * A display string: `''` when not a string. Otherwise the removed characters go
 * first, so whitespace controls they separated join into one run, and each run
 * then becomes one space. Nothing is trimmed.
 */
function displayText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(REMOVED_CHARACTER, '').replace(WHITESPACE_CONTROL_RUN, ' ');
}

/**
 * Normalizes an SDK command list. Anything that is not an array is `[]`. The
 * rules, per entry:
 *
 *   - An entry that is not an object, or whose `name` is not one printable
 *     token, is dropped and the rest keep their order. A name is one printable
 *     token when it is a non-empty string containing no whitespace (`\s`), no
 *     control character (`\p{Cc}`) and no format character (`\p{Cf}`).
 *   - `description` and `argumentHint` become `''` when not a string.
 *     Otherwise every `\p{Cf}` character, and every `\p{Cc}` character that
 *     `\s` does not match, is removed; then each run of the `\p{Cc}` characters
 *     `\s` does match (tab, newline, vertical tab, form feed, CR) becomes one
 *     space. Ordinary spaces are kept and nothing is trimmed.
 *   - `aliases` is `[]` when absent or not an array; otherwise it keeps only
 *     the members that pass the same rule as `name`, in their original order.
 */
export function normalizeSlashCommands(value: unknown): SlashCommandInfo[] {
  if (!Array.isArray(value)) return [];
  const out: SlashCommandInfo[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) continue;
    const { name, description, argumentHint, aliases } = entry;
    if (!isCommandName(name)) continue;
    out.push({
      name,
      description: displayText(description),
      argumentHint: displayText(argumentHint),
      aliases: Array.isArray(aliases) ? (aliases as unknown[]).filter(isCommandName) : [],
    });
  }
  return out;
}

function sameCommand(a: SlashCommandInfo, b: SlashCommandInfo): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.argumentHint === b.argumentHint &&
    a.aliases.length === b.aliases.length &&
    a.aliases.every((alias, i) => alias === b.aliases[i])
  );
}

function sameList(a: readonly SlashCommandInfo[], b: readonly SlashCommandInfo[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((command, i) => {
    const other = b[i];
    return other !== undefined && sameCommand(command, other);
  });
}

/**
 * One session's catalog, terminal set and last-reported list. Each mutator
 * returns the visible list to push when rules 3 and 4 say one is due, else
 * `null`.
 */
export class SlashCommandState {
  #catalog: SlashCommandInfo[] | undefined = undefined;
  /** Set once a `commands_changed` replaced the catalog; a late initial read is then stale. */
  #replaced = false;
  #terminal: ReadonlySet<string> = new Set();
  #lastReported: SlashCommandInfo[] | undefined = undefined;

  /**
   * The initial read's answer. The caller handles `null` (no command surface)
   * itself and never passes it here. Discarded after a `commands_changed`.
   */
  acceptInitialRead(value: unknown): SlashCommandInfo[] | null {
    if (this.#replaced) return null;
    this.#catalog = normalizeSlashCommands(value);
    return this.#report();
  }

  /** Reads one raw SDK message. Anything but the two `system` subtypes is ignored. */
  observe(message: unknown): SlashCommandInfo[] | null {
    if (!isRecord(message) || message['type'] !== 'system') return null;
    const subtype = message['subtype'];

    if (subtype === 'commands_changed') {
      const commands = message['commands'];
      if (!Array.isArray(commands)) return null;
      this.#replaced = true;
      this.#catalog = normalizeSlashCommands(commands);
      return this.#report();
    }

    if (subtype === 'init') {
      const terminal = message['terminal_slash_commands'];
      this.#terminal = new Set(
        Array.isArray(terminal)
          ? (terminal as unknown[]).filter((name): name is string => typeof name === 'string')
          : [],
      );
      return this.#report();
    }

    return null;
  }

  #report(): SlashCommandInfo[] | null {
    if (this.#catalog === undefined) return null;
    const visible = this.#catalog.filter((command) => !this.#terminal.has(command.name));
    if (this.#lastReported !== undefined && sameList(this.#lastReported, visible)) return null;
    this.#lastReported = visible;
    return visible;
  }
}
