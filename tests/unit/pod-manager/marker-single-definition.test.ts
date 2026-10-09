/**
 * ONE DECLARATION OF THE STARTUP-RECONCILIATION MARKER, repository-wide.
 *
 * THE DEFECT THIS GUARD EXISTS FOR, reproduced on 2026-10-09 against the tree
 * at `a186f06`: the marker was declared twice — once by the boot sweep in
 * `src/main/pod-manager/startup-reconciliation.ts` and once by the renderer's
 * transcript filter — and nothing in the renderer program read the producer.
 * Renaming the producer's value to `startup_reconciliation_v2` left all 199
 * tests under `src/renderer/src/transcript` GREEN while the reconciliation
 * notice went back to being hidden by the default filter. That notice is the
 * only explanation a user ever gets for why their lanes read Orphaned after a
 * relaunch, and escalation E5 exists to keep it visible.
 *
 * Criteria 2 and 3 of this task close that gap by making both sites re-export
 * one definition under `src/shared/**`, which both tsconfig programs include.
 * THIS FILE IS WHAT KEEPS IT CLOSED. A copy can reappear in either tree at any
 * time — and a copy is undetectable by any test of either side alone, because
 * each side agrees with itself. Only a scan over the source can see two
 * declarations at once, so the rule is enforced here rather than asserted
 * anywhere that reads a value.
 *
 * WHY NOT A PAIR OF `toBe` REFERENCE PINS instead, one per program. Because
 * once both sites re-export the shared binding, such a pin compares a value to
 * itself and cannot fail on this session's own output. The regression it was
 * meant to catch is the reappearance of a COPY, and that is a property of the
 * source text, not of any runtime value. It is caught here, once, for the
 * whole repository.
 *
 * THE NEEDLE IS ASSEMBLED FROM FRAGMENTS so this file is not its own
 * violation, the matcher is proved against synthetic samples before it is
 * trusted, and the walk's own file list is asserted non-empty — a hygiene rule
 * that cannot fire is worse than no rule. The same discipline, and the same
 * `RETIRED_LITERAL_EXEMPT_FILES` exemption shape, as
 * `src/renderer/src/__tests__/hygiene.test.ts`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Anchored on this file's own location, the idiom `tests/unit/helm/hygiene.ts`
 * and `tests/unit/beachcomber/no-destructive-api.test.ts` already use — not on
 * `process.cwd()`, which is the runner's choice and not the repository's.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
  .replace(/\\/g, '/')
  .replace(/\/$/, '');

/** The trees that hold shipped and test source. `.dir-sdlc/` is excluded on
 *  purpose: it archives earlier sessions' frozen contract artifacts verbatim,
 *  which are a record of what was agreed and not code anything imports. */
const SCANNED_TREES: readonly string[] = ['src', 'tests', 'probe'];

/**
 * Assembled from fragments, like every needle in `hygiene.test.ts`, so that
 * this guard does not report itself.
 */
const MARKER = 'startup' + '_reconciliation';

/**
 * THE ONE MODULE ALLOWED TO DECLARE IT. Named rather than counted, so a
 * failure says which definition survived as well as how many there are.
 */
const DECLARING_MODULE = 'src/shared/startup-reconciliation-notice.ts';

/**
 * Files permitted to carry the bare literal WITHOUT declaring it.
 *
 * THE EXTENSION POINT IS THIS LIST AND NOTHING ELSE — a further exception is
 * added by naming the file and writing the argument down, never by relaxing
 * the rule to a glob, which would exempt every suite written afterwards
 * without anyone deciding to.
 *
 * `transcript-filter.test.ts` is the only entry, and it carries two kinds of
 * occurrence that both have to stay spelled out:
 *
 *   - NEAR MISSES AND NEGATIVE CASES. A `subtype` that is the marker plus a
 *     version suffix, the marker handed to the filter as a `data` STRING
 *     rather than as
 *     `data.subtypeMarker`, and the marker as the `text` of a `thinking`
 *     event. Each proves the exemption is an exemption and not a capitulation,
 *     and each has to be written as a literal to be a near miss at all —
 *     reading the const would make them the positive case.
 *   - ONE POSITIVE VALUE PIN, `expect(STARTUP_RECONCILIATION_SUBTYPE).toBe(…)`.
 *     The marker is written into the durable event record, so its value is
 *     still worth pinning as a value; reading the const on both sides of that
 *     assertion would make it compare a value to itself.
 */
const LITERAL_EXEMPT_FILES: readonly string[] = [
  'src/renderer/src/transcript/transcript-filter.test.ts',
];

/**
 * A DECLARATION of the marker: a binding introduced and assigned the literal,
 * with the closing quote required so a longer string that merely starts the
 * same way is not a declaration of this marker.
 */
function declarationMatcher(): RegExp {
  return new RegExp(`\\b(?:const|let|var)\\s+\\w+\\s*(?::[^=]*)?=\\s*['"]${MARKER}['"]`);
}

/** The literal itself, anywhere — declaration or not. */
function literalMatcher(): RegExp {
  return new RegExp(`['"]${MARKER}`);
}

function filesUnder(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function scannedFiles(): string[] {
  return SCANNED_TREES.flatMap((tree) => filesUnder(`${ROOT}/${tree}`));
}

function relative(file: string): string {
  return file.slice(ROOT.length + 1);
}

/**
 * Comments are prose. A docblock has to be able to NAME the marker it is
 * explaining — only a live declaration is the defect — so every rule below
 * reads CODE, the same distinction `hygiene.test.ts` draws for the same
 * reason.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the marker-declaration matcher', () => {
  it('fires on a declaration in any spelling and on none of the near misses', () => {
    const declares = declarationMatcher();

    // The three spellings a copy would actually arrive in, including the
    // `as const` one the producer used and the annotated one.
    expect(declares.test(`export const STARTUP_RECONCILIATION_SUBTYPE = '${MARKER}' as const;`)).toBe(
      true,
    );
    expect(declares.test(`const SUBTYPE = '${MARKER}';`)).toBe(true);
    expect(declares.test(`const SUBTYPE: string = "${MARKER}";`)).toBe(true);

    // And on none of the shapes that are NOT a second definition.
    expect(declares.test(`const SUBTYPE = STARTUP_RECONCILIATION_SUBTYPE;`)).toBe(false);
    expect(declares.test(`expect(SUBTYPE).toBe('${MARKER}');`)).toBe(false);
    expect(declares.test(`{ subtype: '${MARKER}' }`)).toBe(false);
    // A longer id that merely starts the same way is a different marker.
    expect(declares.test(`const SUBTYPE = '${MARKER}_v2';`)).toBe(false);

    // The needle really is the marker, and it is assembled, not written.
    expect(MARKER).toBe('startup' + '_reconciliation');
  });

  it('reads code and not prose', () => {
    const declares = declarationMatcher();
    expect(declares.test(stripComments(`/* const SUBTYPE = '${MARKER}'; */`))).toBe(false);
    expect(declares.test(stripComments(`// const SUBTYPE = '${MARKER}';`))).toBe(false);
    expect(declares.test(stripComments(`const SUBTYPE = '${MARKER}';`))).toBe(true);
  });
});

describe('the startup-reconciliation marker has exactly one definition', () => {
  it('walks a tree that exists', () => {
    // Without this the rules below report "clean" for a path that does not
    // exist, which is the vacuity this whole session is about. 314 files were
    // counted on 2026-10-09 by `find src tests probe -name '*.ts' -o -name
    // '*.tsx' | wc -l`; the floor is deliberately well under it.
    expect(scannedFiles().length).toBeGreaterThan(300);
    for (const tree of SCANNED_TREES) {
      expect(filesUnder(`${ROOT}/${tree}`).length, `${tree}/ is empty`).toBeGreaterThan(0);
    }
  });

  it('is declared in exactly one module, and that module is the shared one', () => {
    const declares = declarationMatcher();
    const declaring: string[] = [];
    for (const file of scannedFiles()) {
      if (declares.test(stripComments(readFileSync(file, 'utf-8')))) declaring.push(relative(file));
    }
    expect(declaring.sort()).toEqual([DECLARING_MODULE]);
  });

  it('is carried as a bare literal nowhere but the exemptions', () => {
    const files = scannedFiles();
    const carries = literalMatcher();

    // Each exemption names a file that EXISTS and that really does carry the
    // literal in code. A stale exemption is how a deny-list quietly stops
    // covering anything, so it is checked rather than trusted.
    for (const exempt of LITERAL_EXEMPT_FILES) {
      const match = files.find((file) => relative(file) === exempt);
      expect(match, `${exempt} is exempted but not present`).toBeDefined();
      const text = stripComments(readFileSync(match as string, 'utf-8'));
      expect(carries.test(text), `${exempt} is exempted but carries no literal in CODE`).toBe(true);
    }

    const offenders: string[] = [];
    for (const file of files) {
      const path = relative(file);
      if (path === DECLARING_MODULE) continue;
      if (LITERAL_EXEMPT_FILES.includes(path)) continue;
      if (carries.test(stripComments(readFileSync(file, 'utf-8')))) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });
});
