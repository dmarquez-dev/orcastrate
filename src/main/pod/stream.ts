/**
 * Stream-shape helpers: what one item off the CLI stream is, how a raw NDJSON
 * line becomes one, and the few fields PodRunner itself needs to read out of a
 * message. Everything richer (lanes, normalization) is LaneRouter's job — this
 * file deliberately knows almost nothing about message content.
 */

/**
 * One item as it arrives from the SDK boundary.
 *
 * `malformed` exists because spec 8 requires a line that cannot be parsed to be
 * surfaced and skipped rather than to tear the stream down.
 *
 * MEASURED CAVEAT, and it is important: the real SDK never yields `malformed`.
 * `sdk.mjs` parses stdout itself and, on a parse failure, does
 * `on(\`Non-JSON stdout: ${n}\`); continue` — the bad line is written to the
 * SDK's own logger and dropped before any consumer sees it. So on the
 * production path `onMalformed` fires only for the second class of malformation
 * PodRunner can still detect: a value that parsed as JSON but is not a message
 * envelope (see `classifyMessage`). The `malformed` variant is what the
 * fixture-replay boundary produces, and it keeps the runner's skip-and-continue
 * behaviour under test with production code rather than test-only code.
 */
export type PodStreamItem =
  | { kind: 'message'; message: unknown }
  | { kind: 'malformed'; rawLine: string; parseError: string };

/**
 * Parses one raw NDJSON line into a stream item. Never throws: a bad line
 * becomes a `malformed` item so the caller's loop is not a try/catch.
 */
export function parseStreamLine(rawLine: string): PodStreamItem {
  try {
    return { kind: 'message', message: JSON.parse(rawLine) };
  } catch (err) {
    return {
      kind: 'malformed',
      rawLine,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

/** The minimal envelope PodRunner requires of anything it forwards. */
export interface StreamMessageEnvelope {
  type: string;
  subtype?: string;
  session_id?: string;
}

/**
 * Checks a parsed value is a message envelope. An unknown `type` is fine — the
 * probe found `quantum_flux` planted in the corpus and several real
 * `system/*` subtypes the design spec never names — so this only rejects values
 * that could not possibly be routed.
 */
export function asEnvelope(value: unknown): StreamMessageEnvelope | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const type: unknown = (value as { type?: unknown }).type;
  if (typeof type !== 'string' || type.length === 0) return null;
  const envelope: StreamMessageEnvelope = { type };
  const subtype: unknown = (value as { subtype?: unknown }).subtype;
  if (typeof subtype === 'string') envelope.subtype = subtype;
  const sessionId: unknown = (value as { session_id?: unknown }).session_id;
  if (typeof sessionId === 'string' && sessionId.length > 0) envelope.session_id = sessionId;
  return envelope;
}

/** True for the SDK `result` message that ends a turn. */
export function isTurnEnd(envelope: StreamMessageEnvelope): boolean {
  return envelope.type === 'result';
}

/**
 * True for the two message types the repo has MEASURED as authoritatively
 * naming the CLI session that this query is talking to. Contract
 * `pod-lifecycle.ts` section 8, escalation E2 resolved as option A at Gate 2:
 *
 *   - `system` with `subtype: 'init'` — what `probe/run-probe.ts:740` reads back
 *     to prove a resume worked;
 *   - `result` — what `probe/run-probe.ts:638-641` fed to `options.resume` in
 *     the one verified resume run.
 *
 * A `session_id` on ANY other message type is ignored for capture. Nothing
 * requires the first `session_id`-bearing message in the stream to name THIS
 * query's session: a hook-emitted message carrying a foreign id and arriving
 * before `system/init` would otherwise become the Pod's permanent resume id,
 * and `pods.reconnect` would then resume someone else's conversation.
 *
 * This narrows CAPTURE only. Every message is still forwarded to the consumer
 * unmodified — routing is LaneRouter's job and is unaffected.
 */
export function isAuthoritativeSessionSource(envelope: StreamMessageEnvelope): boolean {
  if (envelope.type === 'result') return true;
  return envelope.type === 'system' && envelope.subtype === 'init';
}
