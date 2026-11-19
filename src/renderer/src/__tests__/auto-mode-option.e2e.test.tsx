// @vitest-environment jsdom
/**
 * The auto-mode flag, end to end through the workspace store: a push from the
 * stub bridge reaches the New Pod dialog the user opens, with nothing below
 * `App` rendered directly.
 *
 * `false` hides the `auto` option and leaves the others; a later `true`
 * brings it back. Main pushes only on change, so the second case sends both
 * values in order, as a session whose model changed would receive them.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { stubOrcastrateApi } from '../test-utils';

import { installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

describe('the New Pod dialog follows the cached auto-mode flag', () => {
  it('omits the auto option after a { supported: false } push, and still offers dontAsk', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi();
    mountWorkspace(api);

    const newPod = await screen.findByTestId(TEST_IDS.newPodButton);
    await act(async () => {
      api.emit.autoModeSupport({ supported: false });
    });
    await user.click(newPod);
    const dialog = await screen.findByTestId(TEST_IDS.newPodDialog);

    expect(within(dialog).queryByTestId('new-pod-mode:auto')).toBeNull();
    expect(within(dialog).getByTestId(testId(TEST_IDS.newPodModeOption, 'dontAsk'))).toBeDefined();
  });

  it('offers the auto option again after { supported: false } then { supported: true }', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi();
    mountWorkspace(api);

    const newPod = await screen.findByTestId(TEST_IDS.newPodButton);
    await act(async () => {
      api.emit.autoModeSupport({ supported: false });
    });
    await act(async () => {
      api.emit.autoModeSupport({ supported: true });
    });
    await user.click(newPod);
    const dialog = await screen.findByTestId(TEST_IDS.newPodDialog);

    expect(within(dialog).getByTestId('new-pod-mode:auto')).toBeDefined();
  });
});
