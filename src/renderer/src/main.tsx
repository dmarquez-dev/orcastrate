/**
 * Renderer bootstrap.
 *
 * `styles/global.css` is imported HERE and nowhere else — it `@import`s
 * `tokens.css`, so this single line is what puts every `--oc-*` custom
 * property on `:root`. Without it every component's `var(--oc-…)` resolves to
 * nothing (frozen `renderer-theme.ts`, rule 1).
 */
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { WorkspaceProvider } from './state';
import { App } from './App';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Renderer bootstrap failed: #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    {/* No `api` prop: in the app the provider reads the preload bridge. */}
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </StrictMode>,
);
