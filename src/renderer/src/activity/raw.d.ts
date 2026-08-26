/**
 * Vite's `?raw` suffix for a TSX source file.
 *
 * `styles/css.d.ts` declares the `*.css?raw` and `*.css#?raw` forms the
 * stylesheet tests use, but it belongs to another task and this directory
 * needs one more: `WorkingIndicator.source.test.ts` reads the COMPONENT's own
 * text, to check mechanically that nothing in it schedules a frame.
 *
 * A Vite text import rather than `node:fs` on purpose — no file under
 * `src/renderer/**` may import a `node:` builtin, and `tsconfig.web.json` sets
 * `"types": []` precisely so that it cannot. The plain `?raw` query is enough
 * here: Vitest's `vitest:css-disable` plugin only blanks modules matching
 * `/\.css(?:$|\?)/`, which a `.tsx` never does, so the `#?raw` workaround the
 * stylesheets need does not apply.
 */
declare module '*.tsx?raw' {
  const source: string;
  export default source;
}
