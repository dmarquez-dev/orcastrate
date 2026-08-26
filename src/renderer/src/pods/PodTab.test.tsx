// @vitest-environment jsdom
/**
 * The tab's chrome: the `Closed` LABEL, the status dot's token, and the TWO
 * controls the tab now carries.
 *
 * REWRITTEN, not extended, for the run control. This file used to describe one
 * always-present `x` whose meaning was "Close" for every Pod, beside a run
 * control labelled with a bare word. Both descriptions are of behaviour that no
 * longer exists: the tab now carries a run/stop control (PLAY when the Pod has
 * no process, PAUSE when it has one) and — only when there is no process — a
 * separate red delete control.
 *
 * `PodTab` is presentational. It takes a `PodTabVm` and callbacks, reaches
 * around its props into nothing, and re-derives openness from nothing —
 * `opened` arrives already computed by the state layer's single derivation, and
 * this component only decides WHICH controls to offer and what to call them.
 * Every test below therefore drives it with data alone.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WORKING_INDICATOR_TEST_ID } from '../activity';
import { statusToken } from '../shell/contract-runtime';
import {
  PodTab,
  POD_TAB_DELETE_TEST_ID,
  POD_TAB_OPEN_TEST_ID,
  POD_TAB_STOP_TEST_ID,
  type PodTabProps,
} from './PodTab';
import { runControlFor } from './run-control';
import { tabVm, type TabOverrides } from './test-fixtures';

// Imported for its `afterEach(cleanup)` side effect.
import '../test-utils';

function renderTab(overrides: TabOverrides, props: Partial<PodTabProps> = {}) {
  const onOpen = vi.fn();
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const full: PodTabProps = {
    tab: tabVm(overrides),
    index: 0,
    total: 1,
    dragging: false,
    dropTarget: false,
    onSelect,
    onClose,
    onOpen,
    onDelete,
    onMove: vi.fn(),
    onFocusSibling: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnter: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    ...props,
  };
  // `PodTab` renders an `<li>`, so it needs a list parent to be valid markup.
  const result = render(
    <ul>
      <PodTab {...full} />
    </ul>,
  );
  return { ...result, onOpen, onSelect, onClose, onDelete, props: full };
}

const CLOSED: TabOverrides = { id: 'a', title: 'Alpha', status: 'closed', opened: false };
const BEACHED: TabOverrides = { id: 'a', title: 'Alpha', status: 'beached', opened: false };
const OPEN: TabOverrides = { id: 'a', title: 'Alpha', status: 'idle', opened: true };

/** The icon SHAPE, read from the glyph's own attribute rather than from CSS. */
function iconOf(control: HTMLElement): string | null {
  return control.querySelector('[data-icon]')?.getAttribute('data-icon') ?? null;
}

describe('the `closed` status on a Pod tab', () => {
  it('says the word Closed, so colour is not the only carrier of the state', () => {
    const { container } = renderTab(CLOSED);
    // The status word rides in the tab's screen-reader text, which is what
    // survives greyscale, colour blindness and a screen reader alike.
    expect(container.textContent).toContain('Closed');
    // `Idle` is a DIFFERENT state — open and between turns — and must not be
    // what a closed Pod reads as.
    expect(container.textContent).not.toContain('Idle');
  });

  it('paints its dot from the new token and nothing else', () => {
    const { container } = renderTab(CLOSED);
    const dot = container.querySelector<HTMLElement>('[data-status]');
    expect(dot?.getAttribute('data-status')).toBe('closed');
    expect(dot?.style.getPropertyValue('--pod-status-color')).toBe(`var(${statusToken('closed')})`);
    // Distinct from idle, which is the shortcut the widening did not take.
    expect(statusToken('closed')).not.toBe(statusToken('idle'));
  });

  it('reads Beached, not Closed, for a beached Pod', () => {
    const { container } = renderTab(BEACHED);
    expect(container.textContent).toContain('Beached, process stopped');
    expect(container.textContent).not.toContain('Closed');
  });
});

describe('the tab carries two distinct controls', () => {
  /*
   * BOTH HALVES OF EACH NEGATIVE ARE ASSERTED IN THE SAME TEST. "No delete
   * control for an opened Pod" passes trivially against a component that
   * rendered nothing at all, so every `toBeNull` below sits beside the control
   * that MUST be there in the same render.
   */
  it('offers run and delete, and only those two, for a Pod with no process', () => {
    renderTab(CLOSED);
    const run = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);
    const del = screen.getByTestId(`${POD_TAB_DELETE_TEST_ID}:a`);

    expect(run.tagName).toBe('BUTTON');
    expect(del.tagName).toBe('BUTTON');
    // The stop control is the OTHER mode of the run control, so it is absent.
    expect(screen.queryByTestId(`${POD_TAB_STOP_TEST_ID}:a`)).toBeNull();
  });

  it('offers stop and NO delete control at all for a Pod with a live process', () => {
    renderTab(OPEN);
    // Present first, so the two absences below cannot be satisfied by an empty
    // render.
    const stop = screen.getByTestId(`${POD_TAB_STOP_TEST_ID}:a`);
    expect(stop.tagName).toBe('BUTTON');
    expect(screen.getByTestId('pod-tab:a')).toBeDefined();

    // ABSENT, not disabled. A running Pod must not be one click from deletion,
    // and a disabled control is still a control the user can land on and read.
    expect(screen.queryByTestId(`${POD_TAB_DELETE_TEST_ID}:a`)).toBeNull();
    expect(screen.queryByLabelText('Delete Alpha')).toBeNull();
    expect(screen.queryByTestId(`${POD_TAB_OPEN_TEST_ID}:a`)).toBeNull();
  });

  it('draws PLAY when the Pod has no process and PAUSE when it has one', () => {
    renderTab(CLOSED);
    expect(iconOf(screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`))).toBe('play');

    renderTab(OPEN);
    expect(iconOf(screen.getByTestId(`${POD_TAB_STOP_TEST_ID}:a`))).toBe('pause');
  });

  it('draws PLAY for a beached Pod too — the icon says "this will run"', () => {
    renderTab(BEACHED);
    expect(iconOf(screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`))).toBe('play');
  });
});

describe('the stop control is honest about what it does', () => {
  it('is named Stop, not Close, because the Pod row survives', () => {
    renderTab(OPEN);
    const stop = screen.getByTestId(`${POD_TAB_STOP_TEST_ID}:a`);
    expect(stop.getAttribute('aria-label')).toBe('Stop Alpha');
    // The old name described closing the TAB, which is not what happens.
    expect(screen.queryByLabelText('Close Alpha')).toBeNull();
  });

  it('invokes the close action and nothing else', async () => {
    const user = userEvent.setup();
    const { onClose, onOpen, onDelete, onSelect } = renderTab(OPEN);
    await user.click(screen.getByTestId(`${POD_TAB_STOP_TEST_ID}:a`));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('neither control is distinguished by colour alone', () => {
  it('names the delete control Delete <title> and gives it its own icon shape', () => {
    renderTab(CLOSED);
    const del = screen.getByTestId(`${POD_TAB_DELETE_TEST_ID}:a`);
    const run = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);

    // The NAME, not a class and not a style: this is what survives for a user
    // who cannot see that the control is red.
    expect(del.getAttribute('aria-label')).toBe('Delete Alpha');
    expect(run.getAttribute('aria-label')).toBe('Open Alpha');

    // And the shapes differ, so the two are told apart in greyscale as well.
    expect(iconOf(del)).toBe('delete');
    expect(iconOf(run)).toBe('play');
    expect(iconOf(del)).not.toBe(iconOf(run));
  });

  it('asks for the confirmation rather than deleting anything', async () => {
    const user = userEvent.setup();
    const { onDelete, onClose, onOpen } = renderTab(CLOSED);
    await user.click(screen.getByTestId(`${POD_TAB_DELETE_TEST_ID}:a`));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('reaches the delete control by keyboard alone', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderTab(CLOSED);
    const del = screen.getByTestId(`${POD_TAB_DELETE_TEST_ID}:a`);

    del.focus();
    expect(document.activeElement).toBe(del);
    await user.keyboard('{Enter}');
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('the run control names the verb and, for a beached Pod, the cause', () => {
  it('is named Open <title> for a closed Pod and calls the run action', async () => {
    const user = userEvent.setup();
    const { onOpen, onSelect } = renderTab(CLOSED);
    const control = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);

    expect(control.getAttribute('aria-label')).toBe('Open Alpha');
    expect(control.getAttribute('data-verb')).toBe('open');

    await user.click(control);
    expect(onOpen).toHaveBeenCalledTimes(1);
    // Starting the Pod is not selecting it; the tab's own handler is untouched.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('carries the CAUSE in the name for a beached Pod, and asks for reconnect', async () => {
    const user = userEvent.setup();
    const { onOpen } = renderTab(BEACHED);
    const control = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);

    // The whole of design section 8's requirement, at the one affordance the
    // user can act on. The name says which verb AND why, because the icon is
    // the same PLAY triangle a closed Pod gets.
    expect(control.getAttribute('aria-label')).toBe('Reconnect Alpha, stopped with an error');
    expect(control.getAttribute('data-verb')).toBe('reconnect');

    await user.click(control);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('takes both the name and the verb from runControlFor and derives nothing itself', () => {
    for (const overrides of [CLOSED, BEACHED]) {
      const { unmount } = renderTab(overrides);
      const vm = runControlFor(overrides.status ?? 'idle', 'Alpha');
      const control = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);
      expect(control.getAttribute('aria-label')).toBe(vm.accessibleName);
      expect(control.getAttribute('data-verb')).toBe(vm.verb);
      unmount();
    }
  });

  it('KEEPS focus on the run/stop control when the Pod opens under the user', () => {
    // The accessibility floor: focus moves predictably after an action that
    // changes what is on screen. Here it does not have to move at all — the
    // run/stop control is ONE element whose mode changes, so the user who
    // pressed Open is still on the same button, now named Stop.
    const { rerender, props } = renderTab(CLOSED);
    const control = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);
    control.focus();

    rerender(
      <ul>
        <PodTab {...props} tab={tabVm(OPEN)} />
      </ul>,
    );

    const stop = screen.getByTestId(`${POD_TAB_STOP_TEST_ID}:a`);
    expect(document.activeElement).toBe(stop);
    expect(stop.getAttribute('aria-label')).toBe('Stop Alpha');
    expect(screen.queryByTestId(`${POD_TAB_OPEN_TEST_ID}:a`)).toBeNull();
  });

  it('rescues focus to the run/stop control when the DELETE control unmounts', () => {
    // The delete control does unmount when the Pod opens, which strands focus
    // on `document.body`. It lands on the neighbouring control instead.
    const { rerender, props } = renderTab(CLOSED);
    screen.getByTestId(`${POD_TAB_DELETE_TEST_ID}:a`).focus();

    rerender(
      <ul>
        <PodTab {...props} tab={tabVm(OPEN)} />
      </ul>,
    );

    expect(screen.queryByTestId(`${POD_TAB_DELETE_TEST_ID}:a`)).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId(`${POD_TAB_STOP_TEST_ID}:a`));
  });

  it('leaves focus alone when it had already moved somewhere else', () => {
    const { rerender, props } = renderTab(CLOSED);
    screen.getByTestId(`${POD_TAB_DELETE_TEST_ID}:a`).focus();
    const elsewhere = screen.getByTestId('pod-tab:a').ownerDocument.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();

    rerender(
      <ul>
        <PodTab {...props} tab={tabVm(OPEN)} />
      </ul>,
    );

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});
/**
 * The status word each non-running state puts in the tab's screen-reader
 * sentence. Duplicated from `PodTab`'s own `STATUS_LABEL` on purpose: a test
 * that imported the map would pass even if the map itself went blank.
 */
const STATUS_WORD = {
  idle: 'Idle',
  waiting: 'Waiting on you',
  closed: 'Closed',
  beached: 'Beached, process stopped',
} as const;

describe('the working indicator on a Pod tab', () => {
  /*
   * MOUNTED PER `contracts/activity-indicator.ts` POD_TAB_MOUNT: inside the tab
   * BUTTON, adjacent to the status dot, `size="dot"`, active for `'running'`
   * and nothing else.
   *
   * NOT for `'waiting'`, which is the opposite state — the Pod is blocked on the
   * USER. It already carries the busiest dot shape in the set plus the
   * permission badge, and animating there would tell the user to wait for a
   * machine that is waiting for them.
   *
   * The indicator is `aria-hidden` and contributes no accessible text, so it is
   * the THIRD carrier. Every case below asserts the status WORD in the same
   * render, because a mount site may only place it where the state is already
   * in text.
   */
  const RUNNING: TabOverrides = { id: 'a', title: 'Alpha', status: 'running', opened: true };

  it('mounts the indicator inside the tab button for a running Pod', () => {
    const { container } = renderTab(RUNNING);
    const indicator = screen.getByTestId(WORKING_INDICATOR_TEST_ID);

    expect(screen.getByTestId('pod-tab:a').contains(indicator)).toBe(true);
    expect(indicator.getAttribute('data-size')).toBe('dot');
    expect(indicator.getAttribute('aria-hidden')).toBe('true');
    // Motion is never the only carrier of the state.
    expect(container.textContent).toContain('Running');
  });

  it('places it adjacent to the status dot, not at the far end of the tab', () => {
    renderTab(RUNNING);
    const dot = screen.getByTestId('pod-tab:a').querySelector('[data-status]');
    expect(dot?.nextElementSibling).toBe(screen.getByTestId(WORKING_INDICATOR_TEST_ID));
  });

  it.each(['idle', 'waiting', 'closed', 'beached'] as const)(
    'renders NO indicator for a %s Pod',
    (status) => {
      const { container } = renderTab({
        id: 'a',
        title: 'Alpha',
        status,
        opened: status === 'idle' || status === 'waiting',
      });
      // Present-first: the absence below cannot be satisfied by an empty render.
      expect(screen.getByTestId('pod-tab:a')).toBeDefined();
      expect(container.textContent).toContain(STATUS_WORD[status]);
      expect(screen.queryByTestId(WORKING_INDICATOR_TEST_ID)).toBeNull();
    },
  );
});
