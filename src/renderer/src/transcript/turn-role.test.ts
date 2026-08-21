/**
 * `turnRoleOf` at the unit, over every member of the frozen union.
 *
 * The DOM half of this guarantee lives in `TranscriptEventItem.test.tsx`, which
 * asserts the full ordered list of `(data-event-type, data-turn-role)` pairs
 * the pane actually renders. This file pins the FUNCTION, so a role regression
 * is attributed here rather than looking like a rendering bug.
 */

import { describe, expect, it } from 'vitest';

import type { EventPayload, EventType } from '@shared/contracts/events';

import { turnRoleOf, type TurnRole } from './turn-role';

/**
 * `Record<EventType, …>` stops type-checking the moment the union grows, which
 * is a SECOND, independent guard on the same exhaustiveness the `never`
 * assignment in `turnRoleOf` enforces at compile time.
 */
const PAYLOADS: Record<EventType, EventPayload> = {
  user_message: { type: 'user_message', text: 'u' },
  assistant_text: { type: 'assistant_text', text: 'a' },
  thinking: { type: 'thinking', text: 't' },
  tool_use: { type: 'tool_use', toolUseId: 'toolu_1', name: 'Read', input: {} },
  tool_result: { type: 'tool_result', toolUseId: 'toolu_1', isError: false, content: 'ok' },
  lane_opened: {
    type: 'lane_opened',
    lane: {
      id: 'lane-calf-1',
      podId: 'pod-1',
      kind: 'calf',
      toolUseId: 'toolu_1',
      agentId: 'agent_1',
      parentLaneId: 'lane-matriarch',
      depth: 1,
      subagentType: 'reviewer',
      description: null,
      status: 'running',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: null,
    },
  },
  lane_closed: { type: 'lane_closed', laneId: 'lane-calf-1', status: 'done' },
  permission_request: {
    type: 'permission_request',
    requestId: 'r',
    toolName: 'Bash',
    input: {},
    toolUseId: 'toolu_1',
  },
  permission_decision: { type: 'permission_decision', requestId: 'r', decision: 'allow' },
  system: { type: 'system', subtype: 'init', data: null },
  error: { type: 'error', message: 'boom', exitCode: null },
  malformed: { type: 'malformed', rawLine: 'x', parseError: 'y' },
};

const EXPECTED: Record<EventType, TurnRole> = {
  user_message: 'user',
  // What the model said, thought, did, and got back. `tool_result` is
  // 'assistant' EVEN THOUGH the SDK delivers it inside a `user` message: the
  // transport is not the speaker.
  assistant_text: 'assistant',
  thinking: 'assistant',
  tool_use: 'assistant',
  tool_result: 'assistant',
  // Orcastrate and the runtime talking, not either party to the conversation.
  lane_opened: 'system',
  lane_closed: 'system',
  permission_request: 'system',
  permission_decision: 'system',
  system: 'system',
  error: 'system',
  malformed: 'system',
};

describe('turnRoleOf', () => {
  it('attributes all twelve EventType members, and the table is not vacuous', () => {
    const types = Object.keys(PAYLOADS) as EventType[];
    expect(types).toHaveLength(12);
    expect(types.map((type) => [type, turnRoleOf(PAYLOADS[type])])).toEqual(
      types.map((type) => [type, EXPECTED[type]]),
    );
  });

  it('gives the user exactly ONE member — the human, and nothing else', () => {
    const users = (Object.keys(PAYLOADS) as EventType[]).filter(
      (type) => turnRoleOf(PAYLOADS[type]) === 'user',
    );
    expect(users).toEqual(['user_message']);
  });

  it('keeps THREE roles, not two — the third is not collapsed away', () => {
    const roles = new Set(
      (Object.keys(PAYLOADS) as EventType[]).map((type) => turnRoleOf(PAYLOADS[type])),
    );
    expect([...roles].sort()).toEqual(['assistant', 'system', 'user']);
  });
});
