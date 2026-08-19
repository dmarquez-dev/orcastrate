/**
 * THE routing mode. One constant, one source of truth (acceptance criterion 11).
 *
 * Every `LaneRouter` the app builds is constructed with this value, and
 * `app:routingMode` answers with the mode the live PodManager was given —
 * `PodManagerApi.routingMode` — rather than with a second literal. A renderer
 * that draws the lane rail is therefore never able to disagree with the router
 * that produced the events.
 *
 * The value is not a guess. `tests/fixtures/protocol/findings.json` records
 * `"recommendedRoutingMode": "lanes"`, derived from
 * `parentToolUseId.correlates: true` measured against CLI 2.1.235. That file is
 * test-corpus data and is not shipped in the packaged app, so the decision is
 * pinned here and `tests/unit/ipc/channels.test.ts` asserts the two still
 * agree — a flip in the probe becomes a failing build, not a silent divergence.
 */

import type { RoutingMode } from '../../shared/contracts/lane-router';

export const ROUTING_MODE: RoutingMode = 'lanes';
