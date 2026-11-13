// frozen: 20261112-2120-composer-slash-autocomplete, Gate 2
/**
 * CONTRACT: the renderer half of slash-command suggestions. Three amendments,
 * each with one source-tree owner:
 *
 *   A. `useSlashCommands`: the state layer's hook. DECLARED in
 *      `src/renderer/src/contracts/renderer-state.ts` beside the other
 *      focused hooks, IMPLEMENTED in `src/renderer/src/state/workspace-provider.tsx`,
 *      and EXPORTED from `src/renderer/src/state/index.ts`. Owner: T3.
 *   B. `ComposerProps.commands`: the Composer's new prop. DECLARED on
 *      `ComposerProps` in `src/renderer/src/contracts/renderer-view.ts`.
 *      Owner: T4.
 *   C. The stub API's push seam for the new channel, in
 *      `src/renderer/src/test-utils/stub-api.ts`. Owner: T3. Its consumer is
 *      T5, which tests through it.
 *
 * T5 (CONSUMER) wires A into B in `src/renderer/src/App.tsx`, and tests the
 * whole path through C.
 *
 * `SlashCommandInfo` and `PodCommandsPush` are imported from
 * `@shared/contracts/ipc` (the `slash-command-delivery.ts` contract, owner
 * T1). Neither is re-declared anywhere under `src/renderer/**`.
 */

import type { PodCommandsPush, SlashCommandInfo } from '@shared/contracts/ipc';

// ---------------------------------------------------------------------------
// A. The hook (T3)
// ---------------------------------------------------------------------------

/**
 * The ACTIVE Pod's latest pushed list, exactly as the last `push:podCommands`
 * for that Pod delivered it: same order, same entries, no filtering or
 * reordering in the renderer.
 *
 * - No active Pod, or no push received yet for the active Pod: an empty array.
 * - Per Pod: a push for Pod B never changes what the hook returns while Pod A
 *   is active. Making B active returns B's latest list at once, with no IPC
 *   call.
 * - A push REPLACES that Pod's list wholesale. An empty push empties it.
 * - Referentially stable: between two renders with no new push for the
 *   active Pod and no change of active Pod, it returns the same array object.
 * - Never throws and issues no IPC call. The list arrives only by push.
 *
 * The store subscribes to `on.podCommands` in `start()` together with the
 * existing push channels, and calls the returned unsubscribe exactly once in
 * `stop()`. A push for a Pod the store holds no record for creates that Pod's
 * runtime record, as the other per-Pod pushes do.
 */
export declare function useSlashCommands(): readonly SlashCommandInfo[];

// ---------------------------------------------------------------------------
// B. The Composer prop (T4)
// ---------------------------------------------------------------------------

/**
 * ADDED, REQUIRED, to `ComposerProps`. Every other member of `ComposerProps`
 * is unchanged, `onInterrupt`'s docblock included, except that it gains this
 * one sentence: "Not called while the suggestion list is open: Esc then
 * closes the list instead."
 *
 * What the Composer does with it, the behaviour T5 relies on:
 *
 * - OPEN when all of these hold: the composer is not `disabled`; `text`
 *   matches /^\/(\S*)$/, meaning a leading `/` with no whitespace after it
 *   anywhere; at least one command matches; and the list has not been
 *   dismissed since the text last changed.
 * - MATCH: a command matches when `name.startsWith(p)` or some
 *   `aliases[i].startsWith(p)`, where `p` is the captured text after `/`.
 *   Case-sensitive. For `text === '/'`, `p` is `''` and every command matches.
 * - SHOWN: the first 5 matches, in the order of `commands`. Never more than 5.
 * - Each row shows `/` + `name` and, separately, `description`. No other text,
 *   and nothing that says a command will run.
 * - ArrowDown and ArrowUp move the selection and wrap at both ends. Row 0 is
 *   selected whenever the list opens or the set of shown rows changes.
 * - Tab or Enter ACCEPTS the selected row. It calls `onChange('/' + name + ' ')`
 *   (the canonical `name`, even when an alias matched), calls neither `onSend`
 *   nor `onInterrupt`, and the list then closes because the text contains a
 *   space.
 * - Pressing (mousedown on) a row accepts that row in the same way.
 * - Escape CLOSES the list and calls neither `onInterrupt` nor `onChange`.
 * - While the list is closed, every key does what it does at base: Enter
 *   sends, Shift+Enter adds a line, Escape calls `onInterrupt`, and Tab is
 *   not intercepted.
 */
export interface ComposerPropsCommandsAmendment {
  commands: readonly SlashCommandInfo[];
}

// ---------------------------------------------------------------------------
// C. The stub API seam (T3; consumer T5)
// ---------------------------------------------------------------------------

/**
 * ADDED to the stub API in `src/renderer/src/test-utils/stub-api.ts`:
 * - `EVENT_CHANNEL_METHODS.podCommands === 'podCommands'`;
 * - `on.podCommands(cb)` subscribes like the other `on.*` members;
 * - `emit.podCommands(push)` delivers `push` synchronously to every current
 *   `on.podCommands` subscriber, the same object to each.
 */
export interface StubApiEmitPodCommandsAmendment {
  podCommands(push: PodCommandsPush): void;
}
