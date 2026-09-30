/**
 * CONTRACT — Beachcomber (design section 6). Frozen at Gate 2.
 *
 * Lands verbatim at `src/shared/contracts/beachcomber.ts`.
 *
 * Boundary between:
 *   - T2 (PRODUCER)  `src/main/beachcomber/**` — implements `BeachcomberService`.
 *   - T1             puts `BeachcomberApi` on `window.orcastrate` and registers
 *                    the three invoke channels that delegate to the service.
 *   - T5             the renderer state layer, the only caller of the bridge.
 *   - T6             the panel UI, which renders view models derived from these.
 *   - T10            the failure-path suite.
 *
 * ===========================================================================
 * HOW THIS HOLDS THE NO-PATHS RULE (`ipc.ts` lines 12-14)
 * ===========================================================================
 *
 * The rule is: "no method here accepts or returns a filesystem path the
 * renderer can act on directly. Paths are opaque display strings; every
 * operation on one is named by id or performed by main."
 *
 * Beachcomber is path-shaped by nature — every row IS a directory. It holds the
 * rule in three parts, and all three are load-bearing:
 *
 *  1. WHAT CROSSES. `BeachcomberEntry.displayPath` is a string that reads like
 *     a path and is treated as prose. Nothing in the renderer parses, joins,
 *     splits, or resolves it; `state/isolation.test.ts` already fails any
 *     renderer file that calls `join`/`resolve`/`dirname`/`basename`, and that
 *     scan covers the panel by construction.
 *
 *  2. WHAT COMES BACK. Every mutating call names a `BeachcomberEntryId` and
 *     NEVER a path. `preview` and `trash` accept ids only. There is no method
 *     on this surface that accepts a string the renderer composed.
 *
 *  3. WHY AN ID IS NOT A PATH IN DISGUISE. The id is an OPAQUE TOKEN minted by
 *     main per scan — a random string, NOT a hash or an encoding of the path.
 *     Main holds the id -> absolute-path map; the renderer holds only the
 *     token. A renderer that wanted to trash an arbitrary directory cannot
 *     construct an id for it, because the mapping does not exist outside main.
 *     This is strictly stronger than `dialog.pickDirectory`, which does hand
 *     the renderer a real path and trusts it to hand the same one back.
 *
 * IDS ARE SCAN-SCOPED. A new `scan()` invalidates every id the previous one
 * minted. An id from a stale scan answers `NOT_FOUND`, never a silent no-op and
 * never a match by path — otherwise a row the user selected before a rescan
 * could trash a different directory that happens to have taken its place.
 *
 * ===========================================================================
 * THE DECODING RULE THE DESIGN GOT WRONG
 * ===========================================================================
 *
 * Design section 6 says a `~/.claude/projects/<dir>` name "is decoded back to
 * the original working directory path". It cannot be. The encoding replaces
 * every non-alphanumeric run with `-`, so `:`, `\`, `/`, `.` and a literal `-`
 * all collapse to the same character. On the session machine,
 * `C--Users-dmarq-Development-Repos-dir-ect` is ambiguous between
 * `C:\Users\dmarq\Development\Repos\dir-ect` and `…\Repos\dir\ect`. Orphan
 * detection built on decoding produces FALSE ORPHANS for any path containing a
 * hyphen — and a false orphan is an invitation to delete live state.
 *
 * The authoritative source is inside the directory: every session `.jsonl`
 * records the true cwd verbatim as `"cwd":"C:\\Users\\…"`. So:
 *
 *   - `pathSource: 'session-record'` — read from the first record carrying a
 *     `cwd`. Authoritative.
 *   - `pathSource: 'decoded-name'` — no such record exists. A GUESS, and it is
 *     presented as one.
 *
 * AND THE RULE THAT FOLLOWS FROM IT: `orphan` may only ever be true when
 * `pathSource === 'session-record'`. A decoded-name row is never called an
 * orphan, because "this path does not exist" is unfalsifiable when the path
 * itself is a guess.
 *
 * ===========================================================================
 * PROVENANCE — one approved amendment since the freeze
 * ===========================================================================
 *
 * Frozen 2026-08-19. AMENDED by session `2026-09-04-orcastrate-correctness-sweep`
 * (section 8 of its contract), comment text only — no type, field, name,
 * signature, union member or constant changed.
 *
 * WHAT CHANGED AND WHY. `BeachcomberPreview.refused`'s docblock said the array
 * carried "Ids main will not act on: blocked by a Pod, OR UNKNOWN TO THIS
 * SCAN." The second half was false and had always been false: `resolveRequest`
 * throws `IpcFailure('NOT_FOUND', ...)` for a stale `scanId` and for an id the
 * live namespace does not hold, and the `BeachcomberService` docblock below
 * REQUIRES it to. A consumer coding to the old comment would poll `refused` for
 * an entry that can never appear, while a rejected promise it never handled
 * went past it. Making the service refuse unknown ids instead would delete the
 * scan-scoped id's whole point — a stale id must never be rematched onto
 * whatever directory has since taken its place — and would contradict the
 * header above. So the prose was the thing that was wrong, and the prose is the
 * thing that changed.
 *
 * Anything beyond comment text in this file remains a contract-change
 * escalation.
 */

import type { Timestamp } from './events';
import type { IpcResult } from './ipc';
import type { PodDirectory, PodDirectoryProvider, TrashItem } from './panel-host';

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

/**
 * The four directories under `~/.claude` Beachcomber covers (design section 6).
 * All four exist on the session machine; a missing one is an EMPTY root, not an
 * error — a user who has never pasted an image has no `paste-cache`.
 */
export const BEACHCOMBER_ROOTS = [
  'projects',
  'shellSnapshots',
  'fileHistory',
  'pasteCache',
] as const;

export type BeachcomberRootKey = (typeof BEACHCOMBER_ROOTS)[number];

export interface BeachcomberRootSummary {
  key: BeachcomberRootKey;
  /** `~/.claude/projects` etc. Display only — see the no-paths note above. */
  displayPath: string;
  /** False when the directory does not exist. Not an error. */
  present: boolean;
  entryCount: number;
  totalBytes: number;
  /**
   * Set when the root exists but could not be read (EACCES and friends). The
   * OS message VERBATIM. Other roots still scan — one unreadable root must not
   * cost the user the whole panel.
   */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/**
 * OPAQUE. Minted by main, meaningful only to the scan that produced it. See the
 * header: this is the entire reason the no-paths rule survives contact with a
 * panel whose subject is paths.
 */
export type BeachcomberEntryId = string;

/** Where `displayPath` came from, and therefore how much it can be trusted. */
export type BeachcomberPathSource = 'session-record' | 'decoded-name';

/**
 * Why an entry cannot be selected. `null` means selectable.
 *
 * `pod-cwd` is the design's "directory backing a currently open Pod is
 * hard-blocked", widened to every Pod Orcastrate knows about — see
 * `PodDirectoryProvider` in `panel-host.ts` for why, and what it costs.
 */
export type BeachcomberBlockReason = 'pod-cwd';

export interface BeachcomberEntry {
  id: BeachcomberEntryId;
  root: BeachcomberRootKey;
  /**
   * The directory's own name under its root, unmodified. Always available,
   * always exactly what is on disk, and the only field that is never a guess.
   */
  name: string;
  /**
   * For `projects`: the working directory this state belongs to. For the other
   * three roots: the entry's own path under `~/.claude`.
   *
   * DISPLAY ONLY. The renderer shows it and does nothing else with it.
   */
  displayPath: string;
  pathSource: BeachcomberPathSource;
  sizeBytes: number;
  fileCount: number;
  /** ISO-8601. Newest mtime anywhere beneath the entry. */
  lastModified: Timestamp;
  /** `projects` only — the number of `*.jsonl` session files. `null` elsewhere. */
  sessionCount: number | null;
  /**
   * The working directory is gone. ONLY EVER TRUE when
   * `pathSource === 'session-record'` — see the header.
   */
  orphan: boolean;
  blocked: BeachcomberBlockReason | null;
  /**
   * The Pod that blocked it, so the UI can say "Refactor the router is using
   * this" instead of "blocked". Non-null exactly when `blocked !== null`.
   */
  blockedBy: Pick<PodDirectory, 'podId' | 'title'> | null;
}

export interface BeachcomberScan {
  /** Identifies the id namespace. A `preview`/`trash` for an older one is NOT_FOUND. */
  scanId: string;
  scannedAt: Timestamp;
  roots: BeachcomberRootSummary[];
  /** Every entry across every root, sorted by root order then `sizeBytes` desc. */
  entries: BeachcomberEntry[];
}

// ---------------------------------------------------------------------------
// Preview — "exactly what will be removed, before any action" (design 6)
// ---------------------------------------------------------------------------

export interface BeachcomberPreviewRequest {
  scanId: string;
  ids: BeachcomberEntryId[];
}

export interface BeachcomberPreviewItem {
  id: BeachcomberEntryId;
  displayPath: string;
  root: BeachcomberRootKey;
  sizeBytes: number;
  fileCount: number;
  /**
   * Up to 20 file names from within the entry, so the preview shows the user
   * SOMETHING CONCRETE rather than a byte count. Names only, never paths.
   */
  sampleNames: string[];
  /** True when the entry moved or vanished since the scan. */
  stale: boolean;
}

export interface BeachcomberPreviewRefusal {
  id: BeachcomberEntryId;
  /** User-facing, and it says what to do about it. */
  reason: string;
}

export interface BeachcomberPreview {
  items: BeachcomberPreviewItem[];
  /**
   * Entries THIS SCAN HOLDS but main will not act on — today, exactly one
   * cause: blocked by a Pod. A refusal here is not an error — the preview's
   * whole job is to say no BEFORE the confirm button, so `trash` never has to
   * surprise anyone.
   *
   * AN UNKNOWN ID IS NOT REFUSED, IT IS THROWN. An id or `scanId` this service
   * did not mint, or no longer holds, is a `NOT_FOUND` `IpcFailure` raised out
   * of `preview` and `trash` — never an entry here. A caller waiting on
   * `refused` for a stale id waits forever; it must handle the rejection. See
   * the `BeachcomberService` docblock below, which says the same thing.
   */
  refused: BeachcomberPreviewRefusal[];
  totalBytes: number;
  totalFiles: number;
}

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

export interface BeachcomberTrashRequest {
  scanId: string;
  ids: BeachcomberEntryId[];
}

export interface BeachcomberTrashFailure {
  id: BeachcomberEntryId;
  displayPath: string;
  /** The OS message VERBATIM (`ipc.ts` IpcError.message rule, design 7). */
  message: string;
}

/**
 * PARTIAL SUCCESS IS THE NORMAL CASE and is modelled as a VALUE, not an error.
 * Trashing eleven directories where the fourth is locked by another process
 * must not report as a failed operation — seven things really did move to the
 * recycle bin and the user has to be told which.
 */
export interface BeachcomberTrashResult {
  trashed: BeachcomberEntryId[];
  failed: BeachcomberTrashFailure[];
  refused: BeachcomberPreviewRefusal[];
  /** A fresh scan, so the panel never renders rows that are now in the bin. */
  scan: BeachcomberScan;
}

// ---------------------------------------------------------------------------
// The renderer-facing surface (T1 hangs this on `window.orcastrate.beachcomber`)
// ---------------------------------------------------------------------------

/**
 * Channel keys T1 adds to `INVOKE_CHANNELS`, exactly these names:
 *   beachcomberScan    -> 'beachcomber:scan'
 *   beachcomberPreview -> 'beachcomber:preview'
 *   beachcomberTrash   -> 'beachcomber:trash'
 *
 * All three MUST render an error when they fail. None of them may be added to
 * `SURFACELESS_CHANNELS` in `src/renderer/src/__tests__/failure-paths.e2e.test.tsx`
 * — a cleanup panel that silently does nothing when it cannot read or cannot
 * delete is the single worst failure mode this feature has.
 *
 * The type-only import from `./ipc` above is CIRCULAR — `ipc.ts` imports this
 * interface to populate the namespace it currently reserves as
 * `beachcomber?: never`. That is deliberate and legal: both directions are
 * `import type`, so nothing exists at runtime to cycle. The alternative,
 * declaring these signatures inside `ipc.ts`, would split Beachcomber's
 * contract across two files.
 */
export interface BeachcomberApi {
  /** Enumerates all four roots. Mints a fresh id namespace; see the header. */
  scan(): Promise<IpcResult<BeachcomberScan>>;
  preview(req: BeachcomberPreviewRequest): Promise<IpcResult<BeachcomberPreview>>;
  /** Moves each id to the OS recycle bin. Partial success is a VALUE. */
  trash(req: BeachcomberTrashRequest): Promise<IpcResult<BeachcomberTrashResult>>;
}

// ---------------------------------------------------------------------------
// The main-process port (T2 implements; T1 declares it on IpcHandlerDeps)
// ---------------------------------------------------------------------------

/**
 * Everything T2 needs from the outside world. There is no other injection
 * point, and T2 imports neither `electron` nor `../pod-manager`.
 */
export interface BeachcomberServiceDeps {
  /** Absolute path of `~/.claude`. T8 supplies `join(homedir(), '.claude')`. */
  claudeHome: string;
  pods: PodDirectoryProvider;
  trashItem: TrashItem;
  now: () => Date;
  /** Injected so ids are deterministic under test. */
  newId: () => string;
}

/**
 * Throws `IpcFailure` (declared in `src/main/ipc/failure.ts`; classified by
 * `toIpcError` in `src/main/ipc/errors.ts`) for the two conditions the renderer
 * must be able to branch on:
 *   - `NOT_FOUND`        an id or scanId this service did not mint, or no
 *                        longer holds. THROWN, never a `refused` entry.
 *   - `IO`               `~/.claude` itself is unreadable
 * Everything else is a value on the result types above.
 */
export interface BeachcomberService {
  scan(): Promise<BeachcomberScan>;
  preview(req: BeachcomberPreviewRequest): Promise<BeachcomberPreview>;
  trash(req: BeachcomberTrashRequest): Promise<BeachcomberTrashResult>;
}
