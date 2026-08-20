// @vitest-environment jsdom
/**
 * The tab's half of the closed-Pod story: the `Closed` LABEL, the status dot's
 * new token, and the run control as the named way out.
 *
 * `PodTab` is presentational. It takes a `PodTabVm` and callbacks, reaches
 * around its props into nothing, and re-derives openness from nothing —
 * `opened` arrives already computed by the state layer's single derivation, and
 * this component only decides whether to OFFER the control and what to call it.
 * Every test below therefore drives it with data alone.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { statusToken } from '../shell/contract-runtime';
import { PodTab, POD_TAB_OPEN_TEST_ID, type PodTabProps } from './PodTab';
import { tabVm, type TabOverrides } from './test-fixtures';

// Imported for its `afterEach(cleanup)` side effect.
import '../test-utils';

function renderTab(overrides: TabOverrides, props: Partial<PodTabProps> = {}) {
  const onOpen = vi.fn();
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const full: PodTabProps = {
    tab: tabVm(overrides),
    index: 0,
    total: 1,
    dragging: false,
    dropTarget: false,
    onSelect,
    onClose,
    onOpen,
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
  return { ...result, onOpen, onSelect, onClose, props: full };
}

const CLOSED: TabOverrides = { id: 'a', title: 'Alpha', status: 'closed', opened: false };
const BEACHED: TabOverrides = { id: 'a', title: 'Alpha', status: 'beached', opened: false };
const OPEN: TabOverrides = { id: 'a', title: 'Alpha', status: 'idle', opened: true };

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

describe('the run control is the named way out', () => {
  it('is labelled Open for a closed Pod, in text and in its accessible name', () => {
    renderTab(CLOSED);
    const control = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);
    expect(control.tagName).toBe('BUTTON');
    expect(control.textContent).toBe('Open');
    expect(control.getAttribute('aria-label')).toBe('Open Alpha');
  });

  it('is labelled Reconnect for a beached Pod, in text and in its accessible name', () => {
    renderTab(BEACHED);
    const control = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);
    expect(control.textContent).toBe('Reconnect');
    expect(control.getAttribute('aria-label')).toBe('Reconnect Alpha');
  });

  it('is not offered at all for an open Pod', () => {
    renderTab(OPEN);
    expect(screen.queryByTestId(`${POD_TAB_OPEN_TEST_ID}:a`)).toBeNull();
  });

  it('is operable by keyboard alone', async () => {
    const user = userEvent.setup();
    const { onOpen, onSelect } = renderTab(CLOSED);
    const control = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);

    control.focus();
    expect(document.activeElement).toBe(control);
    await user.keyboard('{Enter}');

    expect(onOpen).toHaveBeenCalledTimes(1);
    // Starting the Pod is not selecting it; the tab's own handler is untouched.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('moves focus to the tab when the control unmounts after the Pod opens', () => {
    // The accessibility floor: focus moves predictably after an action that
    // changes what is on screen. Without this the user is stranded on
    // `document.body` the instant the control disappears.
    const { rerender, props } = renderTab(CLOSED);
    const control = screen.getByTestId(`${POD_TAB_OPEN_TEST_ID}:a`);
    control.focus();

    rerender(
      <ul>
        <PodTab {...props} tab={tabVm(OPEN)} />
      </ul>,
    );

    expect(screen.queryByTestId(`${POD_TAB_OPEN_TEST_ID}:a`)).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('pod-tab:a'));
  });

  it('leaves focus alone when it had already moved somewhere else', () => {
    const { rerender, props } = renderTab(CLOSED);
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
