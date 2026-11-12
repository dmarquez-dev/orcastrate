/**
 * `normalizeSlashCommands`: what main makes of whatever the SDK sends for a
 * command list, before any of it can reach the renderer.
 */

import { describe, expect, it } from 'vitest';

import {
  normalizeSlashCommands,
  SLASH_COMMANDS_READ_TIMEOUT_MS,
} from '../../../src/main/pod-manager';

describe('SLASH_COMMANDS_READ_TIMEOUT_MS', () => {
  it('is ten seconds', () => {
    expect(SLASH_COMMANDS_READ_TIMEOUT_MS).toBe(10_000);
  });
});

describe('normalizeSlashCommands', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a plain object', { name: 'review', description: 'x', argumentHint: '' }],
    ['a string', 'review'],
  ])('normalizes %s, which is not an array, to []', (_label, value) => {
    expect(normalizeSlashCommands(value)).toEqual([]);
  });

  it('drops entries that are not objects or lack a non-empty string name, keeping the rest in order', () => {
    const a = { name: 'alpha', description: 'first', argumentHint: '<file>', aliases: ['al'] };
    const b = { name: 'beta', description: 'second', argumentHint: '', aliases: [] };

    expect(normalizeSlashCommands([a, null, { name: '' }, { name: 7 }, b])).toEqual([
      { name: 'alpha', description: 'first', argumentHint: '<file>', aliases: ['al'] },
      { name: 'beta', description: 'second', argumentHint: '', aliases: [] },
    ]);
  });

  it("turns a non-string description and argumentHint into ''", () => {
    expect(
      normalizeSlashCommands([{ name: 'gamma', description: 42, argumentHint: { hint: true } }]),
    ).toEqual([{ name: 'gamma', description: '', argumentHint: '', aliases: [] }]);
  });

  it('makes aliases [] when absent or not an array', () => {
    expect(
      normalizeSlashCommands([
        { name: 'absent', description: '', argumentHint: '' },
        { name: 'string', description: '', argumentHint: '', aliases: 'st' },
        { name: 'object', description: '', argumentHint: '', aliases: { 0: 'ob' } },
      ]).map((command) => command.aliases),
    ).toEqual([[], [], []]);
  });

  it('keeps only the string members of an aliases array, in their original order', () => {
    const [command] = normalizeSlashCommands([
      { name: 'usage', description: '', argumentHint: '', aliases: ['cost', 3, null, 'stats', {}] },
    ]);
    expect(command?.aliases).toEqual(['cost', 'stats']);
  });
});
