/**
 * `src/main/ipc/failure.ts` is a LEAF, and this file is the thing that keeps it
 * one.
 *
 * `./errors.ts` imports `PodRunnerError` from `../pod` and `EventStoreError`
 * from `../store` as VALUES, because `toIpcError` needs the constructors for
 * its `instanceof` checks. So every importer of `./errors.ts` pulls both
 * subsystems into its module graph whether or not it wants them. Modules that
 * only RAISE a failure — `./validate.ts`, `../pod-manager/pod-manager.ts`,
 * `../beachcomber/service.ts`, `../helm/helm-service.ts` — import the leaf
 * instead, and that isolation is only real while the leaf stays value-free.
 *
 * A REGRESSION HERE IS INVISIBLE AT RUNTIME. Adding `import { X } from '../pod'`
 * to `failure.ts` breaks nothing observable; it silently re-attaches the whole
 * subsystem to four modules that had shed it. Nothing but a source scan catches
 * that, so the scan is here.
 *
 * The second property — exactly ONE `IpcFailure` class in the process — is the
 * other half. A parallel declaration in `errors.ts` would typecheck, would pass
 * every test that constructs and catches through the same path, and would make
 * `toIpcError` answer INTERNAL for a failure raised through the other one. The
 * test below constructs through the leaf and classifies through `errors.ts`,
 * which is exactly the crossing a second class would break.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { toIpcError } from '../../../src/main/ipc/errors';
import {
  cwdMissing,
  invalidArgument,
  IpcFailure,
  IPC_ERROR_CODES,
  notFound,
} from '../../../src/main/ipc/failure';

const LEAF = fileURLToPath(new URL('../../../src/main/ipc/failure.ts', import.meta.url));

/**
 * Every static import statement in the file, comments stripped: `import ...
 * from <specifier>`, and the bare side-effect `import <specifier>`, with the
 * specifier in single or double quotes and the trailing `;` optional.
 *
 * `import` must be followed by whitespace, `{`, `*` or a quote, so a line that
 * opens with an identifier such as `importStatements(` is not a statement. The
 * clause before `from` may span lines but holds no quote or `;`, which keeps one
 * match from running on into the next statement.
 */
function importStatements(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  return code.match(/^import(?:\s*|[\s{*][^;'"]*?\bfrom\s*)(['"])[^'"\n]*\1[ \t]*;?/gm) ?? [];
}

/** The module specifier of one statement `importStatements` returned. */
function specifierOf(statement: string): string {
  const specifier = /(['"])([^'"\n]*)\1[ \t]*;?$/.exec(statement)?.[2];
  if (specifier === undefined) throw new Error(`no specifier in: ${statement}`);
  return specifier;
}

/**
 * Runs `check` over every statement, and FAILS when there are none. A loop over
 * an empty list asserts nothing, so a scan that stopped seeing imports would
 * otherwise turn every per-statement assertion green.
 */
function eachStatement(statements: readonly string[], check: (statement: string) => void): void {
  expect(statements, 'the scan found no import statement to check').not.toHaveLength(0);
  for (const statement of statements) check(statement);
}

/**
 * The scan is the only thing between `failure.ts` and a silent re-attachment of
 * `../pod`, so it is checked on its own before anything trusts what it returns:
 * forms it must see, and near-misses it must not.
 */
describe('importStatements sees every import form and nothing else (D2)', () => {
  it('returns the shipped statement of failure.ts', () => {
    expect(importStatements(readFileSync(LEAF, 'utf8'))).toEqual([
      "import type { IpcErrorCode } from '../../shared/contracts/ipc';",
    ]);
  });

  it('returns a bare side-effect import', () => {
    expect(importStatements("import '../pod';\nexport const a = 1;\n")).toEqual([
      "import '../pod';",
    ]);
  });

  it('returns an import whose specifier is double-quoted', () => {
    expect(importStatements('import { X } from "../pod";\nexport const a = 1;\n')).toEqual([
      'import { X } from "../pod";',
    ]);
  });

  it('returns a statement with no semicolon that ends its line', () => {
    expect(
      importStatements("import type { X } from '../pod'\nexport const a = 1;\n"),
    ).toEqual(["import type { X } from '../pod'"]);
  });

  it('returns a multi-line import as one statement', () => {
    expect(
      importStatements("import {\n  A,\n  type B,\n} from '../pod';\nexport const a = 1;\n"),
    ).toEqual(["import {\n  A,\n  type B,\n} from '../pod';"]);
  });

  it('ignores an import inside a line comment', () => {
    expect(importStatements("// import x from '../pod';\nexport const a = 1;\n")).toEqual([]);
  });

  it('ignores an import inside a block comment', () => {
    expect(
      importStatements("/*\nimport x from '../pod';\n*/\nexport const a = 1;\n"),
    ).toEqual([]);
  });

  it('ignores a line that opens with an identifier beginning import', () => {
    expect(importStatements("importStatements(source);\nconst b = '../pod';\n")).toEqual([]);
  });

  it('reads the specifier whatever the quotes and with or without a semicolon', () => {
    expect(specifierOf("import '../pod';")).toBe('../pod');
    expect(specifierOf('import { X } from "../pod";')).toBe('../pod');
    expect(specifierOf("import type { X } from '../pod'")).toBe('../pod');
  });

  it('fails a per-statement check that is handed no statements', () => {
    expect(() => eachStatement([], () => undefined)).toThrow(
      /the scan found no import statement to check/,
    );
  });
});

describe('src/main/ipc/failure.ts is a leaf (contract section 9, X1)', () => {
  const source = readFileSync(LEAF, 'utf8');

  it('declares the five names the contract names', () => {
    for (const name of [
      'IPC_ERROR_CODES',
      'IpcFailure',
      'invalidArgument',
      'notFound',
      'cwdMissing',
    ]) {
      expect(source, `failure.ts must export ${name}`).toMatch(
        new RegExp(`export (const|class|function) ${name}\\b`),
      );
    }
  });

  it('has exactly one import, and it is type-only from the shared IPC contract', () => {
    const imports = importStatements(source);
    expect(imports).toHaveLength(1);
    const [only = ''] = imports;
    expect(only).toMatch(/^import type\s/);
    expect(specifierOf(only)).toBe('../../shared/contracts/ipc');
  });

  it('imports no value from anywhere', () => {
    eachStatement(importStatements(source), (statement) => {
      expect(statement, `value import in the leaf: ${statement}`).toMatch(/^import type\s/);
    });
  });

  it('reaches neither ../pod, ../store, electron nor any node builtin', () => {
    const forbidden: ReadonlyArray<readonly [string, (specifier: string) => boolean]> = [
      ['../pod', (s) => s === '../pod' || s.startsWith('../pod/')],
      ['../store', (s) => s === '../store' || s.startsWith('../store/')],
      ['electron', (s) => s === 'electron'],
      ['node:*', (s) => s.startsWith('node:')],
    ];
    eachStatement(importStatements(source), (statement) => {
      const specifier = specifierOf(statement);
      for (const [name, reaches] of forbidden) {
        expect(reaches(specifier), `leaf reaches ${name}: ${statement}`).toBe(false);
      }
    });
  });
});

describe('there is exactly one IpcFailure class (contract section 9, X2)', () => {
  it('classifies a leaf-constructed failure by its own code, not INTERNAL', () => {
    // Constructed through `failure.ts`, classified through `errors.ts`. A
    // second, parallel class in `errors.ts` would answer INTERNAL here.
    for (const code of IPC_ERROR_CODES) {
      const failure = new IpcFailure(code, `${code} raised through the leaf`);
      expect(toIpcError(failure).code, `${code} lost its code across the module boundary`).toBe(
        code,
      );
    }
  });

  it('classifies each leaf constructor by its own code', () => {
    expect(toIpcError(invalidArgument('bad shape')).code).toBe('INVALID_ARGUMENT');
    expect(toIpcError(notFound('no such id')).code).toBe('NOT_FOUND');
    expect(toIpcError(cwdMissing('gone')).code).toBe('CWD_MISSING');
  });

  it('is the same class object the errors.ts re-export hands back', async () => {
    const viaErrors = await import('../../../src/main/ipc/errors');
    const viaBarrel = await import('../../../src/main/ipc');
    expect(viaErrors.IpcFailure).toBe(IpcFailure);
    expect(viaBarrel.IpcFailure).toBe(IpcFailure);
    expect(viaErrors.IPC_ERROR_CODES).toBe(IPC_ERROR_CODES);
  });
});

describe('IPC_ERROR_CODES is unchanged in value and in order (X3)', () => {
  it('is the nine documented codes in their documented order', () => {
    expect(IPC_ERROR_CODES).toEqual([
      'NOT_FOUND',
      'CONFLICT',
      'INVALID_ARGUMENT',
      'CWD_MISSING',
      'SPAWN_FAILED',
      'NOT_RUNNING',
      'IO',
      'UNSUPPORTED',
      'INTERNAL',
    ]);
  });
});

describe('the consumers this task owns import the leaf, not the classifier (X4)', () => {
  const owned: ReadonlyArray<readonly [string, string]> = [
    ['../../../src/main/ipc/validate.ts', './failure'],
    ['../../../src/main/pod-manager/pod-manager.ts', '../ipc/failure'],
  ];

  for (const [relative, specifier] of owned) {
    it(`${relative} imports its failure constructors from ${specifier}`, () => {
      const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
      const statements = importStatements(source);
      const fromLeaf = statements.filter((s) => specifierOf(s) === specifier);
      expect(fromLeaf, `no import from ${specifier}`).not.toHaveLength(0);
      eachStatement(statements, (statement) => {
        expect(specifierOf(statement), `still importing the classifier: ${statement}`).not.toMatch(
          /^(\.\/errors|\.\.\/ipc\/errors)$/,
        );
      });
    });
  }

  it('leaves handlers.ts importing ./errors, which still holds fail and ok', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/main/ipc/handlers.ts', import.meta.url)),
      'utf8',
    );
    expect(importStatements(source).some((s) => specifierOf(s) === './errors')).toBe(true);
  });
});
