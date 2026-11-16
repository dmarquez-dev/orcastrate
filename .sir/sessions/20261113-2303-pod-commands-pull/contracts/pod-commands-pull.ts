// frozen: 20261113-2303-pod-commands-pull, Gate 2
/**
 * CONTRACT: the `pod:commands` invoke channel, a pull of one Pod's visible
 * slash-command list, as an amendment to `src/shared/contracts/ipc.ts`.
 *
 * WHERE THE DECLARATIONS LIVE. Every declaration below is written ONCE, by T1,
 * in `src/shared/contracts/ipc.ts`, and every consumer imports it from there
 * (`@shared/contracts/ipc` in the renderer). Nothing re-declares either one.
 * Nothing in the source tree cites this file, its directory, or the session id
 * in the header above: a docblock restates the rule it needs in place.
 *
 * Boundary between:
 *   - T1 (PRODUCER) adds both declarations to `src/shared/contracts/ipc.ts`,
 *     implements the method in the preload bridge (`src/preload/api.ts`), and
 *     answers the channel in main (`src/main/ipc/handlers.ts` over
 *     `src/main/pod-manager/**`).
 *   - T2 (CONSUMER) calls `pods.commands` from the workspace store's `start()`,
 *     implements it in the renderer's stub API, and classifies the channel in
 *     the renderer's failure-path sweep.
 *
 * `PodCommandsPush` and `EVENT_CHANNELS` do not change. `INVOKE_CHANNELS` grows
 * from 22 members to 23.
 */

import type { PodId } from '../../../../src/shared/contracts/events';
import type { IpcResult, SlashCommandInfo } from '../../../../src/shared/contracts/ipc';

/**
 * The ONE member T1 adds to `INVOKE_CHANNELS`, after `podFork`. The key
 * follows the existing camel-case-of-the-wire-name convention, so it is
 * `podCommands`, the same key `EVENT_CHANNELS` already uses for
 * `'push:podCommands'`. The two objects are separate, and the wire names stay
 * distinct (`'pod:commands'` against `'push:podCommands'`). In the renderer's
 * stub this key is an `InvokeChannelKey`, so `calls.podCommands` and
 * `failInvoke('podCommands', ...)` name the pull, and `listenerCount('podCommands')`
 * still names the push.
 */
export declare const INVOKE_CHANNELS_ADDITION: {
  readonly podCommands: 'pod:commands';
};

/**
 * The ONE member T1 adds to `OrcastrateApi['pods']`. The preload bridge
 * forwards the bare `podId` as the only invoke argument, the same way
 * `pods.fork` does.
 */
export interface OrcastrateApiPodsAddition {
  /**
   * Main's CURRENT visible slash-command list for the Pod `podId`.
   *
   * WHAT IT ANSWERS, as `{ ok: true, value }`:
   *   - For an open Pod whose session has a visible list: that list. It is the
   *     list main would push now, under the same rules as `PodCommandsPush`:
   *     every entry normalized as `SlashCommandInfo` says, in the SDK's order,
   *     minus every command the session's latest `system`/`init` names in
   *     `terminal_slash_commands`. It is equal, entry by entry on all four
   *     fields, to the `commands` of the last `push:podCommands` main emitted
   *     for that session.
   *   - For an open Pod whose session has no catalog yet (the initial read has
   *     not answered, timed out, rejected, or the runner has no command
   *     surface, and no `commands_changed` has arrived): `[]`.
   *   - For a Pod with no live session (`'closed'` or `'beached'`, including a
   *     Pod that had a list before it was closed): `[]`. A list never outlives
   *     the session that reported it.
   *
   * It reads only. It emits no push, writes no row, logs nothing, and starts
   * no `supportedCommands()` read.
   *
   * RESOLVES, NEVER REJECTS. ERRORS, as `{ ok: false, error: { code, message } }`:
   *   INVALID_ARGUMENT  `podId` is not a non-empty string.
   *   NOT_FOUND         no Pod row has that id.
   *   INTERNAL          anything else, through the handler envelope.
   */
  commands(podId: PodId): Promise<IpcResult<SlashCommandInfo[]>>;
}

/*
 * ORDERING, AND THE RULE THE RENDERER APPLIES. (Semantics only: this block
 * declares nothing.)
 *
 * What a consumer may rely on:
 *   - Main computes the answer synchronously when it handles the invoke, from
 *     the same state its pushes are cut from, and every change to a live
 *     session's visible list is pushed. So an answer is never newer than a
 *     push main emitted after it, and never differs from the last push main
 *     emitted before it for that session.
 *   - Pushes for one Pod still arrive in the order main emitted them, and each
 *     is still the whole list.
 *   - The rule below does not depend on the invoke reply and a push arriving
 *     in any particular order relative to each other: whichever arrives first,
 *     keeping the push loses nothing the answer carried.
 *
 * The rule (PUSH WINS): the renderer DROPS a pull answer for Pod P if any
 * `push:podCommands` for P arrived after the pull for P was sent. A push for P
 * that arrived BEFORE the pull was sent does not drop it, and a push for any
 * other Pod never drops it. When the answer is not dropped, it replaces P's
 * list wholesale, exactly as a push would. An empty answer leaves P's list
 * as the renderer's one shared empty list.
 *
 * WHEN THE RENDERER PULLS: once for every Pod in the list the first
 * successful `pods.list` inside the workspace store's `start()` returns, with
 * all of those pulls issued together. A Pod switch, a later `refreshPods`, or
 * a Pod created after start issues no pull.
 *
 * A FAILED PULL IS SILENT: no notification, no error field, and no state
 * change. The Pod's list stays as it was until a push arrives.
 */
