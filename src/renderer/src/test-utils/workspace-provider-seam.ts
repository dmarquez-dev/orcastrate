/**
 * The runtime seam that lets T3 ship `renderWithWorkspace` BEFORE T5 exists.
 *
 * THE PROBLEM: `renderWithWorkspace` must mount its subject inside the real
 * `WorkspaceProvider`. That component is implemented by T5 under
 * `src/renderer/src/state/**`, which T3 does not own and which does not exist
 * when T3 runs. A static `import { WorkspaceProvider } from '../state/…'`
 * would not resolve, and `typecheck:web` would fail.
 *
 * THE RESOLUTION: the frozen contract `renderer-state.ts` already declares the
 * provider's exact shape, so T3 takes a TYPE-ONLY dependency on the contract
 * and a RUNTIME dependency on nothing. The concrete component is injected
 * here, once, by whoever owns it.
 *
 * This is a seam, not a fallback. There is deliberately NO default provider:
 * a stand-in that merely rendered `children` would let a consumer's test pass
 * while the real state layer was never exercised, which is exactly the failure
 * this seam exists to prevent. With nothing registered,
 * `resolveWorkspaceProvider` throws and names the fix.
 *
 * HOW A CONSUMER TASK (T4, T5, T6, T7, T8) USES IT — either form works:
 *
 *   // once per suite
 *   import { WorkspaceProvider } from '../state/workspace-provider';
 *   import { registerWorkspaceProvider } from '../test-utils';
 *   beforeAll(() => registerWorkspaceProvider(WorkspaceProvider));
 *
 *   // or per call, when a suite wants an explicit one
 *   renderWithWorkspace(<PodBar />, { api, provider: WorkspaceProvider });
 */

import type { ReactNode } from 'react';

import type { WorkspaceProviderProps } from '../contracts/renderer-state';

/**
 * Structurally exactly the frozen contract's `WorkspaceProvider`: a component
 * taking `WorkspaceProviderProps`. Nothing narrower, so T5's implementation
 * fits without a cast.
 */
export type WorkspaceProviderComponent = (props: WorkspaceProviderProps) => ReactNode;

let registered: WorkspaceProviderComponent | null = null;

/** Inject the real provider. Last registration wins. */
export function registerWorkspaceProvider(provider: WorkspaceProviderComponent): void {
  registered = provider;
}

/** Drop the registration. Use in `afterAll` when a suite registered a double. */
export function resetWorkspaceProvider(): void {
  registered = null;
}

/** The registered provider, or null. Prefer `resolveWorkspaceProvider`. */
export function getWorkspaceProvider(): WorkspaceProviderComponent | null {
  return registered;
}

/** The registered provider, or a throw that names the fix. */
export function resolveWorkspaceProvider(): WorkspaceProviderComponent {
  if (registered !== null) return registered;
  throw new Error(
    'renderWithWorkspace: no WorkspaceProvider is registered. Call ' +
      'registerWorkspaceProvider(WorkspaceProvider) from your suite, or pass ' +
      '{ provider } to renderWithWorkspace. See ' +
      'src/renderer/src/test-utils/workspace-provider-seam.ts.',
  );
}
