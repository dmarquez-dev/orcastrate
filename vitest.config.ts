import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = __dirname;

/**
 * One test project for the whole repo. Later tasks add specs under `tests/`;
 * co-located `*.test.ts` next to the code it covers is also picked up.
 *
 * The default environment is `node` because everything in sub-session 1 —
 * the preload bridge, the store, the router, the fixture replay — is
 * Node-side. Renderer component tests should opt into jsdom with a
 * `// @vitest-environment jsdom` docblock rather than slowing every suite.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: [resolve(root, 'tests/setup.ts')],
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
    },
  },
});
