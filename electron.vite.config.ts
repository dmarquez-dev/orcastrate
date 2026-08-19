import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const root = __dirname;

/**
 * `externalizeDepsPlugin()` keeps everything in `dependencies` out of the main
 * and preload bundles. That is what lets `better-sqlite3` resolve its Node-API
 * prebuild from `node_modules` at runtime instead of being inlined.
 *
 * The preload bundle, by contrast, must stay self-contained apart from
 * `electron` itself: a sandboxed preload cannot `require()` relative files, so
 * `./api` and the shared contracts are bundled into the single output file.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(root, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(root, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(root, 'src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(root, 'src/renderer/index.html'),
      },
    },
  },
});
