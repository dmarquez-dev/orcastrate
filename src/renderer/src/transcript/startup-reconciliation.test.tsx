// @vitest-environment jsdom
/**
 * The startup-reconciliation notice is legible in the transcript — AND its
 * ABSENCE is asserted too.
 *
 * NOTHING IS ADDED TO THE RENDERER FOR THIS. `SystemPayload.subtype` is a free
 * string, so the sweep's notice is an ordinary `system` event and the EXISTING
 * `system` branch of `TranscriptEventItem` renders it. This suite proves that
 * claim rather than restating it: the reason sentence reaches the DOM, the row
 * is typed `system` and not routed to the `never` fallback, and the row is not
 * empty.
 *
 * THE SECOND TEST IS THE ONE THAT CARRIES INFORMATION. The sweep writes this
 * event only for Pods whose LANES were reconciled; a Pod that merely went
 * `'idle'` -> `'closed'` at boot gets no row at all. A notice that fired in
 * every Pod on every relaunch would train the user to ignore the one that
 * matters, so "no row" is a requirement and is asserted as one.
 *
 * The reason sentence is written out here as a literal on purpose, and it is
 * the ONLY copy this file still keeps. Pinning the words locally is what makes
 * this a wording assertion rather than a tautology against whatever the
 * producer currently says.
 *
 * AMENDED 2026-10-09. The sentence and the marker used to live only in
 * `src/main/pod-manager/startup-reconciliation.ts`, which no renderer file may
 * import EXCEPT the one named in `hygiene.test.ts`'s `MAIN_REACHING_FILES` —
 * `__tests__/relaunch.e2e.test.tsx`, which runs a real `PodManager` because the
 * defect it reproduces is a disagreement between main and the renderer and a
 * stub cannot hold both sides of one. Both now have a single definition in
 * `src/shared/startup-reconciliation-notice.ts`, which this program does
 * include, so no exception is needed to reach them. The MARKER is therefore
 * read from there rather than copied: a local copy of it was a tautology, not
 * a wording assertion, because the marker's identity is the whole of what the
 * filter matches on.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NormalizedEvent } from '@shared/contracts/events';
import { STARTUP_RECONCILIATION_SUBTYPE } from '@shared/startup-reconciliation-notice';

import { TranscriptEventItem } from './TranscriptEventItem';
import { makeEvent } from './test-fixtures';

// Imported for its `afterEach(cleanup)` side effect.
import '../test-utils';

/**
 * The marker as the boot sweep writes it, read from its single definition
 * under `src/shared/**` rather than copied. The REASON sentence below stays a
 * local literal on purpose — see the docblock above: pinning the words here is
 * a wording assertion, and the only one of the two that is worth keeping as a
 * copy. The marker never was: a local copy of it made this suite agree with
 * the filter whatever the producer wrote.
 */
const SUBTYPE = STARTUP_RECONCILIATION_SUBTYPE;

/** Verbatim, as `StartupReconciliationData.reason` fixes it. */
const REASON =
  'Orcastrate restarted while this Pod was still open. No Claude Code process ' +
  'survives an application restart, so lanes left running were marked ' +
  'Orphaned. Press Open to start this Pod again.';

function reconciliationEvent(): NormalizedEvent {
  return makeEvent(7, {
    type: 'system',
    subtype: SUBTYPE,
    data: {
      subtypeMarker: SUBTYPE,
      reason: REASON,
      statusBefore: 'running',
      statusAfter: 'closed',
      orphanedLaneIds: ['lane-matriarch', 'lane-calf-1'],
      at: '2026-01-02T00:00:00.000Z',
    },
  });
}

function renderEvents(events: NormalizedEvent[]) {
  return render(
    <ul>
      {events.map((event) => (
        <TranscriptEventItem key={event.seq} event={event} onJumpToLane={vi.fn()} />
      ))}
    </ul>,
  );
}

describe('the startup-reconciliation notice in the transcript', () => {
  it('renders its reason sentence through the existing system branch', () => {
    renderEvents([reconciliationEvent()]);

    const row = screen.getByTestId('transcript-event:7');
    // The EXISTING branch: typed `system`, labelled with the subtype, and not
    // routed to the exhaustive-`never` fallback.
    expect(row.getAttribute('data-event-type')).toBe('system');
    expect(row.textContent).toContain(`System: ${SUBTYPE}`);

    // The sentence itself, word for word, and the ids a later reader joins back
    // to the lane rows.
    expect(row.textContent).toContain(REASON);
    expect(row.textContent).toContain('lane-matriarch');
    expect(row.textContent).toContain('lane-calf-1');

    // Not an empty row: the reason alone is longer than the label.
    expect((row.textContent ?? '').trim().length).toBeGreaterThan(REASON.length);
  });

  it('needs no new chrome — the row is an ordinary transcript item', () => {
    renderEvents([reconciliationEvent()]);

    // No modal, no toast, no dismissible banner. The durable row is the whole
    // of the user-facing story, so nothing here announces itself over the top
    // of the transcript or offers a way to dismiss it.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('transcript-event:7').tagName).toBe('LI');
  });

  it('renders NO such row for a Pod that merely went idle -> closed at boot', () => {
    // The quiet case: the sweep corrected the Pod's status and reconciled no
    // lane, so it wrote no event. The transcript holds what it held before.
    renderEvents([
      makeEvent(1, { type: 'user_message', text: 'hello' }),
      makeEvent(2, { type: 'assistant_text', text: 'hi' }),
    ]);

    expect(screen.queryByText(REASON)).toBeNull();
    expect(document.body.textContent).not.toContain(SUBTYPE);
    expect(screen.queryAllByTestId(/^transcript-event:/)).toHaveLength(2);
    // Nothing typed `system` at all — the absence is of the ROW, not merely of
    // the sentence.
    expect(document.querySelectorAll('[data-event-type="system"]')).toHaveLength(0);
  });
});
