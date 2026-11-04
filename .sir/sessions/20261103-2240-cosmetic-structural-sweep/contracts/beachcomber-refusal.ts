// frozen: 20261103-2240-cosmetic-structural-sweep, Gate 2
//
// The one interface this session's tasks share: the shape of a Beachcomber
// refusal after C5. T1 produces it (shared contract type + main's
// `refusalFor`); T2 consumes it (the renderer's refusal list).
//
// THE DECLARATION THAT SHIPS is `BeachcomberPreviewRefusal` in
// `src/shared/contracts/beachcomber.ts`, owned by T1. Every consumer imports
// it from there (`@shared/contracts/beachcomber`); nothing re-declares it.
// This file is the agreement, not an importable module.

/** `src/shared/contracts/beachcomber.ts:163` at base: `export type BeachcomberEntryId = string;` */
type BeachcomberEntryId = string;

export interface BeachcomberPreviewRefusal {
  /** Unchanged from base. The opaque, scan-scoped token of the refused entry. */
  id: BeachcomberEntryId;
  /**
   * NEW (C5). The refused entry's own `BeachcomberEntry.displayPath`, copied
   * verbatim by main when it builds the refusal. Never null, never `undefined`.
   * Treated as PROSE by the renderer — never parsed, joined, split or
   * resolved — exactly as `BeachcomberEntry.displayPath` and
   * `BeachcomberTrashFailure.displayPath` already are.
   */
  displayPath: string;
  /** Unchanged from base. User-facing; says what to do about the refusal. */
  reason: string;
}

// Producer guarantee (T1): every refusal main returns — in
// `BeachcomberPreview.refused` and in `BeachcomberTrashResult.refused` — carries
// the displayPath of the entry whose `id` it names. No other field, and no
// change to when a refusal is produced: an unknown id is still a thrown
// `NOT_FOUND` `IpcFailure`, never a refusal.
//
// Error cases: none new. This change adds a field to a value; it adds no
// failure path to `preview` or `trash`.
