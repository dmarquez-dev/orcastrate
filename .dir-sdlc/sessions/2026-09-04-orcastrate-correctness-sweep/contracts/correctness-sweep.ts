/**
 * FROZEN AT GATE 2 - session 2026-09-04-orcastrate-correctness-sweep (sub-session C2).
 *
 * NINE CORRECTNESS ITEMS, NOT A FEATURE. Every one has a known site and a known
 * shape, and every one was approved by the user at Gate 1. Nothing here adds a
 * user-visible capability; six of the nine change behaviour that is already
 * wrong, two change words, one moves a declaration.
 *
 * ONE AMENDMENT TO AN ALREADY-FROZEN FILE, and it is comment-only:
 *
 *   - `src/shared/contracts/beachcomber.ts` (frozen 2026-08-19), section 8.
 *
 * That file's `refused` docblock says the array covers ids "unknown to this
 * scan". The shipped service throws `NOT_FOUND` for an unknown or stale id, and
 * the SAME FILE's service docblock (~line 301) and header REQUIRE it to. The
 * comment is the thing that is wrong, so the comment is the thing that changes.
 * A consumer coding to it would wait for a `refused` entry that never arrives.
 * The user approved this at Gate 1 as scope; it is an authorised amendment, not
 * a new escalation, and T1 records it as one in the file itself.
 *
 * Sections 1, 2, 3, 8 and 9 are the main process. Sections 4, 5, 6 and 7 are the
 * renderer. NO PUBLIC TYPE IN ANY FROZEN CONTRACT CHANGES SHAPE IN THIS SESSION.
 * Every section below is either a behavioural rule, a prose correction, or a
 * module-placement change. Anything that would change a declared type is a
 * contract-change escalation and stops the task.
 *
 * Implementers build against THIS FILE. Nobody edits it after Gate 2; a task
 * that needs it changed stops and escalates.
 */

import type { PodDirectory } from '@shared/contracts/panel-host';
import type { BeachcomberEntry, BeachcomberRootKey } from '@shared/contracts/beachcomber';

// ---------------------------------------------------------------------------
// 1. Same-millisecond backup overwrite  (T2, backend)
//    src/main/helm/atomic-write.ts
// ---------------------------------------------------------------------------

/**
 * `backupPathFor(targetPath, now)` is FULLY DETERMINED by the injected clock,
 * and `backupBeforeWrite` copies with `helmFs.copyFileSync`, which clobbers.
 * Two saves whose `deps.now()` lands in the same millisecond therefore produce
 * the same backup path and the second copy destroys the first backup - the
 * exact content rule 2 exists to preserve.
 *
 * THE SHARPEST CONSTRAINT IN THIS ITEM IS THE FILE'S OWN DOCBLOCK. It states
 * that both names are DETERMINISTIC in `now`, and three test sites recompute
 * `backupPathFor(...)` and compare against what the service produced
 * (`tests/unit/helm/write-safety.test.ts:49`, `:87`, `:136`). A fix that makes
 * the name depend on anything those call sites cannot reproduce breaks all
 * three. So the property is PRESERVED rather than retired, in the narrowed form
 * P2 below, and the docblock is updated to state the narrowed form.
 *
 * FOUR PROPERTIES. The mechanism is the implementer's; these are the contract.
 *
 *   P1  DISTINCTNESS. Two successful `save` calls that produce the same
 *       `backupStamp(now)` for the same target produce two DISTINCT backup
 *       files, and neither overwrites the other. Both are readable afterwards
 *       and each holds the content that was on disk immediately before its own
 *       write.
 *
 *   P2  FIRST-BACKUP DETERMINISM, PRESERVED. `backupPathFor(targetPath, now)`
 *       keeps its exported name and its two-parameter signature, and keeps
 *       returning exactly the string it returns today. It names the FIRST
 *       backup taken at that stamp. A test that computes it and compares
 *       against a single save at that clock value keeps passing UNCHANGED -
 *       which is the criterion the three sites above are judged by.
 *
 *   P3  RULE 7 IS NOT ROUTED AROUND. If the location named by
 *       `backupPathFor(targetPath, now)` is OBSTRUCTED - a directory sitting
 *       there, `EACCES`, `EPERM`, `EROFS` - the backup has not been taken and
 *       THE WRITE DOES NOT HAPPEN. The OS message reaches the caller verbatim,
 *       as `IpcFailure('IO', ...)`, exactly as today.
 *
 *       THIS IS WHAT RULES OUT THE OBVIOUS FIXES. A blind `COPYFILE_EXCL`
 *       retry, or a "probe for the first path that does not exist" loop, cannot
 *       tell "my own earlier backup is there" from "something is in the way" -
 *       both surface as an existing entry - so both would step past the
 *       obstruction onto a `.1` suffix and let the write proceed. That is a
 *       silent weakening of the one rule this module exists for, and
 *       `write-safety.test.ts`'s "aborts the write when the backup cannot be
 *       taken" is the test that catches it. That test must keep passing
 *       UNCHANGED.
 *
 *       REFERENCE DESIGN, offered because P1+P2+P3 together are narrow: carry
 *       the sequence in memory rather than reading it off the disk. The service
 *       remembers how many backups it has already taken for a given
 *       (path, stamp) pair, passes that count in, and the first is the
 *       deterministic name while the second and later carry a suffix. Disk
 *       state is then never consulted to choose the name, so an obstruction can
 *       only ever produce the abort. An implementer may choose otherwise; the
 *       four properties are what is judged.
 *
 *   P4  ORDER UNCHANGED. The backup still happens BEFORE `writeAtomic`, and a
 *       throw from it still means `writeAtomic` never runs.
 *
 * BOUNDED SCOPE. This defends against this service's own successive writes,
 * which is the reported defect. A second Orcastrate process writing the same
 * settings file in the same millisecond is NOT in scope and is not a gap this
 * session closes; `save`'s re-read-and-compare (rule 3) is the guarantee there,
 * and it is untouched.
 */
export interface BackupNamingRule {
  /** Unchanged: `<targetPath>.<stamp>.bak`. The first backup at this stamp. */
  firstBackupPath: string;
  /**
   * Zero for the first backup at a given (path, stamp); 1, 2, ... for each
   * further backup at that same stamp. Distinctness (P1) is a function of this
   * and of nothing read from the filesystem (P3).
   */
  sequence: number;
}

/**
 * UNCHANGED, stated so nothing is "tidied" while nearby:
 *  - a missing target still produces `null` and no backup file (`ENOENT` is the
 *    only benign error);
 *  - `tempPathFor` is NOT part of this item and does not change;
 *  - `writeAtomic`'s orphaned-temp cleanup does not change;
 *  - `HelmSaveResult.backupDisplayPath` still carries the path actually written.
 */
export type BackupInvariants = never;

// ---------------------------------------------------------------------------
// 2. Pod blocking compares against a guess  (T3, backend)
//    src/main/beachcomber/service.ts, src/main/beachcomber/paths.ts
// ---------------------------------------------------------------------------

/**
 * `blockerFor(displayPath, podDirectories)` keys on
 * `normalizeForCompare(displayPath)`. For a `projects` entry where
 * `resolveProjectPath` found no cwd-bearing transcript, `displayPath` is
 * `decodeDirectoryName(name)` and `pathSource` is `'decoded-name'` - and
 * `decodeDirectoryName`'s own docblock says every value it returns is a GUESS
 * and that the inverse is not a function. A Pod holding that directory's TRUE
 * cwd therefore may not block the trash, because the guess did not match it.
 *
 * THE EXACT COMPARISON IS REACHABLE, so the conservative fallback is not the
 * one taken. The encoding direction IS total and deterministic and it already
 * ships: `encodeCwdForProjects` in `src/main/pod-session/paths.ts`, exported
 * from the `src/main/pod-session` barrel, replaces every non-`[A-Za-z0-9]`
 * character with `-`, character for character. Encoding a Pod's `cwd` and
 * comparing against the DIRECTORY NAME ON DISK asks the question in the
 * direction that has an answer, instead of guessing backwards and comparing
 * guesses. `pod-session/paths.ts`'s own header already names the two functions
 * as inverses in the direction that is defined.
 *
 * THE RULE:
 *
 *   R1  RECORDED PATHS ARE UNCHANGED. When `pathSource` is `'session-record'`
 *       the comparison is `normalizeForCompare(displayPath)` against
 *       `normalizeForCompare(pod.cwd)`, exactly as today. That path is the
 *       truth a transcript recorded; nothing about it is a guess.
 *
 *   R2  A DECODED `projects` NAME IS COMPARED BY ENCODING. When the entry's
 *       root is `'projects'` AND its `pathSource` is `'decoded-name'`, a Pod
 *       blocks the entry when `encodeCwdForProjects(pod.cwd)` equals the
 *       entry's `name`, compared case-insensitively.
 *
 *       CASE-INSENSITIVELY, deliberately, and for the reason
 *       `normalizeForCompare`'s docblock already gives: this app is
 *       Windows-first, and for a function whose whole purpose is to BLOCK a
 *       deletion, over-refusing is the safe direction. Folding case can only
 *       block more entries, never fewer.
 *
 *   R3  THE TWO TESTS ARE A UNION, NOT A REPLACEMENT. For an R2 entry the
 *       existing `normalizeForCompare` comparison is ALSO still applied, and
 *       the entry is blocked if EITHER matches. Blocking is a refusal; adding a
 *       second way to refuse cannot make the panel less safe, and it means no
 *       entry that is blocked today becomes unblocked by this change.
 *
 *   R4  THE ROOT MATTERS AND IT IS EASY TO MISS. `buildEntry` gives EVERY
 *       non-`projects` entry `{ displayPath: absolutePath, recorded: false }`,
 *       so entries under `shellSnapshots`, `fileHistory` and `pasteCache` also
 *       carry `pathSource: 'decoded-name'` - with an ABSOLUTE PATH UNDER
 *       `~/.claude` as their `displayPath`, not a decoded guess. Keying R2 on
 *       `pathSource` alone would encode a Pod cwd and compare it against a
 *       shell-snapshot file name, which is meaningless. R2's condition is
 *       `root === 'projects' && pathSource === 'decoded-name'`, both halves.
 *
 *       That non-`projects` entries are labelled `'decoded-name'` at all is a
 *       separate oddity. It is NOT in this session's scope and is not fixed
 *       here; R4 exists so that this session does not build on it by accident.
 *
 *   R5  NOTHING ELSE MOVES. `BeachcomberEntry.blocked`, `.blockedBy`,
 *       `.pathSource`, `.orphan` and `refusalFor`'s sentence are unchanged.
 *       The "only a recorded path may ever be called missing" invariant on
 *       `orphan` is unchanged. No entry's `displayPath` changes.
 *
 *   R6  THE MODULE STAYS CLEAN. `src/main/beachcomber/**` still imports neither
 *       `electron` nor `pod-manager` and still contains no filesystem mutation
 *       call - `tests/unit/beachcomber/no-destructive-api.test.ts` scans for
 *       both and must keep passing unchanged. `encodeCwdForProjects` is taken
 *       from the `../pod-session` barrel, which is its declared public surface;
 *       the rule is NOT re-implemented inside `beachcomber/paths.ts`, because a
 *       second copy of the encoding is a drift the two-inverses argument above
 *       depends on not existing.
 *
 * BOUNDED SEVERITY, recorded so the fix is not over-built: trashing a
 * `projects/<dir>` entry removes `~/.claude/projects/<dir>` state - transcripts
 * and session records - not the Pod's working directory. The failure this item
 * closes is lost session history, not lost source code.
 */
export interface PodBlockingRule {
  root: BeachcomberRootKey;
  /** The on-disk directory name, `BeachcomberEntry.name`. Never decoded. */
  name: string;
  pathSource: BeachcomberEntry['pathSource'];
  displayPath: string;
  pods: readonly PodDirectory[];
}

// ---------------------------------------------------------------------------
// 3. `acknowledgeOwnWrite` can swallow one genuine external change  (T2, backend)
//    src/main/helm/helm-service.ts
// ---------------------------------------------------------------------------

/**
 * `save` re-reads the file AFTER the rename and hands that sha to
 * `watcher.acknowledgeOwnWrite`, which sets `lastHash`:
 *
 *     const written = readSnapshot(entry.path);
 *     this.watcher.acknowledgeOwnWrite(entry.path, written.revision?.sha256 ?? null);
 *
 * A foreign writer landing between the rename and that `readSnapshot` gets its
 * bytes adopted as Helm's own. The watcher's `flush` then compares the next
 * observed hash against the FOREIGN hash, finds them equal, and emits nothing -
 * so the one push that would have told the user someone else changed their file
 * is the push that is swallowed.
 *
 * THE RULE: acknowledge the sha of the content HELM ACTUALLY WROTE, not a sha
 * read back off the disk. `serializeSettings` already produced that string, and
 * `sha256Of` (`src/main/helm/revision.ts`) already computes the identity the
 * watcher compares. A disk state that differs from what Helm wrote then does
 * NOT match `lastHash`, and the watcher pushes - which is the correct answer,
 * because the disk genuinely does not hold what Helm wrote.
 *
 * WHAT ELSE DEPENDED ON THE RE-READ - checked, and the answer is nothing.
 * `written` has exactly one use, the `acknowledgeOwnWrite` argument.
 * `HelmSaveResult.document` comes from `await this.load(req.scopeId)`, a
 * SEPARATE re-read that is not part of this item and does not change.
 * `backupDisplayPath` comes from `backupBeforeWrite`. `warnings` comes from
 * `warningIssues(validation)`, computed before the write. So the
 * `const written = readSnapshot(entry.path)` statement is removed outright
 * rather than left computing a value nobody reads.
 *
 * A SIDE EFFECT WORTH NAMING: that `readSnapshot` was UNGUARDED - it sat
 * outside the try/catch that wraps the backup and the write - so an
 * `ErrnoException` from it would have escaped `save` unclassified, after the
 * write had already succeeded. Removing it removes that path too. This is a
 * consequence, not a second item, and no criterion asks for more than the
 * removal.
 *
 * UNCHANGED: `acknowledgeOwnWrite`'s signature, `HelmWatcher.flush`,
 * `lastHash`'s single-writer property, and the empty-file case - a save whose
 * serialized content is the empty string still acknowledges the sha of the
 * empty string, not `null`, because that is what is on disk.
 */
export interface OwnWriteAcknowledgement {
  /** The exact string handed to `writeAtomic`. */
  writtenContent: string;
  /** `sha256Of(writtenContent)`. Never a post-rename re-read. */
  acknowledgedSha: string;
}

// ---------------------------------------------------------------------------
// 4. `compareRequested` never resets  (T4, frontend)
//    src/renderer/src/helm/HelmPanel.tsx
// ---------------------------------------------------------------------------

/**
 * A DEFECT SESSION 2026-08-31-orcastrate-helm-draft-safety INTRODUCED, and it
 * is recorded as such rather than as a pre-existing wart.
 *
 * `HelmPanel` holds one piece of client interaction state, `compareRequested`,
 * set true on the compare click and NEVER SET BACK. `compareError` is then
 *
 *     compareRequested && !view.comparing && view.incoming === null
 *         ? view.actionError : null
 *
 * After a compare that FAILED, `incoming` stays null and `compareRequested`
 * stays true. Every later unrelated failure - a refused save, an `EPERM` on
 * reload - satisfies all three conjuncts, so its message is routed into the
 * COMPARISON surface instead of the error banner. The user is told their
 * comparison failed when what failed was their save.
 *
 * FOUR PROPERTIES, all about WHERE A MESSAGE APPEARS. The mechanism is the
 * implementer's; `compareRequested` may be reshaped or removed entirely, and no
 * criterion names an identifier.
 *
 *   Q1  EXACTLY ONE SURFACE, ALWAYS. While `view.actionError` is non-null and
 *       is not suppressed as the conflict duplicate (section 6), its text
 *       appears in EXACTLY ONE of the comparison surface and the `helmError`
 *       banner. Never both, never neither. This is the invariant the whole item
 *       is about, and it is what a test asserts.
 *
 *   Q2  A FAILED COMPARE BELONGS TO THE COMPARISON. Requesting a comparison
 *       that fails renders the message in the comparison surface and NOT in
 *       `helmError`. Unchanged from today; the fix must not cost this.
 *
 *   Q3  A LATER UNRELATED FAILURE BELONGS TO THE BANNER. After Q2, a
 *       SUBSEQUENT failure of any other action - the case in the report is a
 *       failed save - renders in `helmError` and NOT in the comparison surface.
 *       This is the defect.
 *
 *   Q4  BEFORE ANY COMPARE, NOTHING IS THE COMPARISON'S. With no comparison
 *       ever requested, no failure renders in the comparison surface, and the
 *       comparison surface shows its empty state. Unchanged from today.
 *
 * The comparison surface keeps all four of its declared states - loading, error,
 * empty, and the table. `HelmComparison` stays a presentation component taking
 * data and callbacks, and reaches for no hook.
 */
export interface CompareErrorRouting {
  actionError: string | null;
  comparing: boolean;
  incoming: unknown | null;
  /** True iff the message belongs to the comparison surface this render. */
  ownedByComparison: boolean;
}

// ---------------------------------------------------------------------------
// 5. `COPY.comparisonEmpty` names an unreachable affordance  (T4, frontend)
//    src/renderer/src/helm/copy.ts
// ---------------------------------------------------------------------------

/**
 * ALSO A DEFECT C1 INTRODUCED. `comparisonEmpty` reads
 *
 *   "No comparison yet. Compare with the file on disk to fetch its current
 *    contents beside your edit - nothing you have typed is touched."
 *
 * "Compare with the file on disk" is `COPY.compare`, the label of a button that
 * exists in exactly one place: the conflict banner (`HelmNotices.tsx:104`). The
 * comparison surface, however, renders whenever there is a draft
 * (`HelmPanel.tsx`, `draft === null ? null : <HelmComparison .../>`). With a
 * draft and NO conflict, the empty state instructs the user to press something
 * that is not on the screen.
 *
 * THE FIX IS THE COPY, NOT THE AFFORDANCE. Adding a second compare button is a
 * feature and is out of scope for a correctness sweep; the user approved a copy
 * change at Gate 1.
 *
 * FOUR PROPERTIES of the replacement string:
 *
 *   S1  It instructs the user to take NO action that is not reachable from the
 *       surface the sentence appears on. It may describe what a comparison is
 *       and when one appears; it may not tell the reader to press something.
 *   S2  It is a complete sentence, or complete sentences. Not a fragment.
 *   S3  It KEEPS the reassurance that comparing never touches what the user
 *       typed. That reassurance is the reason the sentence exists - a user
 *       burned by `reload()` needs it - and dropping it would trade one defect
 *       for another.
 *   S4  It contains no path separator, because `no-paths.test.ts` scans every
 *       string literal in `src/renderer/src/helm/` and fails on one.
 *
 * The string is edited IN `copy.ts` and nowhere else - copy is centralised there
 * by that file's own stated convention. No test pins the current text: the only
 * references are to `HELM_SAFETY_TEST_IDS.comparisonEmpty`, the test id, which
 * does NOT change. Verified by grep for `comparisonEmpty` and for the sentence
 * across `src/` and `tests/` at Gate 2; the hits are `copy.ts`,
 * `HelmComparison.tsx`, `test-ids.ts`, `probes.ts`, `discrimination.test.tsx`
 * and `HelmPanel.test.tsx:510`, and every one but `copy.ts` is on the id.
 */
export type ComparisonEmptyCopyRule = never;

// ---------------------------------------------------------------------------
// 6. `HelmNotices` prints the same error sentence twice  (T4, frontend)
//    src/renderer/src/helm/HelmNotices.tsx
// ---------------------------------------------------------------------------

/**
 * `HelmNotices` already computes `redundant = actionError !== null &&
 * actionError === conflict` and suppresses the duplicate for THAT pair. A
 * failed `helm:scopes` sets `Loadable.error` AND `actionError` to the SAME
 * string, and `redundant` does not cover that pair - so the `helmError` banner
 * renders the sentence twice, which reads as two separate failures.
 *
 * THE PRECEDENT IS IN THIS REPOSITORY AND IT IS FOLLOWED:
 * `src/renderer/src/beachcomber/BeachcomberError.tsx:22-27` builds a message
 * list, pushes `error.message`, then pushes `actionError` only when it differs,
 * and renders one paragraph per surviving message. Its own comment names this
 * exact shape. Helm's banner adopts it.
 *
 *   U1  When `loadError` and `actionError` are both non-null and EQUAL, the
 *       `helmError` notice renders that sentence EXACTLY ONCE.
 *   U2  When they are both non-null and DIFFER, both render, each once, in the
 *       order `loadError` then `actionError` - unchanged from today.
 *   U3  When exactly one is non-null, it renders once - unchanged.
 *   U4  The existing conflict suppression survives: `actionError` equal to
 *       `conflict` is still kept out of `helmError` entirely, because the
 *       conflict banner is its surface.
 *   U5  When every message is suppressed or absent, the `helmError` notice is
 *       NOT RENDERED AT ALL - no empty banner with a heading and no body.
 *   U6  The banner still prints main's message VERBATIM. No rewriting, no
 *       summarising, `white-space: pre-wrap` intact.
 *
 * MANDATORY, AND IT IS NOT A REGRESSION - READ THIS BEFORE REVIEWING:
 * `src/renderer/src/__tests__/failure-paths.e2e.test.tsx:1283` PINS the current
 * duplication as `toHaveLength(2)`, above a REPORTED DEFECT comment that says
 * in so many words that fixing the defect should make the assertion fail and
 * the comment get deleted. Fixing this item therefore REQUIRES rewriting that
 * assertion and deleting that comment. The task that owns section 6 also owns
 * that file, so both land in one change. A reviewer who sees that pin change
 * must NOT read it as a break - the test's own comment authorises it.
 */
export interface NoticeDeduplication {
  loadError: string | null;
  actionError: string | null;
  conflict: string | null;
  /** Distinct, in order, each rendered once. Empty means no banner at all. */
  messages: readonly string[];
}

// ---------------------------------------------------------------------------
// 7. The path is rendered above the notice saying the path is a guess  (T5)
//    src/renderer/src/beachcomber/BeachcomberRow.tsx
// ---------------------------------------------------------------------------

/**
 * DOM ORDER, NOT WORDING. `BeachcomberRow` renders
 * `<p className={styles.rowPath}>{entry.displayPath}</p>` and only later, after
 * the facts line and the blocked marker, the "Path not verified" notice. A
 * reader going top to bottom - and a screen reader doing the same - meets the
 * guess as a fact, and only afterwards learns it was a guess. Next to a delete
 * button, that ordering is the wrong way round.
 *
 *   V1  For a row whose `entry.pathSource` is `'decoded-name'`, the element
 *       carrying `PANEL_TEST_IDS.beachcomberRowUnverified` PRECEDES the element
 *       holding `entry.displayPath` in document order.
 *   V2  THE COPY IS FROZEN AND RENDERS VERBATIM. `UNVERIFIED_PATH_NOTICE` - the
 *       contract's own constant, imported, never re-typed - and
 *       `COPY.unverifiedHeading` are unchanged, and the notice element's
 *       `textContent` is still EXACTLY `UNVERIFIED_PATH_NOTICE` with no prefix
 *       and no suffix. `BeachcomberRow.test.tsx:103` asserts that equality and
 *       must keep passing unchanged.
 *   V3  ARIA IS UNCHANGED. `aria-describedby` still names the blocked notice
 *       and the unverified notice by their existing ids, the checkbox still
 *       carries the real `disabled` attribute when blocked, and the row still
 *       carries `aria-disabled`. The described-by id list is not reordered to
 *       match the DOM - it is the same set it is today.
 *   V4  EVERYTHING ELSE KEEPS ITS ORDER. Select-and-name, facts line, blocked
 *       marker and orphan marker are unchanged relative to each other, and a
 *       row with `pathSource: 'session-record'` renders byte-for-byte the same
 *       DOM it does today - no notice, no reordering.
 *   V5  NO NEW MEANING CARRIED BY COLOUR. The notice remains text.
 *
 * There is no order assertion for this row anywhere outside
 * `src/renderer/src/beachcomber/` - checked by grep for `rowUnverified`,
 * `beachcomberRowUnverified` and `rowPath` across `src/` and `tests/` at
 * Gate 2 - so this change is contained to one task's own directory.
 */
export type RowOrderRule = never;

// ---------------------------------------------------------------------------
// 8. AMENDMENT to src/shared/contracts/beachcomber.ts  (T1, architecture)
// ---------------------------------------------------------------------------

/**
 * THE ONLY EDIT TO A FROZEN SHARED CONTRACT IN THIS SESSION, and it changes not
 * one character of any type.
 *
 * `BeachcomberPreview.refused`'s docblock says: "Ids main will not act on:
 * blocked by a Pod, or unknown to this scan." The second half is false and has
 * always been false. `resolveRequest` throws
 * `IpcFailure('NOT_FOUND', ...)` for a stale `scanId` and for an id the live
 * namespace does not hold, and it is REQUIRED to: the same file's
 * `BeachcomberService` docblock (~line 301) names `NOT_FOUND` for "an id or
 * scanId this service did not mint" and points at `src/main/ipc/errors.ts`.
 * `refused` carries Pod-blocked entries and nothing else.
 *
 * THE COMMENT CHANGES, THE SERVICE DOES NOT. A consumer coding to the comment
 * would poll a `refused` array for an entry that can never appear while a
 * rejected promise it never handled goes past it. Making the service return
 * `refused` for unknown ids instead would delete the scan-scoped id's whole
 * point - it exists so a stale id can never be rematched onto whatever
 * directory has since taken its place - and would contradict the header. So the
 * prose is what was wrong.
 *
 *   W1  The `refused` docblock states that it carries entries this scan holds
 *       but will not act on - today, blocked by a Pod - and that an id or
 *       `scanId` the service did not mint, or no longer holds, is `NOT_FOUND`
 *       thrown from `preview` and `trash`, never an entry here.
 *   W2  It does not contradict the service docblock below it. A reader of
 *       either arrives at the same behaviour.
 *   W3  NO TYPE, FIELD, NAME OR SIGNATURE IN THE FILE CHANGES. Comment text
 *       only. Anything else is a contract-change escalation.
 *   W4  The file carries a short provenance note recording that it was frozen
 *       2026-08-19 and amended by session 2026-09-04-orcastrate-correctness-sweep,
 *       naming what the old comment claimed and why it was wrong - so a later
 *       reader can tell an approved amendment from drift.
 */
export type RefusedDocumentationRule = never;

// ---------------------------------------------------------------------------
// 9. A leaf error module  (T1 creates it; T2 and T3 adopt it)
//    src/main/ipc/errors.ts -> src/main/ipc/failure.ts
// ---------------------------------------------------------------------------

/**
 * `src/main/ipc/errors.ts` imports `PodRunnerError` from `../pod` and
 * `EventStoreError` from `../store` as VALUES - `toIpcError` needs the
 * constructors for its `instanceof` checks. Every importer of that module
 * therefore pulls both subsystems into its graph, whether or not it wants them.
 *
 * Two main-process modules reach it for `IpcFailure` ALONE:
 * `src/main/beachcomber/service.ts:67` and `src/main/helm/helm-service.ts:47`,
 * whose docblock at line 28 already flags the import as a deliberate exception
 * and argues it is harmless because "nothing about importing it reaches
 * Electron or the renderer". That argument is true of `IpcFailure` and false of
 * the module it currently lives in. Two reviewers flagged this independently.
 *
 * `IpcFailure`, its three constructors and `IPC_ERROR_CODES` depend on NOTHING
 * but TYPES from `src/shared/contracts/ipc.ts`. They move to a leaf.
 *
 *   X1  A new module `src/main/ipc/failure.ts` exports `IpcFailure`,
 *       `invalidArgument`, `notFound`, `cwdMissing` and `IPC_ERROR_CODES`. Its
 *       ONLY import is `import type` from `../../shared/contracts/ipc`. It
 *       imports no value from anywhere, and nothing from `../pod`, `../store`,
 *       `electron` or `node:*`.
 *
 *   X2  ONE CONSTRUCTOR, STILL. `errors.ts` RE-EXPORTS all five from
 *       `./failure.ts` rather than declaring anything parallel. There is
 *       exactly one `IpcFailure` class in the process, so every existing
 *       `instanceof IpcFailure` - in `toIpcError`, in handlers, in tests -
 *       keeps working. A second class would silently break classification.
 *
 *   X3  NO BEHAVIOUR CHANGES. `toIpcError`, `ok`, `fail`, `STORE_CODES`,
 *       `RUNNER_CODES` and the `RangeError` and `InvalidPermissionAnswerError`
 *       branches stay in `errors.ts`, unmodified. Every code in
 *       `IPC_ERROR_CODES` and every mapping is byte-identical.
 *
 *   X4  THE ISOLATION IS ONLY REAL IF THE CONSUMERS MOVE. A re-export does not
 *       help an importer: `import { IpcFailure } from '../ipc/errors'` still
 *       loads `errors.ts`, which still loads `../pod` and `../store`. So the
 *       four consumers that need only the leaf import FROM the leaf:
 *
 *         - `src/main/ipc/validate.ts`      (`invalidArgument`)          T1
 *         - `src/main/pod-manager/pod-manager.ts` (`cwdMissing`,
 *                                    `IpcFailure`, `notFound`)           T1
 *         - `src/main/beachcomber/service.ts`     (`IpcFailure`)         T3
 *         - `src/main/helm/helm-service.ts`       (`IpcFailure`)         T2
 *           and `tests/unit/helm/helpers.ts`      (`IpcFailure`)         T2
 *
 *       T1 owns the first two and the new module. T2 and T3 each swap their own
 *       one-line import, because those files belong to them and an ownership
 *       set is not shared. This split is why T2 and T3 depend on T1.
 *
 *       `src/main/ipc/handlers.ts` keeps importing from `./errors` - it needs
 *       `fail` and `ok`, which stay there. `src/main/ipc/index.ts` keeps
 *       re-exporting the same five names from the same place it does today, so
 *       no consumer of the barrel changes.
 *
 *   X5  THE DOCBLOCKS THAT NAME THE OLD PATH ARE UPDATED, each by the task that
 *       owns its file: `helm-service.ts:28` (T2), `pod-manager.ts:36` (T1),
 *       and `beachcomber.ts:301`'s pointer at `src/main/ipc/errors.ts` (T1,
 *       alongside section 8). A comment naming a path that no longer explains
 *       the import is how the next reader is misled.
 *
 *   X6  NO IMPORT CYCLE. `failure.ts` imports nothing that imports it.
 *       `npm run typecheck:node` reporting zero errors and the full unit suite
 *       passing are the evidence.
 *
 * WHY NOT LEAVE IT. This is the smallest item in the session and the only one
 * with no user-visible symptom. It is in scope because two independent reviews
 * raised it and because the honesty of `helm-service.ts:28`'s stated exception
 * depends on it: that docblock currently claims an isolation the module graph
 * does not have.
 */
export interface LeafFailureModule {
  moduleSpecifier: 'src/main/ipc/failure.ts';
  exports: readonly ['IpcFailure', 'invalidArgument', 'notFound', 'cwdMissing', 'IPC_ERROR_CODES'];
  /** Type-only. The leaf imports no value from anywhere. */
  valueImports: readonly [];
}

// ---------------------------------------------------------------------------
// Cross-cutting: what this session does NOT do
// ---------------------------------------------------------------------------

/**
 * Deferred to sub-session C3 by user decision at Gate 1. Named here so no task
 * "improves" one on its way past, and so a reviewer does not read the absence
 * as an oversight:
 *
 *   - the `font-weight: 600` missing token;
 *   - the four unconsumed tokens: `borderThick`, `trackingTight`,
 *     `weightRegular`, `weightMedium`;
 *   - the opaque `.confirmScrim` and the missing overlay token;
 *   - the `PanelBar` pair - the lost close route, and `aria-pressed` versus
 *     `aria-current`;
 *   - naming `resetHelmForReopen` as a fifth clearing site in the Helm contract;
 *   - the two criterion-phrasing gaps C1 recorded.
 *
 * Also out of scope, and each recorded above at the item it sits beside: a
 * second writing process racing Helm's backup naming (section 1); non-`projects`
 * roots carrying `pathSource: 'decoded-name'` (section 2, R4); adding a second
 * compare affordance to the comparison surface (section 5).
 */
export type OutOfScope = never;
