// frozen: 20261112-2120-composer-slash-autocomplete, Gate 2
/**
 * CONTRACT: the per-Pod slash-command list, from main to the renderer, as an
 * amendment to `src/shared/contracts/ipc.ts`.
 *
 * Boundary between:
 *   - T1 (PRODUCER) owns `src/shared/contracts/ipc.ts`, `src/preload/api.ts`
 *     and the main-process half (`src/main/pod/**`, `src/main/pod-manager/**`).
 *     Every declaration below is written ONCE, in `src/shared/contracts/ipc.ts`,
 *     and every consumer imports it from there (`@shared/contracts/ipc` in the
 *     renderer). No consumer re-declares any of them.
 *   - T3 (CONSUMER) subscribes to `on.podCommands` in the workspace store and
 *     adds the channel to the renderer's stub API.
 *   - T4 (CONSUMER) takes `SlashCommandInfo` as the element type of the
 *     Composer's `commands` prop.
 *   - T5 (CONSUMER) drives the push end to end through the stub API.
 *
 * PUSH ONLY. No invoke channel is added: `INVOKE_CHANNELS` keeps exactly its
 * 22 members, and `EVENT_CHANNELS` grows from 6 members to 7.
 *
 * WHAT MAIN PUSHES, AND WHEN. These are the producer's rules. They are
 * written here because the renderer's guarantees depend on them:
 *
 *   1. THE CATALOG. For each live Pod session, main holds the SDK's command
 *      list, or "unknown" until it has one. Two writers only:
 *        a. The INITIAL READ. After the session's `start()` resolves, main
 *           calls the runner's `supportedCommands()` once. `openPod`,
 *           `reconnectPod` and the resume-fallback retry do NOT wait for it.
 *           The read is bounded by a timeout. A rejection or a timeout logs one
 *           `warn` that names the Pod, and leaves the catalog as it was. An
 *           answer of `null` (the runner's bridge offers no command surface)
 *           also leaves it as it was, and logs nothing.
 *        b. A `system` message with `subtype: 'commands_changed'` whose
 *           `commands` is an array REPLACES the catalog (the SDK's own
 *           instruction, `sdk.d.ts` `SDKCommandsChangedMessage`). An
 *           initial-read answer that arrives AFTER such a replacement is
 *           discarded.
 *      Both writers pass the SDK's value through one normalizer, which keeps
 *      SDK order and drops what it cannot read. See `SlashCommandInfo`.
 *
 *   2. THE TERMINAL SET. The `terminal_slash_commands` array of the LATEST
 *      `system`/`init` message this session ingested (its string members),
 *      or the empty set when that init lacks the field, which the SDK omits
 *      when it would be empty. Before the session's first init, it is the
 *      empty set. So nothing is hidden until the first turn has begun.
 *
 *   3. THE VISIBLE LIST is the catalog, in catalog order, without every
 *      entry whose `name` is in the terminal set. Undefined while the catalog
 *      is unknown.
 *
 *   4. THE PUSH. After any change to the catalog or the terminal set, if the
 *      visible list is defined and differs from the last list pushed for this
 *      SESSION, main emits one `push:podCommands` with that list. "Differs"
 *      compares lists element by element, in order, on all four fields. The
 *      session's first defined list is always pushed, even when it is empty.
 *      So a reopened Pod always replaces whatever its previous session left in
 *      the renderer.
 *
 *   5. NOTHING IS PUSHED for a session that has been disposed (closed,
 *      beached, deleted). A read that settles after disposal is dropped
 *      silently.
 *
 *   6. THE RAW MESSAGES ARE NOT CONSUMED. `commands_changed` and `init`
 *      reach the LaneRouter and the store exactly as they do today.
 *
 * ORDERING the renderer may rely on: pushes for one Pod arrive in the order
 * main emitted them, so the latest push is the current list. No push carries
 * a revision.
 *
 * ERRORS: none cross this boundary. A push carries no envelope. A failure on
 * main's side, such as a rejected read or a malformed payload, leaves the
 * renderer holding the last list it was sent, or none.
 */

import type { PodId } from '@shared/contracts/events';

/**
 * ADDED to `ipc.ts`. One slash command as the SDK reports it (`sdk.d.ts`
 * `SlashCommand`), after normalization:
 *
 * - `name`: a non-empty string, with no leading slash (the SDK's own
 *   convention). An SDK entry that is not an object, or whose `name` is not
 *   a non-empty string, is DROPPED, and the entries after it keep their order.
 * - `description`, `argumentHint`: the SDK's string, or `''` when the SDK
 *   value is not a string.
 * - `aliases`: the string members of the SDK's array, in order; `[]` when the
 *   SDK omits the field or sends a non-array.
 */
export interface SlashCommandInfo {
  name: string;
  description: string;
  argumentHint: string;
  aliases: string[];
}

/** ADDED to `ipc.ts`. The whole visible list for one Pod: a snapshot, not a delta. */
export interface PodCommandsPush {
  podId: PodId;
  /** SDK order, terminal commands removed. May be empty. */
  commands: SlashCommandInfo[];
}

/** ADDED to `EVENT_CHANNELS` in `ipc.ts`, as the key `podCommands`. */
export type PodCommandsChannel = 'push:podCommands';

/** ADDED to `OrcastrateApi['on']` in `ipc.ts`. */
export interface OrcastrateApiOnPodCommandsAmendment {
  /** Returns an unsubscribe function, like every other `on*` member. */
  podCommands(cb: (p: PodCommandsPush) => void): () => void;
}
