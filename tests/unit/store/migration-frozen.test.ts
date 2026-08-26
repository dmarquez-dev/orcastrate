/**
 * SHIPPED MIGRATIONS ARE FROZEN — the tripwire for every migration, not just
 * migration 1.
 *
 * `migration-2.test.ts` established the shape: render a migration's template
 * from the IMMUTABLE git blob that shipped it, interpolating the enum arrays
 * read out of that same blob, and diff it against what the current module
 * renders. Nothing about the current file's constants leaks into the expected
 * side, which is exactly what makes a widened live enum visible as a diff
 * instead of invisible.
 *
 * This file generalises that to EVERY migration that has shipped — 1, 2, 3 and
 * 4 today — because migration 1 was not the only one interpolating a live
 * constant and "we checked migration 1" is not a property of the migration
 * list. Migration 1's lane-status list was the second instance of the same
 * latent bug and is the reason this file exists: `MIGRATION_1` interpolated
 * the live `LANE_STATUSES`, so appending `'stopped'` to the contract union
 * rewrote already-shipped DDL for every future FRESH database while every
 * already-migrated database kept the old text — two structurally different v1
 * schemas both claiming `schema_version = 1`.
 *
 * A failure here means a shipped migration's RENDERED TEXT changed. The fix is
 * never to update the expectation: it is to pin the list the migration
 * interpolates and put the widening in a NEW migration.
 */

import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { MIGRATIONS, sqlIn } from '../../../src/main/store/schema';

/**
 * The immutable commit whose `schema.ts` blob shipped each migration.
 *
 * Deliberately commit hashes and NOT `main`: `main` is a moving ref, so the
 * moment this branch merges the expected side would become the actual side and
 * the tripwire would be vacuous. A frozen blob cannot drift, and "the version
 * that shipped" is exactly the semantics wanted.
 *
 * Migration 1's entry repeats the hash `migration-2.test.ts` already uses —
 * the head of `main` when migration 2 was written. `schema.ts` was untouched
 * between the commit that added migration 1 and that one, so the two blobs are
 * identical and this hash keeps the two suites citing one source.
 *
 * WRITING MIGRATION 5? IT GETS AN ENTRY HERE, at the commit that shipped it,
 * and its version joins the `it.each` list below. This map is the whole
 * tripwire: a migration missing from it is not "passing", it is simply not
 * being checked, and that silence is what let migration 1's live
 * `LANE_STATUSES` interpolation rewrite already-shipped DDL unnoticed.
 *
 * Pinning and WATCHING are two separate obligations, and migration 4 is the
 * proof: it met the first and not the second. Its `schema.ts` correctly
 * interpolated a migration-local `MIGRATION_4_LANE_STATUSES` rather than the
 * live union — but nothing in this file recorded that an entry was owed here,
 * so nothing was watching that it stayed pinned. A correct migration is not a
 * checked one. This paragraph is what makes migration 5 a checked one.
 *
 * And when a row here goes red, the fix is NEVER to update the expectation.
 * Red means a shipped migration's rendered text changed, which is the bug, not
 * the alarm. Pin the list that migration interpolates as a migration-local
 * constant and put the widening in a NEW migration.
 */
const SHIPPED_BLOB: Readonly<Record<number, string>> = {
  1: '96f6e925f75c9b101903116a0522c98971e0f347:src/main/store/schema.ts',
  2: '87aa69b:src/main/store/schema.ts',
  3: '16927ac:src/main/store/schema.ts',
  4: 'e15b1c4:src/main/store/schema.ts',
};

const migration = (version: number): string => {
  const found = MIGRATIONS.find((m) => m.version === version);
  if (found === undefined) throw new Error(`no migration ${version}`);
  return found.sql;
};

/** The named `as const` array literal as the shipped blob declared it. */
function readEnum(source: string, name: string): string[] {
  const match = new RegExp(`(?:export )?const ${name} = (\\[[\\s\\S]*?\\]) as const`).exec(source);
  if (match?.[1] === undefined) {
    throw new Error(`could not read ${name} from the shipped schema.ts blob`);
  }
  const json = match[1].replace(/'/g, '"').replace(/,(\s*])/g, '$1');
  return JSON.parse(json) as string[];
}

/**
 * Renders migration `version` exactly as the module that SHIPPED it rendered
 * it: its template literal and every enum array it interpolates are both read
 * out of the git blob, then evaluated with the same `sqlIn` that module used.
 *
 * The interpolated names are discovered from the template itself rather than
 * hard-coded, so a migration that interpolates a constant nobody remembered is
 * still covered.
 */
function shippedMigration(version: number): string {
  const ref = SHIPPED_BLOB[version];
  if (ref === undefined) throw new Error(`no shipped blob recorded for migration ${version}`);

  const source = execFileSync('git', ['show', ref], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });

  const template = new RegExp(`const MIGRATION_${version} = \`([\\s\\S]*?)\`;`).exec(source);
  if (template?.[1] === undefined) {
    throw new Error(`could not read MIGRATION_${version} from the shipped schema.ts blob`);
  }
  const body = template[1];

  const names = [...new Set([...body.matchAll(/\$\{sqlIn\(([A-Za-z0-9_]+)\)\}/g)].map((m) => m[1] as string))];
  const values = names.map((name) => readEnum(source, name));

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const render = new Function('sqlIn', ...names, `return \`${body}\`;`) as (
    fn: typeof sqlIn,
    ...enums: string[][]
  ) => string;

  return render(sqlIn, ...values);
}

describe('every shipped migration renders byte-identically to the blob that shipped it', () => {
  it.each([1, 2, 3, 4])('migration %i', (version) => {
    expect(migration(version)).toBe(shippedMigration(version));
  });

  it('the renderer is not vacuous: it really interpolates something', () => {
    // If `shippedMigration` silently rendered an empty string or skipped its
    // interpolation the tests above would pass for the wrong reason.
    expect(shippedMigration(1)).toContain(
      `CHECK (status IN ${sqlIn(['running', 'done', 'orphaned'])})`,
    );
    expect(shippedMigration(1)).toContain(
      `CHECK (permission_mode IN ${sqlIn(['default', 'plan', 'bypassPermissions'])})`,
    );
    expect(shippedMigration(3)).toContain(
      `CHECK (status IN ${sqlIn(['closed', 'idle', 'running', 'waiting', 'beached'])})`,
    );
    // Migration 4 rebuilt `lanes` around the widened lane-status list, so its
    // rendered text must name all four — including the `'stopped'` whose
    // arrival is what made this file necessary.
    expect(shippedMigration(4)).toContain(
      `CHECK (status IN ${sqlIn(['running', 'done', 'orphaned', 'stopped'])})`,
    );
  });

  it("migration 1 still names exactly the three lane statuses it shipped with, not the four we now expose", () => {
    expect(migration(1)).toContain(`CHECK (status IN ${sqlIn(['running', 'done', 'orphaned'])})`);
    expect(migration(1)).not.toContain('stopped');
  });
});
