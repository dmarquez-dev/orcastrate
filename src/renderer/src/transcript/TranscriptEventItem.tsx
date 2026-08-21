import { memo, type ReactNode } from 'react';

import type { EventPayload, Lane, LaneId, NormalizedEvent } from '@shared/contracts/events';

import { TEST_IDS } from '../contracts/renderer-view';
import { LANE_STATUS_LABEL } from '../lanes/lane-status';
import { testId } from '../shell/contract-runtime';
import { DispatchCard, dispatchedLaneIdOf } from './DispatchCard';
import { ToolDisclosure } from './ToolDisclosure';
import styles from './Transcript.module.css';
import { summarizeToolCall, toolResultCharCount, toolResultSizeLabel } from './tool-summary';
import { turnRoleOf } from './turn-role';

/** Verbatim, display-only rendering of an opaque SDK value. Never interpreted. */
function preview(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function Labelled({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <>
      <span className={styles.eventLabel}>{label}</span>
      {children}
    </>
  );
}

/**
 * Every member of the frozen `EventType` union renders. The switch is
 * exhaustive over the payload discriminant and ends in a `never` assignment,
 * so adding a thirteenth payload to the contract breaks `typecheck:web` here
 * instead of silently dropping events on the floor.
 */
function EventBody({ payload }: { payload: EventPayload }) {
  switch (payload.type) {
    case 'user_message':
      return (
        <Labelled label="You">
          <p className={styles.eventText}>{payload.text}</p>
        </Labelled>
      );

    case 'assistant_text':
      return (
        <Labelled label="Claude">
          <p className={styles.eventText}>{payload.text}</p>
        </Labelled>
      );

    case 'thinking':
      return (
        <Labelled label="Thinking">
          <p className={`${styles.eventText} ${styles.muted}`}>{payload.text}</p>
        </Labelled>
      );

    // COMPACT, NOT GONE. The one-line summary replaces the JSON dump on the
    // page; the disclosure brings back EXACTLY what the `<pre>` showed before,
    // through the same `preview()` path, verbatim and display-only.
    case 'tool_use':
      return (
        <Labelled label="Tool">
          <ToolDisclosure
            showLabel="Show tool input"
            hideLabel="Hide tool input"
            summary={summarizeToolCall(payload.name, payload.input)}
            renderBody={() => preview(payload.input)}
          />
        </Labelled>
      );

    // The `└` and the indent belong to THIS row, not to a merged call-and-result
    // row: `tool_use` and `tool_result` are two events with two `seq` values and
    // they are frequently not adjacent. The glyph makes the result READ as
    // attached to the call above it without the two rows becoming one, and when
    // the call is not on screen the result still renders, still legible.
    case 'tool_result': {
      const size = toolResultSizeLabel(toolResultCharCount(payload.content));
      // The NAME is the same in both cases on purpose: it states the action and
      // the size, and the failure is carried by the row's LABEL ("Tool result
      // (error)") in words, where a reader who cannot see colour still meets it.
      return (
        <Labelled label={payload.isError ? 'Tool result (error)' : 'Tool result'}>
          <ToolDisclosure
            attached
            expandedInitially={payload.isError}
            showLabel={`Show tool result (${size})`}
            hideLabel={`Hide tool result (${size})`}
            summary={size}
            bodyClassName={payload.isError ? styles.failed : undefined}
            renderBody={() => preview(payload.content)}
          />
        </Labelled>
      );
    }

    case 'lane_opened':
      return (
        <Labelled label="Lane opened">
          <p className={styles.eventText}>
            {payload.lane.subagentType ?? 'matriarch'}
            {payload.lane.description === null ? '' : ` — ${payload.lane.description}`}
          </p>
        </Labelled>
      );

    case 'lane_closed':
      return (
        <Labelled label="Lane closed">
          <p className={styles.eventText}>
            <span className={styles.status} data-status={payload.status}>
              <span className={styles.dot} aria-hidden="true" />
              {LANE_STATUS_LABEL[payload.status]}
            </span>
          </p>
        </Labelled>
      );

    case 'permission_request':
      return (
        <Labelled label="Permission requested">
          <p className={styles.eventText}>{payload.toolName}</p>
          <pre className={styles.eventCode}>{preview(payload.input)}</pre>
        </Labelled>
      );

    case 'permission_decision':
      return (
        <Labelled label="Permission decision">
          <p className={styles.eventText}>
            {payload.decision}
            {payload.reason === undefined ? '' : ` — ${payload.reason}`}
          </p>
        </Labelled>
      );

    case 'system':
      return (
        <Labelled label={`System: ${payload.subtype}`}>
          <pre className={styles.eventCode}>{preview(payload.data)}</pre>
        </Labelled>
      );

    case 'error':
      // Spec 8: a Beached process carries its exit code, and the code is the
      // one detail that tells the user whether it crashed or was killed. Shown
      // when present, omitted when null or absent — never printed as
      // "undefined".
      return (
        <Labelled label="Error">
          <p className={`${styles.eventText} ${styles.failed}`} role="alert">
            {payload.message}
          </p>
          {payload.exitCode === undefined || payload.exitCode === null ? null : (
            <p className={styles.eventMeta}>Exit code {payload.exitCode}</p>
          )}
        </Labelled>
      );

    case 'malformed':
      // Spec 8: the raw line is SHOWN, not skipped. An unparseable line that
      // vanishes from the transcript is indistinguishable from a line that was
      // never sent, which is exactly the failure this event type exists to
      // make visible.
      return (
        <Labelled label="Unparseable stream line">
          <pre className={`${styles.eventCode} ${styles.failed}`} data-raw-line="true">
            {payload.rawLine}
          </pre>
          <p className={styles.eventMeta}>{payload.parseError}</p>
        </Labelled>
      );

    default: {
      const exhaustive: never = payload;
      return <pre className={styles.eventCode}>{preview(exhaustive)}</pre>;
    }
  }
}

export interface TranscriptEventItemProps {
  event: NormalizedEvent;
  /**
   * Lanes this event's dispatch opened, when it is a dispatch. `undefined` for
   * every other event, which keeps `memo` effective: a non-dispatch item's
   * props are referentially identical across re-renders.
   */
  dispatchLanes?: Lane[];
  onJumpToLane(laneId: LaneId): void;
}

function TranscriptEventItemImpl({ event, dispatchLanes, onJumpToLane }: TranscriptEventItemProps) {
  const isDispatch = dispatchedLaneIdOf(event) !== undefined;

  return (
    <li
      className={styles.event}
      data-testid={testId(TEST_IDS.transcriptEvent, String(event.seq))}
      data-event-type={event.payload.type}
      /*
       * HOW THE ROLE REACHES THE PAGE, channel 1 of 4. This is what CSS keys on
       * and what a test may select by. IT IS NOT AN ACCESSIBILITY CHANNEL and
       * does not count as one: the visible role label ("You", "Claude", …) is
       * the primary carrier for a screen reader and for anyone who cannot
       * distinguish the colours, and it stays real text outside `aria-hidden`.
       */
      data-turn-role={turnRoleOf(event.payload)}
    >
      {isDispatch ? (
        <DispatchCard event={event} lanes={dispatchLanes ?? []} onJumpToLane={onJumpToLane} />
      ) : (
        <EventBody payload={event.payload} />
      )}
    </li>
  );
}

export const TranscriptEventItem = memo(TranscriptEventItemImpl);
