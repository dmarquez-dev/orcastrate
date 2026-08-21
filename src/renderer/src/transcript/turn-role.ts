/**
 * Turn attribution (`contracts/transcript-turns.ts` section 1).
 *
 * THREE ROLES, NOT TWO. Two would force every diagnostic and every piece of
 * plumbing to claim to be the assistant.
 *
 * ALIGNMENT IS A SEPARATE, TWO-PRODUCER QUESTION and lives in the stylesheet,
 * not here: `'user'` renders right, `'assistant'` and `'system'` both render
 * left. The type keeps its third member because that is what lets a `system`
 * or `malformed` row carry its own treatment WITHIN the left column.
 */

import type { EventPayload } from '@shared/contracts/events';

export type TurnRole = 'user' | 'assistant' | 'system';

/**
 * TOTAL over `EventPayload`, exhaustive by a `never` assignment in the default
 * branch — the same way `EventBody` already is. A thirteenth payload must break
 * `typecheck:web` HERE rather than silently attributing itself to the system.
 *
 * `tool_result` IS 'assistant' EVEN THOUGH THE SDK DELIVERS IT INSIDE A `user`
 * MESSAGE. The transport is not the speaker; a tool result attributed to the
 * human would tell the reader they said something they did not.
 *
 * `permission_decision` IS THE SHARPEST CASE and it is recorded here rather
 * than glossed: on the normal path it records THE HUMAN'S allow/deny
 * (`pod-runner.ts:392`), but it is system-emitted on abort and on handler
 * failure, so its authorship is genuinely mixed and path-dependent. Under the
 * two-producer rule it goes left with everything else. That is tolerable only
 * because both permission types are members of `PLUMBING_EVENT_TYPES` and are
 * hidden by default; if they are ever un-hidden, this is the row to revisit
 * first.
 */
export function turnRoleOf(payload: EventPayload): TurnRole {
  switch (payload.type) {
    case 'user_message':
      return 'user';

    case 'assistant_text':
    case 'thinking':
    case 'tool_use':
    case 'tool_result':
      return 'assistant';

    case 'lane_opened':
    case 'lane_closed':
    case 'permission_request':
    case 'permission_decision':
    case 'system':
    case 'error':
    case 'malformed':
      return 'system';

    default: {
      const exhaustive: never = payload;
      // Unreachable while the union is covered above. The safe direction if it
      // ever is not: an unattributed row belongs to neither party.
      void exhaustive;
      return 'system';
    }
  }
}
