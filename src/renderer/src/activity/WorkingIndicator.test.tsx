// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkingIndicator, WORKING_INDICATOR_TEST_ID } from './WorkingIndicator';

// `vitest.config.ts` sets `globals: false`, so RTL never installs its own
// auto-cleanup. Register it explicitly.
afterEach(cleanup);

/**
 * A host whose accessible name comes from its CONTENTS, never from an
 * `aria-label` — a label would mask any text the indicator added and make the
 * accessible-name assertion below vacuous.
 */
function renderHost(active: boolean, size: 'dot' | 'bar' = 'bar') {
  return render(
    <button type="button" data-testid="host">
      Running
      <WorkingIndicator active={active} size={size} />
    </button>,
  );
}

describe('WorkingIndicator — presence means work is in flight', () => {
  it('renders nothing at all when inactive: an idle row mounts no animation', () => {
    const { container } = render(<WorkingIndicator active={false} size="bar" />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId(WORKING_INDICATOR_TEST_ID)).toBeNull();
  });

  it.each(['dot', 'bar'] as const)('renders a mark when active, size=%s', (size) => {
    render(<WorkingIndicator active size={size} />);
    const el = screen.getByTestId(WORKING_INDICATOR_TEST_ID);
    expect(el.getAttribute('data-size')).toBe(size);
    expect(el.className).not.toBe('');
  });

  it('carries the test id LITERALLY, with no suffix, so a mount site reaches it with within(row)', () => {
    expect(WORKING_INDICATOR_TEST_ID).toBe('working-indicator');
    renderHost(true);
    const host = screen.getByTestId('host');
    expect(within(host).getByTestId('working-indicator')).toBeTruthy();
  });
});

describe('the animation carries nothing by itself (contract section 3)', () => {
  it('is aria-hidden', () => {
    render(<WorkingIndicator active size="dot" />);
    expect(screen.getByTestId(WORKING_INDICATOR_TEST_ID).getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves the host accessible name byte-identical whether active or not', () => {
    const inactive = renderHost(false);
    const before = screen.getByTestId('host').textContent;
    // The name is exactly the status word, and mounting the indicator does not
    // add a character to it.
    expect(screen.getByRole('button', { name: 'Running' })).toBeTruthy();
    inactive.unmount();

    renderHost(true);
    const after = screen.getByTestId('host').textContent;
    expect(screen.getByRole('button', { name: 'Running' })).toBeTruthy();
    expect(after).toBe(before);
  });

  it('adds no live region: a turn starting must not narrate the session', () => {
    const { container } = render(<WorkingIndicator active size="bar" />);
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('public surface', () => {
  it('re-exports the component and its test id from the barrel', async () => {
    const barrel = await import('./index');
    expect(barrel.WorkingIndicator).toBe(WorkingIndicator);
    expect(barrel.WORKING_INDICATOR_TEST_ID).toBe(WORKING_INDICATOR_TEST_ID);
  });
});
