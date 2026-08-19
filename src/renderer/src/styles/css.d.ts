/**
 * Ambient module declarations for the stylesheet imports the renderer makes.
 *
 * `tsconfig.web.json` sets `"types": []`, so `vite/client` is NOT pulled in
 * and TypeScript has no built-in knowledge of `.css` imports. Without this
 * file every `import styles from './x.module.css'` fails `typecheck:web`.
 *
 * This lives under `src/renderer/src/styles/` because T3 owns that directory
 * and the declarations are global — T4, T6 and T7 write `*.module.css` next to
 * their own components and get these types for free, with no file of theirs to
 * add and no file of T3's to edit.
 */

/** CSS Modules — the styling convention frozen in `renderer-theme.ts`. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

/** Side-effect-only global stylesheet import, e.g. from `main.tsx`. */
declare module '*.css' {
  const css: string;
  export default css;
}

/** Vite's `?raw` suffix: the file's text. */
declare module '*.css?raw' {
  const source: string;
  export default source;
}

/**
 * `import css from './x.css#?raw'` — the same raw text, requested through a URL
 * FRAGMENT rather than a query.
 *
 * WHY THE ODD SPELLING, because it will otherwise be "tidied" back and break:
 * `tokens.test.ts` has to read the stylesheet as text, and no file under
 * `src/renderer/**` may import a `node:` builtin (spec 3 security posture; and
 * `tsconfig.web.json` sets `"types": []` precisely so that it cannot). That
 * leaves a Vite text import — but Vitest's `vitest:css-disable` plugin blanks
 * the module of anything matching `/\.css(?:$|\?)/` while `test.css` is false,
 * which is the default this repo relies on to keep suites fast. A `#` fragment
 * does not match that pattern, and Vite still strips it and honours `raw`, so
 * the text arrives intact with no config change.
 *
 * If Vitest ever closes that gap the import yields an empty string and
 * `tokens.test.ts` fails loudly with every token reported missing — it cannot
 * pass vacuously. The clean long-term fix is `test.css.include` in
 * `vitest.config.ts`, which T3 does not own.
 */
declare module '*.css#?raw' {
  const source: string;
  export default source;
}
