import type { JSX } from 'react';

import { useBeachcomber, useBeachcomberActions } from '../state';
import { BeachcomberPanel } from './BeachcomberPanel';

/**
 * `BeachcomberPanel` wired to the two hooks, for the shell to render.
 *
 * IT IS A SEPARATE FILE ON PURPOSE. `BeachcomberPanel` is a presentation
 * component: it takes data and callbacks and knows where neither came from,
 * which is what lets every test in this directory drive it without a provider.
 * This wrapper is the one place that knows, and it is four lines long.
 *
 * Mounting it is also the event that issues the scan — `useBeachcomber`'s mount
 * effect does that. Nothing here fetches in response to a render.
 */
export function BeachcomberPanelConnected(): JSX.Element {
  const view = useBeachcomber();
  const actions = useBeachcomberActions();
  return <BeachcomberPanel actions={actions} view={view} />;
}
