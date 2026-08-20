// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  PANEL_DESCRIPTIONS,
  PANEL_LABELS,
  PANEL_TEST_IDS,
  type PanelKey,
} from '../contracts/renderer-panels';
import { PanelBar } from './PanelBar';
import { PanelRegion } from './PanelRegion';
import { testId } from './contract-runtime';

// Imported for its `afterEach(cleanup)` side effect.
import '../test-utils';

const KEYS = Object.keys(PANEL_LABELS) as PanelKey[];

describe('PanelBar', () => {
  it('renders one button per PanelKey with the contract copy verbatim', () => {
    render(<PanelBar onClose={vi.fn()} onOpen={vi.fn()} open={null} />);

    expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    expect(KEYS.length).toBeGreaterThan(1);

    for (const key of KEYS) {
      const button = screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, key));
      // The label is the accessible name, exactly.
      expect(button.textContent).toBe(PANEL_LABELS[key]);
      // The description is present, verbatim, and programmatically associated.
      const describedBy = button.getAttribute('aria-describedby');
      expect(describedBy).not.toBeNull();
      expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
        PANEL_DESCRIPTIONS[key],
      );
      expect(button.getAttribute('title')).toBe(PANEL_DESCRIPTIONS[key]);
    }
  });

  it('shows no close affordance until a panel is open', () => {
    const { rerender } = render(<PanelBar onClose={vi.fn()} onOpen={vi.fn()} open={null} />);
    expect(screen.queryByTestId(PANEL_TEST_IDS.panelBarClose)).toBeNull();

    rerender(<PanelBar onClose={vi.fn()} onOpen={vi.fn()} open="helm" />);
    expect(screen.getByTestId(PANEL_TEST_IDS.panelBarClose)).toBeDefined();
  });

  it('carries the open state on aria-pressed, not on colour alone', () => {
    render(<PanelBar onClose={vi.fn()} onOpen={vi.fn()} open="beachcomber" />);

    expect(
      screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'beachcomber')).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'helm')).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('is reachable by Tab and activates with both Enter and Space', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<PanelBar onClose={vi.fn()} onOpen={onOpen} open={null} />);

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, KEYS[0] as PanelKey)),
    );

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onOpen.mock.calls.map(([key]) => key)).toEqual([KEYS[0], KEYS[0]]);

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, KEYS[1] as PanelKey)),
    );
  });

  it('closes from the close affordance and from Escape on the strip', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PanelBar onClose={onClose} onOpen={vi.fn()} open="helm" />);

    await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'helm')).focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('returns focus to the triggering button when the panel closes', () => {
    const { rerender } = render(<PanelBar onClose={vi.fn()} onOpen={vi.fn()} open={null} />);
    rerender(<PanelBar onClose={vi.fn()} onOpen={vi.fn()} open="helm" />);
    // Something else held focus while the panel was open.
    expect(document.activeElement).toBe(document.body);

    rerender(<PanelBar onClose={vi.fn()} onOpen={vi.fn()} open={null} />);
    expect(document.activeElement).toBe(
      screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'helm')),
    );
  });
});

describe('PanelRegion', () => {
  it('stamps the suffixed region id and labels itself with the panel name', () => {
    render(
      <PanelRegion onClose={vi.fn()} panelKey="helm">
        <div data-testid="panel-body">body</div>
      </PanelRegion>,
    );

    const region = screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'));
    expect(region.getAttribute('aria-label')).toBe(PANEL_LABELS.helm);
    expect(region.contains(screen.getByTestId('panel-body'))).toBe(true);
  });

  it('takes focus on open so the next Tab lands inside the panel', () => {
    render(
      <PanelRegion onClose={vi.fn()} panelKey="beachcomber">
        <div>body</div>
      </PanelRegion>,
    );
    expect(document.activeElement).toBe(
      screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'beachcomber')),
    );
  });

  it('closes on Escape from inside the panel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PanelRegion onClose={onClose} panelKey="beachcomber">
        <button type="button">inside</button>
      </PanelRegion>,
    );

    await user.click(screen.getByRole('button', { name: 'inside' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
