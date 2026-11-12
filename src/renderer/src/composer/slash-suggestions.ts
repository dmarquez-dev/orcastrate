/**
 * Which slash commands the composer offers for a draft. Pure: no state, no
 * React, no IPC.
 *
 * The rules, in full:
 * - The draft must match /^\/(\S*)$/: a leading `/` and no whitespace after
 *   it anywhere, a newline included. Anything else offers nothing.
 * - A command matches when its `name`, or any one of its `aliases`, starts
 *   with the captured text after `/`. Case-sensitive. A bare `/` captures
 *   `''`, which every command matches.
 * - The result is the first `SLASH_SUGGESTION_LIMIT` matches, in the order of
 *   `commands`. Each entry is the command object itself, so an alias match
 *   still carries the canonical `name`.
 */

import type { SlashCommandInfo } from '@shared/contracts/ipc';

/** The most rows the suggestion list ever shows. */
export const SLASH_SUGGESTION_LIMIT = 5;

const SLASH_DRAFT = /^\/(\S*)$/;

export function matchSlashCommands(
  text: string,
  commands: readonly SlashCommandInfo[],
): SlashCommandInfo[] {
  const draft = SLASH_DRAFT.exec(text);
  if (draft === null) return [];
  // The capture group is unconditional in the pattern, so a match always
  // carries it; a missing one would mean the pattern changed.
  const prefix = draft[1];
  if (prefix === undefined) throw new Error('slash draft pattern matched without its prefix group');

  const matches: SlashCommandInfo[] = [];
  for (const candidate of commands) {
    if (matches.length === SLASH_SUGGESTION_LIMIT) break;
    if (candidate.name.startsWith(prefix) || candidate.aliases.some((alias) => alias.startsWith(prefix))) {
      matches.push(candidate);
    }
  }
  return matches;
}
