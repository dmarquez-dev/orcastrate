// @vitest-environment jsdom
/**
 * The one end-to-end-ish test in this directory: the panel mounted inside the
 * REAL provider over a stub bridge, proving the seam the other suites take on
 * trust.
 *
 * It is deliberately thin. Everything about what the form does is asserted in
 * `HelmPanel.test.tsx` against props, which is faster and does not depend on
 * the state layer's internals. What only this test can show is that mounting
 * the panel is what fetches the scope list, and that a real save round-trips
 * to a backup path on screen.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { WorkspaceProvider } from '../state/workspace-provider';
import {
  ipcError,
  registerWorkspaceProvider,
  renderWithWorkspace,
  stubOrcastrateApi,
} from '../test-utils';

import { ConnectedHelmPanel } from './ConnectedHelmPanel';

beforeAll(() => {
  registerWorkspaceProvider(WorkspaceProvider);
});

describe('ConnectedHelmPanel', () => {
  it('fetches the scope list from its own mount, not from a render', async () => {
    const { api } = renderWithWorkspace(<ConnectedHelmPanel />);

    await waitFor(() => {
      expect(screen.getByTestId(`${PANEL_TEST_IDS.helmScopeOption}:user`)).not.toBeNull();
    });
    expect(api.calls.helmScopes.length).toBe(1);
  });

  it('loads a chosen scope, saves an edit, and shows where the backup went', async () => {
    const user = userEvent.setup();
    const { api } = renderWithWorkspace(<ConnectedHelmPanel />);

    await waitFor(() => {
      expect(screen.getByTestId(`${PANEL_TEST_IDS.helmScopeOption}:user`)).not.toBeNull();
    });
    await user.selectOptions(screen.getByTestId(PANEL_TEST_IDS.helmScopeSelect), 'user');

    const model = await screen.findByTestId(PANEL_TEST_IDS.helmModel);
    await user.clear(model);
    await user.type(model, 'claude-opus-4-9');

    const save = screen.getByTestId(PANEL_TEST_IDS.helmSave) as HTMLButtonElement;
    await waitFor(() => {
      expect(save.disabled).toBe(false);
    });
    await user.click(save);

    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.helmBackupPath)).not.toBeNull();
    });
    expect(api.calls.helmSave.length).toBe(1);
  });

  it('renders the message main wrote when the scope list itself fails', async () => {
    // Installed BEFORE the first render, so the mount effect's own call fails
    // and the panel's error path is the one under test.
    const api = stubOrcastrateApi();
    api.failInvoke('helmScopes', ipcError('INTERNAL', 'EACCES: permission denied'));
    renderWithWorkspace(<ConnectedHelmPanel />, { api });

    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.helmError).textContent).toContain(
        'EACCES: permission denied',
      );
    });
  });
});
