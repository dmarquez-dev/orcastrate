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
 * This file generalises that to EVERY migration that has shipped — 1 through 7
 * today — because migration 1 was not the only one interpolating a live
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
 * Migration 1's entry is the head of `main` when migration 2 was written — the
 * hash `migration-2.test.ts` once used for its own migration 1 check, which
 * this file has since subsumed. `schema.ts` was untouched between the commit
 * that added migration 1 and that one, so the two blobs are identical.
 *
 * Migrations 1 through 7 are the checked set today.
 *
 * WRITING MIGRATION 8? IT GETS AN ENTRY HERE, at the commit that shipped it,
 * and its version joins the `it.for` list below. This map is the whole
 * tripwire: a migration missing from it is not "passing", it is simply not
 * being checked, and that silence is what let migration 1's live
 * `LANE_STATUSES` interpolation rewrite already-shipped DDL unnoticed.
 *
 * Pinning and WATCHING are two separate obligations, and migration 4 is the
 * proof: it met the first and not the second. Its `schema.ts` correctly
 * interpolated a migration-local `MIGRATION_4_LANE_STATUSES` rather than the
 * live union — but nothing in this file recorded that an entry was owed here,
 * so nothing was watching that it stayed pinned. A correct migration is not a
 * checked one. Migrations 5 and 6 shipped without entries here and were
 * given theirs afterwards; this paragraph is what makes migration 8 a
 * checked one.
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
  5: '0cfb633:src/main/store/schema.ts',
  6: '0fc6ec4:src/main/store/schema.ts',
  7: '95f7411:src/main/store/schema.ts',
};

/**
 * Whether this checkout is a shallow clone, whose truncated history need not
 * hold the commits `SHIPPED_BLOB` names, so `git show` cannot be relied on.
 *
 * That is the ONE condition under which the blob-reading tests skip. It is
 * asked of git directly rather than inferred from `git show` failing, so a
 * full clone with a `SHIPPED_BLOB` ref that does not resolve still fails red:
 * a typo'd or rewritten hash is a broken tripwire, not missing history.
 */
const SHALLOW_CLONE =
  execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim() === 'true';

const SHALLOW_SKIP_NOTE =
  'shallow clone: the shipped schema.ts blobs in SHIPPED_BLOB are unavailable without full history';

// The skip note renders beside each skipped test only where the reporter lists
// tests individually, which a non-TTY default-reporter run of a passing file
// does not. Saying it once on stderr keeps the reason visible there too.
if (SHALLOW_CLONE) console.warn(`migration-frozen: blob tests skipped — ${SHALLOW_SKIP_NOTE}`);

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
  it.for([1, 2, 3, 4, 5, 6, 7])('migration %i', (version, ctx) => {
    ctx.skip(SHALLOW_CLONE, SHALLOW_SKIP_NOTE);
    expect(migration(version)).toBe(shippedMigration(version));
  });

  it('the renderer is not vacuous: it really interpolates something', (ctx) => {
    ctx.skip(SHALLOW_CLONE, SHALLOW_SKIP_NOTE);
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
    // Migration 6 interpolates its own pinned permission-mode and pod-status
    // lists, so the six-mode CHECK it widened to must render from the blob.
    expect(shippedMigration(6)).toContain(
      `CHECK (permission_mode IN ${sqlIn(['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk', 'auto'])})`,
    );
    // Migration 7 adds `lanes.resumed_at`, so the column it adds must render
    // from the blob that shipped it.
    expect(shippedMigration(7)).toContain('resumed_at');
  });

  it("migration 1 still names exactly the three lane statuses it shipped with, not the four we now expose", () => {
    expect(migration(1)).toContain(`CHECK (status IN ${sqlIn(['running', 'done', 'orphaned'])})`);
    expect(migration(1)).not.toContain('stopped');
  });
});
