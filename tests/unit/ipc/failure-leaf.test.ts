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

/** Every `import ... from '...'` statement in the file, comments stripped. */
function importStatements(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  return code.match(/^import[\s\S]*?from\s*'[^']*';/gm) ?? [];
}

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
    const [only] = imports;
    expect(only).toMatch(/^import type\s/);
    expect(only).toMatch(/from '\.\.\/\.\.\/shared\/contracts\/ipc';$/);
  });

  it('imports no value from anywhere', () => {
    for (const statement of importStatements(source)) {
      expect(statement, `value import in the leaf: ${statement}`).toMatch(/^import type\s/);
    }
  });

  it('reaches neither ../pod, ../store, electron nor any node builtin', () => {
    const forbidden = ["'../pod", "'../store", "'electron'", "'node:"];
    for (const statement of importStatements(source)) {
      for (const needle of forbidden) {
        expect(statement, `leaf reaches ${needle}: ${statement}`).not.toContain(needle);
      }
    }
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
      const fromLeaf = statements.filter((s) => s.endsWith(`from '${specifier}';`));
      expect(fromLeaf, `no import from ${specifier}`).not.toHaveLength(0);
      for (const statement of statements) {
        expect(statement, `still importing the classifier: ${statement}`).not.toMatch(
          /from '(\.\/errors|\.\.\/ipc\/errors)';$/,
        );
      }
    });
  }

  it('leaves handlers.ts importing ./errors, which still holds fail and ok', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/main/ipc/handlers.ts', import.meta.url)),
      'utf8',
    );
    expect(importStatements(source).some((s) => s.endsWith("from './errors';"))).toBe(true);
  });
});
