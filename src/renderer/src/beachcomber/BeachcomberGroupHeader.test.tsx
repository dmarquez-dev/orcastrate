// @vitest-environment jsdom
/**
 * The group header's select-all label: its wording lives in `copy.ts`, and the
 * label the header renders is exactly that wording, byte for byte.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { BeachcomberGroupHeader } from './BeachcomberGroupHeader';
import { selectAllLabel } from './copy';
import { makeGroup } from './test-fixtures';

// `vitest.config.ts` sets `globals: false`, so RTL installs no auto-cleanup.
afterEach(cleanup);

const HEADING = 'Claude Code projects';

describe('the select-all label', () => {
  it('is worded in copy.ts as "Select all in" followed by the heading', () => {
    expect(selectAllLabel(HEADING)).toBe('Select all in ' + HEADING);
  });

  it('is rendered on the label associated with the group toggle, unchanged', () => {
    render(
      <BeachcomberGroupHeader
        group={makeGroup({ heading: HEADING })}
        headingId="group-heading"
        onToggleGroup={() => undefined}
        toggleId="group-toggle"
      />,
    );

    const toggle = screen.getByTestId(PANEL_TEST_IDS.beachcomberGroupToggle) as HTMLInputElement;
    const labels = Array.from(toggle.labels ?? []);
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe('Select all in ' + HEADING);
  });
});
