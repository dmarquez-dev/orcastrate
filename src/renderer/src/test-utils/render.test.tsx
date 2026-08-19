// @vitest-environment jsdom

/**
 * Proves the per-file jsdom opt-in works and that `renderWithWorkspace` mounts
 * a subject inside a provider with the stub api behind it.
 *
 * `vitest.config.ts` defaults to the `node` environment; the docblock on line 1
 * of this file is the whole opt-in. That config is NOT edited by this task.
 *
 * The provider used here is a DOUBLE that honours the frozen
 * `WorkspaceProviderProps` shape. T5 ships the real one and registers it; this
 * file exercises the seam, not the state layer.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { WorkspaceProviderProps } from '../contracts/renderer-state';
import { TEST_IDS } from '../contracts/renderer-view';
import {
  ipcError,
  registerWorkspaceProvider,
  renderWithWorkspace,
  resetWorkspaceProvider,
  stubOrcastrateApi,
} from './index';

/**
 * A minimal provider standing in for T5's. It does what the contract's
 * SUBSCRIPTION GUARANTEE requires — subscribe to all five push channels once
 * on mount, unsubscribe every one on unmount — and surfaces just enough state
 * to assert against.
 */
function TestProvider({ children, api }: WorkspaceProviderProps): ReactNode {
  const [status, setStatus] = useState<string>('none');
  const [routingMode, setRoutingMode] = useState<string>('unresolved');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (api === undefined) return;
    const offs = [
      api.on.podEvent(() => {}),
      api.on.podStatus((p) => setStatus(p.status)),
      api.on.laneChanged(() => {}),
      api.on.permissionRequested(() => {}),
      api.on.permissionResolved(() => {}),
    ];
    void api.app.routingMode().then((result) => {
      if (result.ok) setRoutingMode(result.value);
      else setError(result.error.message);
    });
    return () => {
      for (const off of offs) off();
    };
  }, [api]);

  return (
    <div data-testid={TEST_IDS.workspace} data-status={status} data-routing={routingMode}>
      {error === null ? null : <p role="alert">{error}</p>}
      {children}
    </div>
  );
}

function Subject(): ReactNode {
  const [clicked, setClicked] = useState(false);
  return (
    <button type="button" onClick={() => setClicked(true)}>
      {clicked ? 'clicked' : 'click me'}
    </button>
  );
}

afterEach(() => {
  resetWorkspaceProvider();
});

describe('renderWithWorkspace', () => {
  it('renders a React element in jsdom inside the provider', async () => {
    const { api } = renderWithWorkspace(<Subject />, { provider: TestProvider });

    const workspace = await screen.findByTestId(TEST_IDS.workspace);
    expect(workspace).toBeDefined();
    expect(workspace.getAttribute('data-routing')).toBe('lanes');
    expect(api.calls.appRoutingMode).toHaveLength(1);
  });

  it('drives the component through user-event', async () => {
    renderWithWorkspace(<Subject />, { provider: TestProvider });
    const button = screen.getByRole('button', { name: 'click me' });
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'clicked' })).toBeDefined();
  });

  it('uses the registered provider when none is passed', async () => {
    registerWorkspaceProvider(TestProvider);
    renderWithWorkspace(<Subject />);
    expect(await screen.findByTestId(TEST_IDS.workspace)).toBeDefined();
  });

  it('throws a named error when no provider is registered or passed', () => {
    expect(() => renderWithWorkspace(<Subject />)).toThrow(/no WorkspaceProvider is registered/);
  });

  it('delivers a driven push into the mounted tree', async () => {
    const api = stubOrcastrateApi();
    renderWithWorkspace(<Subject />, { api, provider: TestProvider });

    const workspace = await screen.findByTestId(TEST_IDS.workspace);
    expect(workspace.getAttribute('data-status')).toBe('none');
    expect(api.listenerCount('podStatus')).toBe(1);

    await act(async () => {
      api.emit.podStatus({ podId: 'pod-1', status: 'beached', exitCode: 1 });
    });
    expect(screen.getByTestId(TEST_IDS.workspace).getAttribute('data-status')).toBe('beached');
  });

  it('surfaces a forced invoke failure to the mounted tree', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('appRoutingMode', ipcError('INTERNAL', 'routing probe unavailable'));
    renderWithWorkspace(<Subject />, { api, provider: TestProvider });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('routing probe unavailable');
  });

  it('unsubscribes every push channel on unmount', async () => {
    const api = stubOrcastrateApi();
    const { unmount } = renderWithWorkspace(<Subject />, { api, provider: TestProvider });
    await screen.findByTestId(TEST_IDS.workspace);
    expect(api.listenerCount('podEvent')).toBe(1);

    unmount();
    for (const channel of [
      'podEvent',
      'podStatus',
      'laneChanged',
      'permissionRequested',
      'permissionResolved',
    ] as const) {
      expect(api.listenerCount(channel), `${channel} leaked`).toBe(0);
    }
  });
});
