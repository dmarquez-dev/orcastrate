/**
 * `renderWithWorkspace` — mount a component inside the real `WorkspaceProvider`
 * with a stub `window.orcastrate` behind it.
 *
 * Every renderer suite in this session should reach for this instead of
 * `render` from `@testing-library/react`, so that all four consumer tasks
 * exercise the same provider with the same stub semantics.
 *
 * A test file using this MUST carry the docblock
 *
 *     // @vitest-environment jsdom
 *
 * The repo's `vitest.config.ts` defaults to `node` on purpose — everything on
 * the main-process side is Node-side, and a global jsdom would slow every
 * suite. Opting in per file is the documented convention there; do not change
 * that config.
 */

import type { ReactNode } from 'react';
import { cleanup, render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { afterEach } from 'vitest';

import type { OrcastrateApi } from '@shared/contracts/ipc';

import { stubOrcastrateApi, type StubOrcastrateApi } from './stub-api';
import {
  resolveWorkspaceProvider,
  type WorkspaceProviderComponent,
} from './workspace-provider-seam';

/**
 * Unmount anything still mounted between tests. `vitest.config.ts` sets
 * `globals: false`, so React Testing Library's own auto-cleanup (which looks
 * for a global `afterEach`) never installs itself. Registering it here means a
 * suite gets cleanup simply by importing this module — the same guarantee RTL
 * gives under globals, with no per-suite boilerplate and no config change.
 */
afterEach(() => {
  cleanup();
});

export interface RenderWithWorkspaceOptions<A extends OrcastrateApi>
  extends Omit<RenderOptions, 'wrapper'> {
  /**
   * The stub handed to `WorkspaceProviderProps.api`. Omit it and a fresh
   * `stubOrcastrateApi()` is created and returned on the result, which is the
   * common case; supply one when the test needs to drive pushes or force
   * failures before the first render.
   */
  api?: A;
  /**
   * The provider component. Defaults to whatever was passed to
   * `registerWorkspaceProvider`; throws when nothing is registered. See
   * `workspace-provider-seam.ts` for why there is no silent stand-in.
   */
  provider?: WorkspaceProviderComponent;
}

export interface RenderWithWorkspaceResult<A extends OrcastrateApi> extends RenderResult {
  /** The api the provider was mounted with — the one to drive from the test. */
  api: A;
}

export function renderWithWorkspace<A extends OrcastrateApi = StubOrcastrateApi>(
  ui: ReactNode,
  options: RenderWithWorkspaceOptions<A> = {},
): RenderWithWorkspaceResult<A> {
  const { api: suppliedApi, provider, ...renderOptions } = options;

  // The cast is confined to this line: when the caller omits `api`, `A` is its
  // default `StubOrcastrateApi`, which is exactly what the factory returns.
  const api: A = suppliedApi ?? (stubOrcastrateApi() as unknown as A);
  const Provider = provider ?? resolveWorkspaceProvider();

  const result = render(ui, {
    ...renderOptions,
    // Rendered as an element, not called as a function, so the provider owns
    // its own hooks and its own StrictMode double-invoke.
    wrapper: ({ children }: { children: ReactNode }) => <Provider api={api}>{children}</Provider>,
  });

  return { ...result, api };
}
