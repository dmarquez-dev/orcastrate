// @vitest-environment jsdom
/**
 * THE MATRIARCH ROW REPORTS THE POD (`contracts/lane-row-pod-status.ts`).
 *
 * The defect: the Matriarch's dot pulsed continuously and never rested while
 * Claude Code sat idle between turns. Two unions spell one word differently.
 * `LaneStatus.running` is a LIFETIME flag the database enforces — `CHECK
 * ((status = 'running') = (ended_at IS NULL))` — and the Matriarch's lane is
 * open for the Pod's whole life, so it read `running` throughout.
 * `PodStatus.running` is an ACTIVITY flag, set at turn start and cleared at
 * turn end. This suite asserts the row now reads the second one when the state
 * layer hands it down, and the first one otherwise.
 *
 * WHAT IT CANNOT SEE. Vitest blanks `*.module.css` and jsdom applies no
 * stylesheet, so neither the shapes nor the pulse are observable here;
 * `LaneRail.styles.test.ts` asserts those declarations as text and the build
 * proves the emitted animation name resolves. What IS observable is which
 * attribute the span carries, which word is beside the dot, and which hue the
 * inline custom property names — and those are what keep the two vocabularies
 * from cascading onto one dot.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PodStatus } from '@shared/contracts/events';

import { POD_STATUS_LABEL } from '../pods/pod-status';
import { statusToken } from '../shell/contract-runtime';
import { LaneRail } from './LaneRail';
import { LANE_STATUS_LABEL } from './lane-status';
import { makeCalf, makeLane, makeRow } from './test-fixtures';

// `vitest.config.ts` sets `globals: false`, so RTL never installs its own
// auto-cleanup.
afterEach(cleanup);

const noop = () => undefined;

/** Every member of `PodStatus`, re-typed so a member added without a rule here
 *  shows up as a missing case rather than as a silently smaller loop. */
const POD_STATUSES = ['idle', 'running', 'waiting', 'beached', 'closed'] as const satisfies
  readonly PodStatus[];

function renderRail(rows: Parameters<typeof LaneRail>[0]['rows']) {
  return render(
    <LaneRail rows={rows} onSelect={noop} onSteer={noop} routingMode="lanes" />,
  );
}

/** The Matriarch row, governed by the Pod. */
function renderPodRow(podStatus: PodStatus, laneStatus: 'running' | 'stopped' = 'running') {
  renderRail([makeRow(makeLane({ status: laneStatus }), { status: laneStatus, podStatus })]);
  return screen.getByTestId('lane-row:lane-matriarch');
}

describe('a Pod-governed row carries the Pod vocabulary and ONLY the Pod vocabulary', () => {
  it.each(POD_STATUSES)('exposes data-pod-status=%s and NO data-status at all', (podStatus) => {
    const row = renderPodRow(podStatus);

    const pod = row.querySelectorAll('[data-pod-status]');
    expect(pod).toHaveLength(1);
    expect((pod[0] as HTMLElement).getAttribute('data-pod-status')).toBe(podStatus);
    // The whole point: `[data-status]` still selects only lane-governed rows,
    // which is what keeps `row.querySelector('[data-status]')` in
    // `LaneRail.test.tsx`, `stopped-lane.test.tsx` and `orphaned-lane.test.tsx`
    // working with no edit, and what stops the two vocabularies — which
    // collide on the literal `running` — cascading onto one dot.
    expect(row.querySelectorAll('[data-status]')).toHaveLength(0);
  });

  it('exposes data-status and NO data-pod-status when podStatus is null', () => {
    renderRail([makeRow(makeLane({ status: 'running' }), { status: 'running' })]);
    const row = screen.getByTestId('lane-row:lane-matriarch');

    const lane = row.querySelectorAll('[data-status]');
    expect(lane).toHaveLength(1);
    expect((lane[0] as HTMLElement).getAttribute('data-status')).toBe('running');
    expect(row.querySelectorAll('[data-pod-status]')).toHaveLength(0);
  });

  it('never carries both attributes and never carries neither, for either vocabulary', () => {
    for (const podStatus of [null, ...POD_STATUSES] as const) {
      cleanup();
      renderRail([makeRow(makeLane({ status: 'running' }), { status: 'running', podStatus })]);
      const row = screen.getByTestId('lane-row:lane-matriarch');
      const marked = row.querySelectorAll('[data-status], [data-pod-status]');
      expect(marked, String(podStatus)).toHaveLength(1);
      const el = marked[0] as HTMLElement;
      expect(el.hasAttribute('data-status') !== el.hasAttribute('data-pod-status')).toBe(true);
    }
  });
});

describe('THE WORD — no invented vocabulary, taken from the shared map', () => {
  it.each(POD_STATUSES)('renders POD_STATUS_LABEL[%s] beside the dot', (podStatus) => {
    const row = renderPodRow(podStatus);
    // Imported from `pods/pod-status`, not re-typed here: the point is that
    // the row and the Pod tab say the same word, and a re-typed copy would
    // pass while the two drifted.
    expect(row.textContent).toContain(POD_STATUS_LABEL[podStatus]);
  });

  it('puts the word immediately after the dot, inside the same span', () => {
    const row = renderPodRow('waiting');
    const status = row.querySelector('[data-pod-status]') as HTMLElement;
    expect(status.textContent).toBe(POD_STATUS_LABEL.waiting);
  });

  it('keeps the lane word on a lane-governed row', () => {
    renderRail([makeRow(makeLane({ status: 'stopped' }), { status: 'stopped' })]);
    const row = screen.getByTestId('lane-row:lane-matriarch');
    expect(row.textContent).toContain(LANE_STATUS_LABEL.stopped);
  });
});

describe('THE HUE — reused from statusToken, never duplicated', () => {
  it.each(POD_STATUSES)('sets --pod-status-color to var(statusToken(%s))', (podStatus) => {
    const row = renderPodRow(podStatus);
    const status = row.querySelector('[data-pod-status]') as HTMLElement;
    // Exactly `PodTab.test.tsx:364`'s assertion, re-made on this surface: the
    // row paints from the same `--oc-status-*` token the Pod tab does.
    expect(status.style.getPropertyValue('--pod-status-color')).toBe(
      `var(${statusToken(podStatus)})`,
    );
  });

  it('sets no inline hue on a lane-governed row, whose hues are static CSS', () => {
    renderRail([makeRow(makeLane({ status: 'running' }), { status: 'running' })]);
    const status = screen
      .getByTestId('lane-row:lane-matriarch')
      .querySelector('[data-status]') as HTMLElement;
    expect(status.style.getPropertyValue('--pod-status-color')).toBe('');
  });
});

describe('CALVES ARE UNTOUCHED, asserted rather than assumed', () => {
  /**
   * A rail holding a Pod-governed Matriarch AND Calves. A `running` Calf
   * genuinely is working: a Calf is created when dispatched and ends when its
   * subagent finishes, and a subagent never waits on user input.
   */
  function renderMixedRail() {
    const calfRunning = makeCalf({ id: 'lane-calf-run', subagentType: 'reviewer' });
    const calfDone = makeCalf({
      id: 'lane-calf-done',
      subagentType: 'tester',
      status: 'done',
      endedAt: '2026-01-01T00:01:00.000Z',
    });
    renderRail([
      makeRow(makeLane(), { podStatus: 'idle' }),
      makeRow(calfRunning, { status: 'running' }),
      makeRow(calfDone, { status: 'done' }),
    ]);
    // A finished Calf is collapsed behind the rail's disclosure, so it has to
    // be revealed before it can be asserted about. That is existing behaviour
    // this change does not touch, and the finished row is worth including: it
    // is the one that proves a TERMINAL lane status is still the row's own.
    fireEvent.click(screen.getByTestId('lane-rail-finished-toggle'));
    return {
      matriarch: screen.getByTestId('lane-row:lane-matriarch'),
      running: screen.getByTestId('lane-row:lane-calf-run'),
      done: screen.getByTestId('lane-row:lane-calf-done'),
    };
  }

  it('leaves every Calf on data-status carrying its OWN LaneStatus', () => {
    const { running, done } = renderMixedRail();
    expect((running.querySelector('[data-status]') as HTMLElement).getAttribute('data-status')).toBe(
      'running',
    );
    expect((done.querySelector('[data-status]') as HTMLElement).getAttribute('data-status')).toBe(
      'done',
    );
  });

  it('gives no Calf a data-pod-status, whatever the Pod is doing', () => {
    const { matriarch, running, done } = renderMixedRail();
    // The Matriarch beside them IS Pod-governed, so the rail demonstrably
    // rendered both branches in one tree.
    expect(matriarch.querySelectorAll('[data-pod-status]')).toHaveLength(1);
    expect(running.querySelectorAll('[data-pod-status]')).toHaveLength(0);
    expect(done.querySelectorAll('[data-pod-status]')).toHaveLength(0);
  });

  it('keeps the lane word on every Calf', () => {
    const { running, done } = renderMixedRail();
    expect(running.textContent).toContain(LANE_STATUS_LABEL.running);
    expect(done.textContent).toContain(LANE_STATUS_LABEL.done);
  });

  it('keeps a running Calf matching the LANE pulse selector', () => {
    const { running } = renderMixedRail();
    // The selector `LaneRail.module.css` animates for the lane vocabulary. A
    // running Calf still matches it, because it really is working.
    expect(running.querySelector("[data-status='running']")).not.toBeNull();
  });
});

describe('the one-mark rule and the accessibility floor survive on the Pod branch', () => {
  it.each(POD_STATUSES)('draws exactly one aria-hidden mark on the meta line (%s)', (podStatus) => {
    const row = renderPodRow(podStatus);
    const status = row.querySelector('[data-pod-status]') as HTMLElement;
    const meta = status.parentElement as HTMLElement;

    const marks = [...meta.querySelectorAll('[aria-hidden="true"]')];
    expect(marks).toHaveLength(1);
    const dot = marks[0] as HTMLElement;
    expect(dot.parentElement).toBe(status);
    // The dot carries nothing by itself: no text, no children, no test id.
    expect(dot.tagName).toBe('SPAN');
    expect(dot.textContent).toBe('');
    expect(dot.children).toHaveLength(0);
    expect(dot.getAttribute('data-testid')).toBeNull();
    // Nothing anywhere in the row is a mounted indicator.
    expect(row.querySelector('[data-testid*="indicator"]')).toBeNull();
  });

  it('leaves the Awaiting permission line alone even when the Pod reads waiting', () => {
    // Driven by `awaitingPermission` and by nothing else. Whether the two marks
    // should merge is a design question this session did not ask.
    renderRail([
      makeRow(makeLane(), { podStatus: 'waiting', awaitingPermission: false }),
    ]);
    expect(screen.getByTestId('lane-row:lane-matriarch').textContent).not.toContain(
      'Awaiting permission',
    );

    cleanup();
    renderRail([
      makeRow(makeLane(), { podStatus: 'waiting', awaitingPermission: true }),
    ]);
    const row = screen.getByTestId('lane-row:lane-matriarch');
    expect(row.textContent).toContain('Awaiting permission');
    // ...and it brings its own mark, which is why the meta line now holds two.
    const status = row.querySelector('[data-pod-status]') as HTMLElement;
    const meta = status.parentElement as HTMLElement;
    expect(meta.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it('shows the same Awaiting permission line on a lane-governed row', () => {
    // Unchanged behaviour, asserted so the Pod branch above is a comparison
    // rather than an isolated claim.
    renderRail([makeRow(makeLane(), { awaitingPermission: true })]);
    expect(screen.getByTestId('lane-row:lane-matriarch').textContent).toContain(
      'Awaiting permission',
    );
  });
});
