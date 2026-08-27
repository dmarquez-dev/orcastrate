/**
 * Ambient declaration for Vite's `?raw` suffix on a TSX source file.
 *
 * RE-HOMED from `activity/WorkingIndicator`'s own `raw.d.ts`, which was deleted
 * with that directory (`contracts/activity-module-retirement.ts` section 5).
 * Two files import their own component's text today —
 * `lanes/LaneRow.source.test.ts` reads `./LaneRow.tsx?raw` and
 * `pods/PodTab.source.test.ts` reads `./PodTab.tsx?raw` — to check
 * MECHANICALLY that neither surface schedules a frame. Neither compiles
 * without this block.
 *
 * It lives here, beside the other ambient text/stylesheet declarations, rather
 * than inside `css.d.ts`. That file is about CSS, is referenced BY NAME in
 * three docblocks, and a `.tsx` declaration filed inside it is exactly the kind
 * of thing a later reader deletes as misfiled.
 *
 * WHY A VITE TEXT IMPORT AND NOT `node:fs`, stated so it is not "simplified"
 * into a `readFileSync`: no file under `src/renderer/**` may import a `node:`
 * builtin, and `tsconfig.web.json` sets `"types": []` precisely so that it
 * cannot — with no `@types/node` in the program there is no `node:fs` to
 * import, and the renderer's security posture is what that setting protects.
 *
 * The plain `?raw` query is enough here, unlike the `#?raw` fragment the
 * stylesheets need: Vitest's `vitest:css-disable` plugin blanks only modules
 * matching `/\.css(?:$|\?)/`, which a `.tsx` never does. See the note on
 * `*.css#?raw` in `./css.d.ts` for that separate workaround.
 */
declare module '*.tsx?raw' {
  const source: string;
  export default source;
}
