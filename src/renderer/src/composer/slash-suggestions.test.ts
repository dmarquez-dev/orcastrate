/**
 * The slash-command matcher, as a pure function of the draft and the list.
 *
 * The rules under test: the draft opens suggestions only when it is a leading
 * `/` followed by no whitespace at all; a command matches when its `name` or
 * one of its `aliases` starts with the text after `/`, case-sensitively; and
 * at most the first five matches come back, in the order of the input list.
 */

import { describe, expect, it } from 'vitest';

import type { SlashCommandInfo } from '@shared/contracts/ipc';

import { matchSlashCommands } from './slash-suggestions';

function command(name: string, aliases: string[] = []): SlashCommandInfo {
  return { name, description: `${name} description`, argumentHint: '', aliases };
}

describe('matchSlashCommands', () => {
  it("returns exactly the first five of seven commands, in input order, for a bare '/'", () => {
    const commands = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'].map((name) => command(name));
    const shown = matchSlashCommands('/', commands);
    expect(shown).toHaveLength(5);
    expect(shown).toEqual(commands.slice(0, 5));
    commands.slice(0, 5).forEach((expected, index) => expect(shown[index]).toBe(expected));
  });

  it("returns exactly the commands whose name starts with 'co', in input order, for '/co'", () => {
    const compact = command('compact');
    const config = command('config');
    const cost = command('cost');
    const commands = [command('clear'), compact, command('help'), config, command('scope'), cost];
    expect(matchSlashCommands('/co', commands)).toEqual([compact, config, cost]);
  });

  it("matches a command by alias and returns that command object itself, not a copy renamed to the alias, for '/st'", () => {
    const usage = command('usage', ['stats']);
    const shown = matchSlashCommands('/st', [command('help'), usage, command('review')]);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toBe(usage);
    expect(shown[0]?.name).toBe('usage');
  });

  it.each(['compact', ' /compact', '/compact now', '/com\npact'])(
    'returns [] for %j, which is not a leading slash followed by no whitespace',
    (text) => {
      expect(matchSlashCommands(text, [command('compact')])).toEqual([]);
    },
  );

  it("returns [] for '/C' against 'compact': the match is case-sensitive", () => {
    expect(matchSlashCommands('/C', [command('compact')])).toEqual([]);
  });

  it("returns [] for '/zz' when no name or alias starts with 'zz'", () => {
    expect(matchSlashCommands('/zz', [command('compact', ['zip']), command('usage', ['stats'])])).toEqual([]);
  });
});
