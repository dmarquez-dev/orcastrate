# Gate 3: slash-command-autocomplete (small, sir 1.0.27)

## Decisions
- Feasible. SDK 0.3.235 exposes `Query.supportedCommands()` (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2506`) and a `system`/`commands_changed` push (`sdk.d.ts:3132-3137`) that replaces the list when plugins or skills change mid-session. Neither is plumbed: `src/main/pod/sdk-bridge.ts:72-79` exposes only `interrupt`, `setPermissionMode`, `initializationResult`; nothing in `src/main` handles `commands_changed`.
- Open, carried in the backlog line: ghost text vs 5-row dropdown; hiding `terminal_slash_commands` (`sdk.d.ts:4770`); which commands execute when sent as a prompt through the SDK.

## Criteria
1. Feasibility settled from repository evidence — met (anchors above, read this session).
2. One backlog line appended under Ungrouped with this session id and re-measured anchors — met.
3. No source file changed — met.

## Deviation
No implementer or reviewer dispatched: the only output is the Gate 3 backlog append, which the orchestrator writes. Anchors verified by the orchestrator in this session.

## Backlog
Removed 0, appended 1 (Composer slash-command autocomplete).

## Metrics
userInteractions=1 escalationsRaised=0 reviewRounds=0. Approved by the user 2026-11-10.
