// @vitest-environment jsdom
/**
 * The three reasons Save is off, asserted one at a time.
 *
 * `saveDisabledReasons` is a function rather than a boolean expression inside
 * the JSX precisely so this can be a table: each reason is shown to disable
 * Save ON ITS OWN, which is what stops a later edit from collapsing three
 * conditions into one and losing a case nobody notices.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `globals: false` means RTL installs no auto-cleanup of its own.
afterEach(() => {
  cleanup();
});

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { HelmActionBar, saveDisabledReasons } from './HelmActionBar';

describe('saveDisabledReasons', () => {
  it('is empty only for a dirty, unblocked, idle draft', () => {
    expect(saveDisabledReasons({ blocked: false, saving: false, dirty: true })).toEqual([]);
  });

  it('names each reason independently', () => {
    expect(saveDisabledReasons({ blocked: true, saving: false, dirty: true })).toEqual(['blocked']);
    expect(saveDisabledReasons({ blocked: false, saving: true, dirty: true })).toEqual(['saving']);
    expect(saveDisabledReasons({ blocked: false, saving: false, dirty: false })).toEqual(['clean']);
  });
});

describe('HelmActionBar', () => {
  it('offers Reload even before anything is dirty, and disables it with no scope', () => {
    render(
      <HelmActionBar
        blocked={false}
        canReload={false}
        dirty={false}
        onDiscard={vi.fn()}
        onReload={vi.fn()}
        onSave={vi.fn()}
        saving={false}
      />,
    );

    const reload = screen.getByTestId(PANEL_TEST_IDS.helmReload) as HTMLButtonElement;
    expect(reload.disabled).toBe(true);
  });

  it('says it is saving rather than leaving a dead button', () => {
    render(
      <HelmActionBar
        blocked={false}
        canReload
        dirty
        onDiscard={vi.fn()}
        onReload={vi.fn()}
        onSave={vi.fn()}
        saving
      />,
    );

    expect(screen.getByTestId(PANEL_TEST_IDS.helmSave).textContent).toBe('Saving…');
  });
});
