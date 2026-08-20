/**
 * The Helm panel's public surface.
 *
 * T9 wants `ConnectedHelmPanel` and nothing else. `HelmPanel` is exported
 * beside it because it is the presentation component the panel props describe,
 * and a caller holding its own `HelmView` should not have to reach past this
 * barrel to render one.
 */

export { ConnectedHelmPanel } from './ConnectedHelmPanel';
export { HelmPanel } from './HelmPanel';
