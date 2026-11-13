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

/**
 * The characters under test, built from their code points so that no invisible
 * or bidi character is written literally into this file.
 */
const ch = (codePoint: number): string => String.fromCharCode(codePoint);
const NUL = ch(0x00);
const VT = ch(0x0b);
const FF = ch(0x0c);
const ESC = ch(0x1b);
const DEL = ch(0x7f);
const NEL = ch(0x85);
const CSI = ch(0x9b);
const NBSP = ch(0xa0);
const ZWSP = ch(0x200b);
const RLO = ch(0x202e);
const BOM = ch(0xfeff);

/** Escapes a character so the test title names it legibly. */
function codePoint(text: string): string {
  return [...text]
    .map((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return cp >= 0x21 && cp <= 0x7e ? c : `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join('');
}

type CharClass = 's' | 'Cc' | 'Cf';

const CLASS_PATTERNS: Record<CharClass, RegExp> = {
  s: /\s/u,
  Cc: /\p{Cc}/u,
  Cf: /\p{Cf}/u,
};

/**
 * A name containing each character the name rule must reject, one per case,
 * with the classes of the name rule that character falls in. The zero-width
 * space and the right-to-left override are the cases only `\p{Cf}` catches; the
 * NUL and the DEL are the cases only `\p{Cc}` catches; the space and the
 * no-break space are the cases only `\s` catches.
 */
const MUST_DROP_NAMES: readonly (readonly [string, string, readonly CharClass[]])[] = [
  ['a space', 'sir up', ['s']],
  ['a tab', 'sir\tup', ['s', 'Cc']],
  ['a newline', 'sir\nup', ['s', 'Cc']],
  ['a NUL', `sir${NUL}up`, ['Cc']],
  ['a DEL', `sir${DEL}up`, ['Cc']],
  ['a no-break space U+00A0', `sir${NBSP}up`, ['s']],
  ['a zero-width space U+200B', `sir${ZWSP}up`, ['Cf']],
  ['a right-to-left override U+202E', `sir${RLO}up`, ['Cf']],
  ['a byte-order mark U+FEFF', `${BOM}sir`, ['s', 'Cf']],
];

/** Near-misses that look unusual but are one printable token. */
const MUST_KEEP_NAMES: readonly string[] = [
  'sir:sir-up',
  'mcp__srv__tool',
  'résumé',
  '日本語',
  'a.b/c@d',
];

function named(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, description: '', argumentHint: '', aliases: [], ...extra };
}

describe('normalizeSlashCommands: the name rule', () => {
  it.each(MUST_DROP_NAMES.map(([label, name, classes]) => [label, classes.join(' and '), name] as const))(
    'drops a name containing %s (%s)',
    (_label, _classes, name) => {
      expect(normalizeSlashCommands([named('before'), named(name), named('after')])).toEqual([
        named('before'),
        named('after'),
      ]);
    },
  );

  it('labels each must-drop case with exactly the classes its character falls in', () => {
    for (const [label, name, classes] of MUST_DROP_NAMES) {
      const actual = (Object.keys(CLASS_PATTERNS) as CharClass[]).filter((cls) =>
        CLASS_PATTERNS[cls].test(name),
      );
      expect(actual, label).toEqual(classes);
    }
  });

  it('drops an empty name', () => {
    expect(normalizeSlashCommands([named(''), named('kept')])).toEqual([named('kept')]);
  });

  it('keeps plugin-qualified, MCP and non-ASCII names, in order', () => {
    expect(normalizeSlashCommands(MUST_KEEP_NAMES.map((name) => named(name)))).toEqual(
      MUST_KEEP_NAMES.map((name) => named(name)),
    );
  });
});

/** Runs one string through both display fields and returns what each became. */
function display(text: string): [string | undefined, string | undefined] {
  const [command] = normalizeSlashCommands([{ name: 'x', description: text, argumentHint: text }]);
  return [command?.description, command?.argumentHint];
}

describe('normalizeSlashCommands: display text', () => {
  it('the five control characters \\s matches are tab, newline, vertical tab, form feed and CR', () => {
    const controls = [
      ...Array.from({ length: 0x20 }, (_, i) => i),
      ...Array.from({ length: 0x21 }, (_, i) => 0x7f + i),
    ];
    expect(controls.every((cp) => /\p{Cc}/u.test(ch(cp)))).toBe(true);
    expect(controls.filter((cp) => /\s/u.test(ch(cp)))).toEqual([0x09, 0x0a, 0x0b, 0x0c, 0x0d]);
  });

  it.each([
    ['a tab', 'a\tb'],
    ['a newline', 'a\nb'],
    ['a vertical tab', `a${VT}b`],
    ['a form feed', `a${FF}b`],
    ['a carriage return', 'a\rb'],
    ['a CRLF', 'a\r\nb'],
    ['a run of newlines and a tab', 'a\n\n\tb'],
  ])('turns %s into one space in description and argumentHint', (_label, text) => {
    expect(display(text)).toEqual(['a b', 'a b']);
  });

  it.each([
    ['a NUL', `a${NUL}b`],
    ['an ESC', `a${ESC}b`],
    ['a DEL', `a${DEL}b`],
    ['a NEL U+0085, which is \\p{Cc} but not \\s', `a${NEL}b`],
    ['a C1 control U+009B', `a${CSI}b`],
    ['a zero-width space U+200B', `a${ZWSP}b`],
    ['a right-to-left override U+202E', `a${RLO}b`],
    ['a byte-order mark U+FEFF, which is \\s but not a control', `a${BOM}b`],
  ])('removes %s from description and argumentHint', (_label, text) => {
    expect(display(text)).toEqual(['ab', 'ab']);
  });

  it('joins whitespace controls that only a removed character separated into one space', () => {
    // A format character and a NUL between whitespace controls are removed
    // first, so what is left on each side is one run, and one space.
    expect(display(`a\n${ZWSP}\tb`)).toEqual(['a b', 'a b']);
    expect(display(`a\r${NUL}${RLO}\nb`)).toEqual(['a b', 'a b']);
  });

  it('handles every occurrence, not only the first, and does not trim', () => {
    const [command] = normalizeSlashCommands([
      { name: 'x', description: `${RLO}one${NUL}two${ZWSP}\n`, argumentHint: '\t<a>\t<b>\t' },
    ]);
    expect(command?.description).toBe('onetwo ');
    expect(command?.argumentHint).toBe(' <a> <b> ');
  });

  it('leaves ordinary spaces alone beside a whitespace control', () => {
    expect(display('a \nb')).toEqual(['a  b', 'a  b']);
  });

  it('keeps a no-break space, which is \\s but not a control character', () => {
    expect(display(`a${NBSP}b`)).toEqual([`a${NBSP}b`, `a${NBSP}b`]);
  });

  it('keeps ordinary spaces and non-ASCII text intact', () => {
    const description = 'Review the diff, café, 日本語, and <file> paths';
    const argumentHint = '<file> [--all]';
    expect(normalizeSlashCommands([{ name: 'x', description, argumentHint }])).toEqual([
      { name: 'x', description, argumentHint, aliases: [] },
    ]);
  });
});

describe('normalizeSlashCommands: aliases', () => {
  it('drops each alias that fails the name rule and keeps the valid ones in order', () => {
    const aliases = [
      'first',
      ...MUST_DROP_NAMES.map(([, name]) => name),
      'sir:alias',
      '',
      'résumé',
      'last',
    ];
    const [command] = normalizeSlashCommands([named('cmd', { aliases })]);
    expect(command?.aliases).toEqual(['first', 'sir:alias', 'résumé', 'last']);
  });

  it.each(MUST_DROP_NAMES.map(([label, name]) => [label, codePoint(name), name] as const))(
    'drops an alias containing %s (%s)',
    (_label, _shown, alias) => {
      const [command] = normalizeSlashCommands([named('cmd', { aliases: ['ok', alias] })]);
      expect(command?.aliases).toEqual(['ok']);
    },
  );
});
