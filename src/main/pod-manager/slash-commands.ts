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

/**
 * Normalizes an SDK command list. Anything that is not an array is `[]`. An
 * entry that is not an object, or whose `name` is not a non-empty string, is
 * dropped and the rest keep their order. `description` and `argumentHint`
 * become `''` when not a string; `aliases` keeps only its string members, and
 * is `[]` when absent or not an array.
 */
export function normalizeSlashCommands(value: unknown): SlashCommandInfo[] {
  if (!Array.isArray(value)) return [];
  const out: SlashCommandInfo[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) continue;
    const { name, description, argumentHint, aliases } = entry;
    if (typeof name !== 'string' || name.length === 0) continue;
    out.push({
      name,
      description: typeof description === 'string' ? description : '',
      argumentHint: typeof argumentHint === 'string' ? argumentHint : '',
      aliases: Array.isArray(aliases)
        ? (aliases as unknown[]).filter((alias): alias is string => typeof alias === 'string')
        : [],
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
