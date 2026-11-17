/**
 * Forced load failure run: the two Retry-control human checks session
 * 20261112-0151-workspace-load-retry left open, measured in the real Electron
 * window after forcing the E8/E9 load failure through the app's own IPC.
 *
 *   retry-button  the Retry control reads as a button next to the message, and
 *                 Tab reaches it with a focus ring the item does not clip
 *                                                            (O2-O11)
 *   retry-themes  the Retry control is legible under the dark and the light
 *                 preference                                 (O12-O14)
 *
 * THE ROUTE. `window.orcastrate.pods.delete({ podId, deleteSession: false })`
 * deletes a Pod in main without passing through the renderer store, so the
 * store's `deletedPods` tombstone is never written and no push tells the
 * window: the tab stays. Activating that never-activated tab issues
 * `lanes.list` and `events.read`, both of which main refuses with
 * `no Pod with id <id>` (`src/main/pod-manager/pod-manager.ts`, `#requirePod`),
 * and `WorkspaceAlerts.tsx` raises E8 and E9, each with Retry. The first tab
 * auto-activates after the reload, so the target is the third of three Pods,
 * and `HC load live` is activated first so its successful reads stand beside
 * the target's failing ones.
 *
 * `--skip-delete` runs the same states but never deletes the target, so its
 * reads succeed and O3 must measure 0 error items: the whole-run control.
 *
 * RULES THIS FILE KEEPS (precedent `run-fork-ui.mjs`)
 *   - No verdict compares a length with a literal. Lengths are compared with
 *     another length measured in the same window, or with one device pixel
 *     (`1 / devicePixelRatio`, read in the window).
 *   - Every reference a verdict reads starts `null` and is assigned from a
 *     measurement. A reference still `null` at its comparison makes the
 *     observation `instrument-invalid`, never `pass`.
 *   - Every observation O2-O14 has an in-window control, and its prediction and
 *     the control's prediction are written in PLAN below, before anything runs.
 *     An observation whose control did not fire as predicted is
 *     `instrument-invalid` whatever it measured. Controls are inline styles, an
 *     added <style>, a detached node, or emulated media. No file is edited to
 *     run one, and each is undone and the undo verified before the next
 *     observation.
 *   - No fixed sleep: every wait is a condition with a timeout.
 *   - Outputs: `driven-report-<slug>.json` / `.md`, `screenshots/<slug>/` and
 *     the sandbox root only. `lib.mjs`'s screenshot and report helpers write to
 *     the 2026-10-07 run's paths, so neither is called here.
 *
 * Run `npm run build` first; this launches `<repoRoot>/out/main/index.js`.
 *
 *   node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run-forced-load-failure.mjs
 *        --sandbox-root <abs path> [--skip-delete] [--keep-sandbox]
 *
 * Exit 0 iff every observation is `pass` and every control fired; 1 when
 * every observation is valid and at least one is `fail`; 2 otherwise (an
 * `instrument-invalid` observation, a failed precondition, a bad invocation).
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, repoRoot } from './lib.mjs';
import { buildSandbox } from './sandbox.mjs';

// ---------------------------------------------------------------- invocation

function parseArgs(argv) {
  const out = { sandboxRoot: null, skipDelete: false, keepSandbox: false, error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sandbox-root') {
      out.sandboxRoot = i + 1 < argv.length ? argv[++i] : null;
      if (out.sandboxRoot === null) out.error = out.error ?? '--sandbox-root needs a value';
    } else if (a === '--skip-delete') out.skipDelete = true;
    else if (a === '--keep-sandbox') out.keepSandbox = true;
    else out.error = out.error ?? `unknown argument ${a}`;
  }
  if (out.error === null && out.sandboxRoot === null) out.error = '--sandbox-root <absolute dir> is required';
  if (out.error === null && (!win32.isAbsolute(out.sandboxRoot) || !isAbsolute(out.sandboxRoot))) {
    out.error = `--sandbox-root must be an absolute path; got ${out.sandboxRoot}`;
  }
  if (out.error === null) {
    // `buildSandbox` removes the root it is given, so a root that is a drive
    // root, or that contains the repository or the real home, is refused.
    const root = resolve(out.sandboxRoot);
    const contains = (outer, inner) => {
      const rel = relative(outer.toLowerCase(), inner.toLowerCase());
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    };
    if (resolve(root, '..') === root) {
      out.error = `--sandbox-root must not be a filesystem root; got ${out.sandboxRoot}`;
    } else if (contains(root, resolve(repoRoot)) || contains(root, resolve(homedir()))) {
      out.error = `--sandbox-root must not contain the repository or the home directory; got ${out.sandboxRoot}`;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.error !== null) {
  // Nothing has been written: no report, no screenshot, no sandbox.
  console.error(`run-forced-load-failure: ${args.error}`);
  process.exit(2);
}

const SLUG = args.skipDelete ? 'forced-load-failure-skip-delete' : 'forced-load-failure';
const driverPath = fileURLToPath(import.meta.url);
const H = join(dirname(driverPath), '..');
const shotsDir = join(H, 'screenshots', SLUG);
const mainBundle = join(repoRoot, 'out', 'main', 'index.js');
const realSettings = join(homedir(), '.claude', 'settings.json');
const requireHere = createRequire(import.meta.url);

const TITLES = { companion: 'HC load companion', live: 'HC load live', target: 'HC load target' };

// ---------------------------------------------------------------- the plan
// Every prediction is written here, before the run. `observed`, `fired` and
// `undoVerified` are filled in by the run and nothing else.

const PLAN = [
  { id: 'O2', row: 'retry-button',
    predicted: 'pods.delete resolves ok: true with podDeleted: true and session "not-requested"; afterwards the pod-tab:<target id> tab is still rendered',
    injection: 'the same tab-presence probe for a never-created id (a fresh UUID)',
    controlPredicted: 'absent' },
  { id: 'O3', row: 'retry-button',
    predicted: 'after clicking HC load live, then the target\'s stale tab, waited for as a condition with a timeout: exactly 2 [data-testid="notification"][data-kind="error"] items whose message <p> text equals "no Pod with id <target id>"',
    injection: 'O4: the must-not-fire count, at the same moment, of notification items whose text contains HC load live\'s id (whole-run control: the --skip-delete run)',
    controlPredicted: '0' },
  { id: 'O4', row: 'retry-button',
    predicted: 'at the moment O3\'s two items are present: 0 notification items contain HC load live\'s id, and exactly 2 data-kind="error" items exist',
    injection: 'the same id-containment count keyed on the target\'s id, at the same moment',
    controlPredicted: '2' },
  { id: 'O5', row: 'retry-button',
    predicted: 'each of O3\'s 2 items holds exactly 1 button[type="button"] with text Retry, after the message <p> and before the notification-dismiss button in DOM order',
    injection: 'the first item\'s Retry button detached from the DOM, the same probe run on that item, then reattached at its place and verified',
    controlPredicted: '0 buttons' },
  { id: 'O6', row: 'retry-button',
    predicted: 'first item\'s Retry: border-top-style solid with width > 0, cursor pointer, computed background-color differs from the item\'s (and so does the effective, composited background)',
    injection: 'inline border-style: none; background: transparent on that button',
    controlPredicted: 'probe reports no border (style none or width 0) and an effective background equal to the item\'s' },
  { id: 'O7', row: 'retry-button',
    predicted: 'Retry\'s border box left >= the message <p>\'s right edge minus one device pixel, and their vertical extents overlap',
    injection: 'inline flex-direction: column on the item',
    controlPredicted: 'no horizontal adjacency' },
  { id: 'O8', row: 'retry-button',
    predicted: 'from the stated starting point (a mouse click on the first item\'s message <p>), keyboard Tab presses only: document.activeElement becomes the first item\'s Retry and it matches :focus-visible',
    injection: 'the same focus probe, run before any Tab press',
    controlPredicted: 'not focused' },
  { id: 'O9', row: 'retry-button',
    predicted: 'with Retry focused: outline-style solid, outline-width equals --oc-border-thick resolved in the same window, and the clip capture of the ring rectangle differs from the same clip captured before Retry was focused',
    injection: 'added <style> giving that one button outline: none !important',
    controlPredicted: 'outline-style none, and the control capture is byte-identical to the unfocused capture' },
  { id: 'O10', row: 'retry-button',
    predicted: 'the ring\'s outer rectangle (Retry\'s border box inflated by outline-offset + outline-width) lies within the item\'s padding box',
    injection: 'inline padding: 0 on the item',
    controlPredicted: 'ring outside the padding box' },
  { id: 'O11', row: 'retry-button',
    predicted: 'for every ancestor of Retry up to the document root whose overflow-x or overflow-y is not visible, the ring\'s outer rectangle lies within that ancestor\'s padding box',
    injection: 'inline overflow: hidden; padding: 0 on the item',
    controlPredicted: 'a clipping ancestor is reported (the item)' },
  { id: 'O12', row: 'retry-themes',
    predicted: 'under emulateMedia({ colorScheme: "dark" }), contrast of Retry\'s computed color against its effective background >= 4.5',
    injection: 'inline color on Retry set to the measured effective background (dark preference)',
    controlPredicted: 'ratio 1.00' },
  { id: 'O13', row: 'retry-themes',
    predicted: 'under emulateMedia({ colorScheme: "light" }), contrast of Retry\'s computed color against its effective background >= 4.5',
    injection: 'inline color on Retry set to the measured effective background (light preference)',
    controlPredicted: 'ratio 1.00' },
  { id: 'O14', row: 'retry-themes',
    predicted: 'Retry\'s color, background-color, border-top-color and the item\'s background-color under the light preference each equal their values under the dark preference',
    injection: 'added <style> with @media (prefers-color-scheme: light) setting that one button\'s color to rgb(1, 2, 3) !important',
    controlPredicted: 'a difference under light (color) and none under dark' },
];

const observations = PLAN.map((p) => ({
  id: p.id,
  backlogRow: p.row,
  predicted: p.predicted,
  verdict: 'instrument-invalid',
  measured: {},
  control: { injection: p.injection, predicted: p.controlPredicted, observed: null },
  fired: false,
  undoVerified: null,
  reason: 'not attempted',
}));
const obsById = new Map(observations.map((o) => [o.id, o]));

const precondition = {
  id: 'O1',
  predicted: `after the reload the selected Pod tab is "${TITLES.companion}" (first by tab order), so neither "${TITLES.live}" nor "${TITLES.target}" has been activated`,
  measured: {},
  verdict: 'not-run',
  note: 'a precondition: it carries no control; if it does not hold, O2-O14 are instrument-invalid',
};

const setup = { pods: {}, tabOrder: [], deleteResult: null, liveActivation: null, targetActivation: null, expectedMessage: null };
const screenshots = [];

// ---------------------------------------------------------------- helpers

function sha256File(path) {
  if (!existsSync(path)) return 'absent';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function nullKeys(refs) {
  return Object.entries(refs)
    .filter(([, v]) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)))
    .map(([k]) => k);
}

function short(err) {
  return String(err?.message ?? err).split('\n')[0];
}

function buffersEqual(a, b) {
  return a !== null && b !== null && Buffer.compare(a, b) === 0;
}

/** Reads a string literal out of a source file, so the expectation is the
 *  shipped text rather than a copy of it. Returns `{ value, line }` or null. */
function sourceLiteral(rel, pattern) {
  const text = readFileSync(join(repoRoot, rel), 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = pattern.exec(lines[i]);
    if (m) return { value: m[1], line: i + 1 };
  }
  return null;
}

/** Runs one observation and applies the verdict rule. `fn` returns
 *  `{ refs, pass, fired, undo }`. */
async function observe(id, fn) {
  const o = obsById.get(id);
  try {
    const res = await fn(o);
    if (res.notRun) {
      o.verdict = 'instrument-invalid';
      o.fired = false;
      o.undoVerified = null;
      o.reason = res.notRun;
    } else {
      const missing = nullKeys(res.refs);
      o.undoVerified = res.undo === true;
      o.fired = missing.length === 0 && res.fired === true && o.undoVerified;
      if (missing.length > 0) {
        o.verdict = 'instrument-invalid';
        o.reason = `null reference(s) at comparison: ${missing.join(', ')}`;
      } else if (!o.fired) {
        o.verdict = 'instrument-invalid';
        o.reason = `control did not fire as predicted (${o.control.predicted}); observed: ${o.control.observed}` +
          (o.undoVerified ? '' : '; undo not verified');
      } else {
        o.verdict = res.pass === true ? 'pass' : 'fail';
        o.reason = null;
      }
    }
  } catch (err) {
    o.fired = false;
    o.verdict = 'instrument-invalid';
    o.reason = `error during measurement: ${short(err)}`;
  }
  console.log(`  ${id}  ${o.verdict}  fired=${o.fired}  undo=${o.undoVerified}  ${o.reason ?? ''}`);
}

// ---------------------------------------------------------------- in-window

/** Installed after the reload. Measurement helpers only; it changes nothing on
 *  the page. */
function installHelpers(expected) {
  const parseColor = (css) => {
    if (typeof css !== 'string') return null;
    const srgb = css.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/i);
    if (srgb) {
      return {
        r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255,
        a: srgb[4] === undefined ? 1 : Number(srgb[4]),
      };
    }
    const rgb = css.match(/rgba?\(([^)]+)\)/i);
    if (!rgb) return null;
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const fmt = (c) => (c === null ? null : `rgb(${c.r.toFixed(2)}, ${c.g.toFixed(2)}, ${c.b.toFixed(2)})`);
  const describe = (el) => {
    if (el === null || el === undefined) return null;
    if (el === document.documentElement) return 'html';
    const t = el.getAttribute('data-testid');
    if (t) return `[data-testid="${t}"]`;
    const label = el.getAttribute('aria-label');
    const cls = typeof el.className === 'string' && el.className !== '' ? `.${el.className.split(/\s+/).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${cls}${label ? `[aria-label="${label}"]` : ''}`;
  };
  /** The colour actually drawn behind `el`: every ancestor-or-self background
   *  composited from the nearest opaque one down. Null when none is opaque. */
  const effBg = (el) => {
    const layers = [];
    let base = null;
    for (let e = el; e !== null; e = e.parentElement) {
      const c = parseColor(getComputedStyle(e).backgroundColor);
      if (c === null || c.a === 0) continue;
      if (c.a >= 1) { base = c; break; }
      layers.push(c);
    }
    if (base === null) return null;
    let acc = base;
    for (let i = layers.length - 1; i >= 0; i -= 1) acc = over(layers[i], acc);
    return acc;
  };
  const contrast = (el) => {
    const fgCss = getComputedStyle(el).color;
    const fg = parseColor(fgCss);
    const bg = effBg(el);
    if (fg === null || bg === null) return { fgCss, fgAlpha: fg?.a ?? null, bg: fmt(bg), bgColor: bg, ratio: null };
    const eff = fg.a < 1 ? over(fg, bg) : fg;
    return { fgCss, fgAlpha: fg.a, bg: fmt(bg), bgColor: bg, ratio: ratio(eff, bg) };
  };
  const sameColor = (a, b) => a !== null && b !== null &&
    Math.abs(a.r - b.r) < 0.5 && Math.abs(a.g - b.g) < 0.5 && Math.abs(a.b - b.b) < 0.5;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  /** Padding box: the border box inset by the computed border widths. */
  const paddingBox = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    const bb = parseFloat(cs.borderBottomWidth) || 0;
    return { left: r.left + bl, right: r.right - br, top: r.top + bt, bottom: r.bottom - bb };
  };
  const within = (inner, outer) => inner.left >= outer.left - 1e-6 && inner.right <= outer.right + 1e-6 &&
    inner.top >= outer.top - 1e-6 && inner.bottom <= outer.bottom + 1e-6;
  /** A selector that names exactly `el`: an nth-child path from <html>. */
  const cssPath = (el) => {
    const parts = [];
    for (let e = el; e !== null && e !== document.documentElement; e = e.parentElement) {
      const i = [...e.parentElement.children].indexOf(e) + 1;
      parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${i})`);
    }
    return `html > ${parts.join(' > ')}`;
  };
  const frames = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
  const messageOf = (item) => item.querySelector(':scope > p');
  /** O3's items: error notifications whose message text equals `text`. */
  const matching = (text) => [...document.querySelectorAll('[data-testid="notification"][data-kind="error"]')]
    .filter((item) => messageOf(item)?.textContent === text);
  const retryButtons = (item) => [...item.querySelectorAll('button')]
    .filter((b) => b.getAttribute('type') === 'button' && (b.textContent ?? '').trim() === 'Retry');
  const first = () => {
    const items = matching(expected);
    const item = items.length > 0 ? items[0] : null;
    const buttons = item === null ? [] : retryButtons(item);
    return {
      item,
      p: item === null ? null : messageOf(item),
      retry: buttons.length > 0 ? buttons[0] : null,
      dismiss: item === null ? null : item.querySelector('[data-testid="notification-dismiss"]'),
    };
  };
  const tabbableCount = () =>
    [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(
      (e) => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length > 0 && e.closest('[hidden],[inert]') === null,
    ).length;
  /** Retry's ring: border box inflated by outline-offset + outline-width. */
  const ring = (btn) => {
    const cs = getComputedStyle(btn);
    const w = parseFloat(cs.outlineWidth);
    const off = parseFloat(cs.outlineOffset);
    const r = btn.getBoundingClientRect();
    const d = (Number.isNaN(off) ? 0 : off) + (Number.isNaN(w) ? 0 : w);
    return {
      outlineStyle: cs.outlineStyle, outlineWidth: w, outlineOffset: off,
      outer: { left: r.left - d, right: r.right + d, top: r.top - d, bottom: r.bottom + d },
    };
  };
  const clearInline = (el, props) => {
    for (const p of props) el.style.removeProperty(p);
    if (el.getAttribute('style') === '') el.removeAttribute('style');
    return !el.hasAttribute('style');
  };
  window.__flf = {
    parseColor, effBg, contrast, sameColor, fmt, describe, rect, paddingBox, within, cssPath, frames,
    messageOf, matching, retryButtons, first, tabbableCount, ring, clearInline, expected,
  };
  return true;
}

// ---------------------------------------------------------------- main

async function main() {
  mkdirSync(H, { recursive: true });
  rmSync(shotsDir, { recursive: true, force: true });
  mkdirSync(shotsDir, { recursive: true });

  const meta = {
    slug: SLUG,
    skipDelete: args.skipDelete,
    generatedAt: '',
    driverSha256: sha256File(driverPath),
    mainBundleSha256: sha256File(mainBundle),
    electron: '',
    playwright: String(requireHere('playwright/package.json').version),
    devicePixelRatio: null,
    viewport: { width: null, height: null },
    display: { scaleFactor: null, zoomFactor: null },
    sandboxRoot: args.sandboxRoot,
    keepSandbox: args.keepSandbox,
    mainEnv: { USERPROFILE: null, APPDATA: null, userData: null, CLAUDE_CONFIG_DIR: null },
    realSettingsPath: realSettings,
    realSettingsSha256: { before: sha256File(realSettings), after: 'absent' },
    exitCode: 2,
    sandboxRemoved: false,
    precondition: null,
  };

  if (!existsSync(mainBundle)) {
    meta.precondition = `out/main/index.js absent at ${mainBundle}; run npm run build first`;
    for (const o of observations) o.reason = `precondition failed: ${meta.precondition}`;
    meta.realSettingsSha256.after = sha256File(realSettings);
    return finish(meta, 2);
  }

  const lit = sourceLiteral('src/main/pod-manager/pod-manager.ts', /notFound\(`(no Pod with id )\$\{podId\}`\)/);
  console.log('main not-found literal:', JSON.stringify(lit));

  const sandbox = buildSandbox(args.sandboxRoot);
  const env = { ...sandbox.env };
  for (const k of Object.keys(env)) {
    const u = k.toUpperCase();
    if (u === 'CLAUDE_CONFIG_DIR' || u === 'CLAUDE_CODE_PROJECT_DIR_NAME') delete env[k];
  }

  let app = null;
  let win = null;
  try {
    if (lit === null) throw new Error('main\'s "no Pod with id" literal not found in pod-manager.ts');
    ({ app, win } = await launch({ ...sandbox, env }));
    meta.mainEnv = await app.evaluate(({ app: eapp }) => ({
      USERPROFILE: process.env.USERPROFILE ?? null,
      APPDATA: process.env.APPDATA ?? null,
      userData: eapp.getPath('userData'),
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? null,
    }));
    meta.electron = await app.evaluate(() => process.versions.electron);
    console.log('main env:', JSON.stringify(meta.mainEnv));
    await win.setViewportSize({ width: 1280, height: 860 }).catch(() => {});
    // The display's scale factor and the page zoom, read in main: computed
    // border and outline widths are snapped to whole device pixels, so these
    // are what explain a computed width that differs from its token.
    meta.display = await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0] ?? null;
      return {
        scaleFactor: w === null ? null : screen.getDisplayMatching(w.getBounds()).scaleFactor,
        zoomFactor: w === null ? null : w.webContents.getZoomFactor(),
      };
    }).catch((e) => ({ error: short(e) }));
    console.log('display:', JSON.stringify(meta.display));

    // ---------------------------------------------------------- S1 setup
    const pods = {};
    for (const key of ['companion', 'live', 'target']) {
      const made = await win.evaluate(
        ({ title, cwd }) => window.orcastrate.pods.create({ title, cwd, permissionMode: 'default' }),
        { title: TITLES[key], cwd: sandbox.plainRepo },
      );
      if (made?.ok !== true) throw new Error(`pods.create ${key} failed: ${JSON.stringify(made?.error ?? made)}`);
      pods[key] = made.value;
    }
    setup.pods = Object.fromEntries(Object.entries(pods).map(([k, p]) => [k, { id: p.id, title: p.title, cwd: p.cwd, tabOrder: p.tabOrder }]));
    console.log('pods:', Object.entries(pods).map(([k, p]) => `${k}=${p.id}`).join(' '));
    const ID = { companion: pods.companion.id, live: pods.live.id, target: pods.target.id };
    const expected = `${lit.value}${ID.target}`;
    setup.expectedMessage = { text: expected, source: `src/main/pod-manager/pod-manager.ts:${lit.line}` };

    await win.reload();
    await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 30000 });
    await win.waitForFunction(
      (ids) => ids.every((id) => document.querySelector(`[data-testid="pod-tab:${id}"]`) !== null),
      Object.values(ID), { timeout: 30000 },
    );
    await win.evaluate(installHelpers, expected);

    const winFacts = await win.evaluate(() => ({ dpr: window.devicePixelRatio, w: window.innerWidth, h: window.innerHeight }));
    meta.devicePixelRatio = winFacts.dpr;
    meta.viewport = { width: winFacts.w, height: winFacts.h };
    let tol = null;
    tol = typeof winFacts.dpr === 'number' && winFacts.dpr > 0 ? 1 / winFacts.dpr : null;
    const park = { x: winFacts.w - 1, y: winFacts.h - 1 };
    const parkMouse = () => win.mouse.move(park.x, park.y);
    const frames = () => win.evaluate(() => window.__flf.frames());

    setup.tabOrder = (await win.evaluate(() => [...document.querySelectorAll('[data-testid^="pod-tab:"]')]
      .map((t) => ({
        id: t.getAttribute('data-testid').slice('pod-tab:'.length),
        index: Number(t.getAttribute('data-pod-tab-index')),
      }))
      .sort((a, b) => a.index - b.index)))
      .map((t) => ({ ...t, title: Object.values(pods).find((p) => p.id === t.id)?.title ?? null }));
    console.log('tab order:', JSON.stringify(setup.tabOrder));

    // ---------------------------------------------------------- O1 precondition
    const selected = () => win.evaluate(() => {
      const t = document.querySelector('[data-testid^="pod-tab:"][aria-current="true"]');
      return t === null ? null : t.getAttribute('data-testid').slice('pod-tab:'.length);
    });
    await win.waitForFunction(
      () => document.querySelector('[data-testid^="pod-tab:"][aria-current="true"]') !== null, undefined, { timeout: 15000 },
    ).catch(() => {});
    const sel = await selected();
    const firstByOrder = setup.tabOrder.length > 0 ? setup.tabOrder[0].id : null;
    precondition.measured = {
      selectedTabId: sel,
      selectedTitle: Object.entries(ID).find(([, v]) => v === sel)?.[0] ?? null,
      firstTabByOrder: firstByOrder,
      liveSelected: sel === ID.live, targetSelected: sel === ID.target,
    };
    precondition.verdict = sel !== null && sel === ID.companion && firstByOrder === ID.companion ? 'pass' : 'fail';
    console.log('O1', precondition.verdict, JSON.stringify(precondition.measured));
    await parkMouse();
    await win.screenshot({ path: join(shotsDir, '01-after-reload.png') });
    screenshots.push(`screenshots/${SLUG}/01-after-reload.png`);
    if (precondition.verdict !== 'pass') {
      for (const o of observations) o.reason = `precondition O1 did not hold: selected ${sel}, expected ${ID.companion}`;
      throw new Error('precondition O1 did not hold');
    }

    const tabPresent = (id) => win.evaluate((id) => document.querySelector(`[data-testid="pod-tab:${id}"]`) !== null, id);

    // ---------------------------------------------------------- O2 delete
    await observe('O2', async (o) => {
      if (args.skipDelete) return { notRun: '--skip-delete: the target is not deleted, so O2 is not measured and its control is not run' };
      let res = null;
      let present = null;
      let ctl = null;
      res = await win.evaluate((podId) => window.orcastrate.pods.delete({ podId, deleteSession: false }), ID.target);
      setup.deleteResult = res;
      await frames();
      present = await tabPresent(ID.target);
      const fresh = randomUUID();
      ctl = await tabPresent(fresh);
      o.measured = {
        deleteOk: res?.ok ?? null, podDeleted: res?.value?.podDeleted ?? null, session: res?.value?.session ?? null,
        targetTabStillRendered: present,
      };
      o.control.observed = `fresh UUID ${fresh}: tab ${ctl ? 'present' : 'absent'}`;
      return {
        refs: { res, present, ctl },
        pass: res.ok === true && res.value?.podDeleted === true && res.value?.session === 'not-requested' && present === true,
        fired: ctl === false,
        undo: true,
      };
    });
    obsById.get('O2').undoNote = args.skipDelete ? null : 'read-only control; nothing to undo';

    // ---------------------------------------------------------- activate live, then target
    await win.getByTestId(`pod-tab:${ID.live}`).click();
    await win.waitForFunction((id) => document.querySelector(`[data-testid="pod-tab:${id}"]`)?.getAttribute('aria-current') === 'true',
      ID.live, { timeout: 10000 }).catch(() => {});
    const liveLanes = await win.evaluate((id) => window.orcastrate.lanes.list(id), ID.live).catch((e) => ({ ok: null, error: short(e) }));
    setup.liveActivation = {
      selectedAfterClick: await selected(),
      errorItemsBeforeTargetClick: await win.evaluate(() => document.querySelectorAll('[data-testid="notification"][data-kind="error"]').length),
      directLanesListOk: liveLanes?.ok ?? null,
    };
    await win.getByTestId(`pod-tab:${ID.target}`).click();
    await win.waitForFunction((id) => document.querySelector(`[data-testid="pod-tab:${id}"]`)?.getAttribute('aria-current') === 'true',
      ID.target, { timeout: 10000 }).catch(() => {});
    setup.targetActivation = { selectedAfterClick: await selected() };
    console.log('activation:', JSON.stringify({ live: setup.liveActivation, target: setup.targetActivation }));

    // ---------------------------------------------------------- O3, O4 the two items
    const O3_TIMEOUT_MS = 15000;
    const waited = await win.waitForFunction(() => window.__flf.matching(window.__flf.expected).length >= 2, undefined,
      { timeout: O3_TIMEOUT_MS }).then(() => true).catch(() => false);
    const snap = await win.evaluate((ids) => {
      const all = [...document.querySelectorAll('[data-testid="notification"]')];
      const contains = (id) => all.filter((i) => (i.textContent ?? '').includes(id)).length;
      return {
        matching: window.__flf.matching(window.__flf.expected).length,
        totalError: document.querySelectorAll('[data-testid="notification"][data-kind="error"]').length,
        totalNotifications: all.length,
        liveContains: contains(ids.live),
        targetContains: contains(ids.target),
        messages: all.map((i) => `${i.getAttribute('data-kind')}: ${window.__flf.messageOf(i)?.textContent ?? ''}`),
      };
    }, ID);
    console.log('snapshot:', JSON.stringify(snap));
    await parkMouse();
    await win.screenshot({ path: join(shotsDir, '02-after-target-click.png') });
    screenshots.push(`screenshots/${SLUG}/02-after-target-click.png`);

    await observe('O3', async (o) => {
      o.measured = {
        matchingItems: snap.matching, waitedConditionMet: waited, timeoutMs: O3_TIMEOUT_MS,
        expectedMessage: expected, messages: snap.messages.join(' / '),
      };
      o.control.observed = `${snap.liveContains} item(s) contain HC load live's id`;
      return { refs: { matching: snap.matching, live: snap.liveContains }, pass: snap.matching === 2, fired: snap.liveContains === 0, undo: true };
    });
    obsById.get('O3').undoNote = 'read-only control; nothing to undo';
    await observe('O4', async (o) => {
      o.measured = { itemsContainingLiveId: snap.liveContains, totalErrorItems: snap.totalError };
      o.control.observed = `${snap.targetContains} item(s) contain the target's id`;
      return {
        refs: { live: snap.liveContains, total: snap.totalError, target: snap.targetContains },
        pass: snap.liveContains === 0 && snap.totalError === 2,
        fired: snap.targetContains === 2,
        undo: true,
      };
    });
    obsById.get('O4').undoNote = 'read-only control; nothing to undo';

    const haveItem = snap.matching >= 1;
    const noItem = () => ({ notRun: args.skipDelete
      ? '--skip-delete: no error item to measure, so no control was run'
      : 'no matching error item to measure, so no control was run' });

    // ---------------------------------------------------------- O5 one Retry each
    await observe('O5', async (o) => {
      if (!haveItem) return noItem();
      let m = null;
      m = await win.evaluate(() => {
        const F = window.__flf;
        const probe = (item) => {
          const p = F.messageOf(item);
          const dismiss = item.querySelector('[data-testid="notification-dismiss"]');
          const buttons = F.retryButtons(item);
          const b = buttons[0] ?? null;
          const after = (x, y) => x !== null && y !== null && Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
          return { count: buttons.length, afterMessage: b === null ? null : after(p, b), beforeDismiss: b === null ? null : after(b, dismiss) };
        };
        const items = F.matching(F.expected);
        const each = items.map(probe);
        // Control: detach the first item's Retry, probe, reattach at its place.
        const item = items[0];
        const btn = F.retryButtons(item)[0] ?? null;
        let ctl = null;
        let undo = null;
        if (btn !== null) {
          const parent = btn.parentNode;
          const next = btn.nextSibling;
          btn.remove();
          ctl = probe(item);
          parent.insertBefore(btn, next);
          undo = probe(item);
          undo.sameNode = F.retryButtons(item)[0] === btn && btn.isConnected;
        }
        return { items: items.length, each, ctl, undo };
      });
      const undoOk = m.undo !== null && m.undo.count === 1 && m.undo.afterMessage === true && m.undo.beforeDismiss === true && m.undo.sameNode === true;
      o.measured = {
        items: m.items,
        perItem: m.each.map((e, i) => `item ${i + 1}: ${e.count} Retry, after <p> ${e.afterMessage}, before dismiss ${e.beforeDismiss}`).join('; '),
      };
      o.control.observed = m.ctl === null ? 'not measurable' : `${m.ctl.count} buttons with Retry detached; reattached: ${m.undo?.count} Retry, same node ${m.undo?.sameNode}`;
      return {
        refs: { m, ctl: m.ctl, undo: m.undo },
        pass: m.items === 2 && m.each.every((e) => e.count === 1 && e.afterMessage === true && e.beforeDismiss === true),
        fired: m.ctl.count === 0,
        undo: undoOk,
      };
    });

    // ---------------------------------------------------------- O6 drawn as a button
    const buttonProbe = () => win.evaluate(() => {
      const F = window.__flf;
      const { item, retry } = F.first();
      if (item === null || retry === null) return null;
      const cs = getComputedStyle(retry);
      const ics = getComputedStyle(item);
      const eb = F.effBg(retry);
      const ei = F.effBg(item);
      return {
        borderTopStyle: cs.borderTopStyle, borderTopWidth: parseFloat(cs.borderTopWidth), cursor: cs.cursor,
        background: cs.backgroundColor, itemBackground: ics.backgroundColor,
        effectiveBackground: F.fmt(eb), itemEffectiveBackground: F.fmt(ei),
        effectiveEqual: eb === null || ei === null ? null : F.sameColor(eb, ei),
        inline: retry.getAttribute('style'),
      };
    });
    await observe('O6', async (o) => {
      if (!haveItem) return noItem();
      let m = null;
      let ctl = null;
      let undo = null;
      await parkMouse();
      await frames();
      m = await buttonProbe();
      await win.evaluate(() => {
        const r = window.__flf.first().retry;
        r.style.borderStyle = 'none';
        r.style.background = 'transparent';
      });
      await frames();
      ctl = await buttonProbe();
      const cleared = await win.evaluate(() => window.__flf.clearInline(window.__flf.first().retry, ['border-style', 'background']));
      await frames();
      undo = await buttonProbe();
      const undoOk = cleared && undo !== null && m !== null && undo.inline === null && undo.borderTopStyle === m.borderTopStyle &&
        undo.borderTopWidth === m.borderTopWidth && undo.background === m.background;
      o.measured = m === null ? {} : { ...m };
      o.control.observed = ctl === null ? 'not measurable'
        : `border-top-style ${ctl.borderTopStyle}, width ${ctl.borderTopWidth}; effective background ${ctl.effectiveBackground} vs item ${ctl.itemEffectiveBackground} (equal: ${ctl.effectiveEqual})`;
      return {
        refs: { m, ctl, undo, effEq: m?.effectiveEqual ?? null, ctlEffEq: ctl?.effectiveEqual ?? null },
        pass: m.borderTopStyle === 'solid' && m.borderTopWidth > 0 && m.cursor === 'pointer' &&
          m.background !== m.itemBackground && m.effectiveEqual === false,
        fired: (ctl.borderTopStyle === 'none' || ctl.borderTopWidth === 0) && ctl.effectiveEqual === true,
        undo: undoOk,
      };
    });

    // ---------------------------------------------------------- O7 beside the message
    const besideProbe = () => win.evaluate(() => {
      const F = window.__flf;
      const { item, p, retry } = F.first();
      if (item === null || p === null || retry === null) return null;
      return { retry: F.rect(retry), p: F.rect(p), inline: item.getAttribute('style') };
    });
    const adjacent = (m, t) => m.retry.left >= m.p.right - t && m.retry.top < m.p.bottom && m.p.top < m.retry.bottom;
    await observe('O7', async (o) => {
      if (!haveItem) return noItem();
      let m = null;
      let ctl = null;
      let undo = null;
      m = await besideProbe();
      await win.evaluate(() => { window.__flf.first().item.style.flexDirection = 'column'; });
      await frames();
      ctl = await besideProbe();
      const cleared = await win.evaluate(() => window.__flf.clearInline(window.__flf.first().item, ['flex-direction']));
      await frames();
      undo = await besideProbe();
      const undoOk = cleared && undo !== null && m !== null && undo.inline === null &&
        Math.abs(undo.retry.left - m.retry.left) <= tol && Math.abs(undo.retry.top - m.retry.top) <= tol;
      o.measured = m === null ? {} : {
        retryLeft: m.retry.left, messageRight: m.p.right, tol,
        retryTop: m.retry.top, retryBottom: m.retry.bottom, messageTop: m.p.top, messageBottom: m.p.bottom,
      };
      o.control.observed = ctl === null ? 'not measurable'
        : `retry left ${ctl.retry.left} vs message right ${ctl.p.right}, retry top ${ctl.retry.top} vs message bottom ${ctl.p.bottom}: adjacent ${adjacent(ctl, tol)}`;
      return {
        refs: { m, ctl, undo, tol },
        pass: adjacent(m, tol),
        fired: !adjacent(ctl, tol),
        undo: undoOk,
      };
    });

    // ---------------------------------------------------------- before O8: starting point, unfocused captures
    const focusProbe = () => win.evaluate(() => {
      const F = window.__flf;
      const { retry } = F.first();
      if (retry === null) return null;
      return {
        active: F.describe(document.activeElement),
        isRetry: document.activeElement === retry,
        focusVisible: retry.matches(':focus-visible'),
      };
    });
    const viewportClip = () => win.evaluate(({ w, h }) => {
      const v = document.querySelector('[data-testid="notification-viewport"]');
      if (v === null) return null;
      const r = v.getBoundingClientRect();
      const x = Math.max(0, r.left - 6);
      const y = Math.max(0, r.top - 6);
      return { x, y, width: Math.min(w, r.right + 6) - x, height: Math.min(h, r.bottom + 6) - y };
    }, { w: winFacts.w, h: winFacts.h });
    const viewportShots = async (state) => {
      for (const scheme of ['dark', 'light']) {
        await win.emulateMedia({ colorScheme: scheme });
        await frames();
        const clip = await viewportClip();
        if (clip === null) continue;
        const name = `viewport-${scheme}-${state}.png`;
        await win.screenshot({ path: join(shotsDir, name), clip, animations: 'disabled' });
        screenshots.push(`screenshots/${SLUG}/${name}`);
      }
      await win.emulateMedia({ colorScheme: null });
      await frames();
    };

    let start = null;
    let ringClip = null;
    let unfocusedCap = null;
    let thickPx = null;
    if (haveItem) {
      // The stated starting point: a mouse click on the first item's message
      // <p>. The click focuses the notification viewport (a tabindex=-1
      // section), never Retry, and no script calls focus().
      const pr = await win.evaluate(() => window.__flf.rect(window.__flf.first().p));
      await win.mouse.click(pr.left + Math.min(4, pr.width / 2), pr.top + pr.height / 2);
      await parkMouse();
      await frames();
      start = { clicked: 'first matching item\'s message <p>', at: { x: pr.left + Math.min(4, pr.width / 2), y: pr.top + pr.height / 2 }, ...(await focusProbe()) };
      const t = await win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--oc-border-thick').trim());
      thickPx = /^[\d.]+px$/.test(t) ? parseFloat(t) : null;
      const br = await win.evaluate(() => window.__flf.rect(window.__flf.first().retry));
      if (thickPx !== null) {
        const pad = 2 * thickPx + 2;
        ringClip = { x: Math.max(0, br.left - pad), y: Math.max(0, br.top - pad), width: br.width + 2 * pad, height: br.height + 2 * pad };
        unfocusedCap = await win.screenshot({ clip: ringClip, animations: 'disabled' });
        writeFileSync(join(shotsDir, 'O9-ring-clip-unfocused.png'), unfocusedCap);
        screenshots.push(`screenshots/${SLUG}/O9-ring-clip-unfocused.png`);
      }
      await viewportShots('unfocused');
    }

    // ---------------------------------------------------------- O8 Tab reaches Retry
    await observe('O8', async (o) => {
      if (!haveItem) return noItem();
      let before = null;
      let after = null;
      let bound = null;
      before = await focusProbe();
      bound = await win.evaluate(() => window.__flf.tabbableCount());
      let presses = 0;
      let reached = false;
      for (; presses < bound && !reached;) {
        await win.keyboard.press('Tab');
        presses += 1;
        reached = (await focusProbe())?.isRetry === true;
      }
      after = await focusProbe();
      o.measured = {
        startingPoint: `${start?.clicked} at (${start?.at?.x?.toFixed(1)}, ${start?.at?.y?.toFixed(1)}); active after the click: ${start?.active}`,
        tabPresses: presses, tabBound: bound, active: after?.active ?? null, isRetry: after?.isRetry ?? null,
        focusVisible: after?.focusVisible ?? null,
      };
      o.control.observed = before === null ? 'not measurable' : `before any press: active ${before.active}, Retry focused ${before.isRetry}, :focus-visible ${before.focusVisible}`;
      return {
        refs: { before, after, bound },
        pass: after.isRetry === true && after.focusVisible === true,
        fired: before.isRetry === false,
        undo: true,
      };
    });
    obsById.get('O8').undoNote = 'read-only control; nothing to undo';

    // ---------------------------------------------------------- O9 the ring is painted
    const ringProbe = () => win.evaluate(() => {
      const F = window.__flf;
      const { item, retry } = F.first();
      if (item === null || retry === null) return null;
      const r = F.ring(retry);
      return {
        ...r, isRetry: document.activeElement === retry, focusVisible: retry.matches(':focus-visible'),
        itemPadding: F.paddingBox(item), itemInline: item.getAttribute('style'),
      };
    });
    let focusedCap = null;
    await observe('O9', async (o) => {
      if (!haveItem) return noItem();
      let m = null;
      let ctl = null;
      let ctlCap = null;
      let undo = null;
      m = await ringProbe();
      if (ringClip !== null) {
        focusedCap = await win.screenshot({ clip: ringClip, animations: 'disabled' });
        writeFileSync(join(shotsDir, 'O9-ring-clip-focused.png'), focusedCap);
        screenshots.push(`screenshots/${SLUG}/O9-ring-clip-focused.png`);
        await win.evaluate(() => {
          const s = document.createElement('style');
          s.id = 'flf-o9-control';
          s.textContent = `${window.__flf.cssPath(window.__flf.first().retry)}{outline:none !important}`;
          document.head.appendChild(s);
        });
        await frames();
        ctl = await ringProbe();
        ctlCap = await win.screenshot({ clip: ringClip, animations: 'disabled' });
        writeFileSync(join(shotsDir, 'O9-ring-clip-control-outline-none.png'), ctlCap);
        screenshots.push(`screenshots/${SLUG}/O9-ring-clip-control-outline-none.png`);
        await win.evaluate(() => document.getElementById('flf-o9-control')?.remove());
        await frames();
        undo = await ringProbe();
      }
      const styleGone = await win.evaluate(() => document.getElementById('flf-o9-control') === null);
      const undoOk = styleGone && undo !== null && m !== null && undo.outlineStyle === m.outlineStyle &&
        undo.outlineWidth === m.outlineWidth && undo.isRetry === true;
      const painted = focusedCap !== null && unfocusedCap !== null ? !buffersEqual(focusedCap, unfocusedCap) : null;
      // Context for a width that differs from its token: the hairline border
      // on the same button against its own token, read in the same window.
      const hair = await win.evaluate(() => ({
        token: getComputedStyle(document.documentElement).getPropertyValue('--oc-border-hairline').trim(),
        retryBorderTopWidth: getComputedStyle(window.__flf.first().retry).borderTopWidth,
      }));
      o.measured = {
        outlineStyle: m?.outlineStyle ?? null, outlineWidth: m?.outlineWidth ?? null, outlineOffset: m?.outlineOffset ?? null,
        borderThickToken: thickPx, focusedCaptureDiffersFromUnfocused: painted,
        context: `--oc-border-hairline ${hair.token}, Retry computed border-top-width ${hair.retryBorderTopWidth}`,
        ringClip: ringClip === null ? null : `${ringClip.x.toFixed(2)},${ringClip.y.toFixed(2)} ${ringClip.width.toFixed(2)}x${ringClip.height.toFixed(2)}`,
      };
      o.control.observed = ctl === null ? 'not measurable'
        : `outline-style ${ctl.outlineStyle}; control capture byte-identical to unfocused capture: ${buffersEqual(ctlCap, unfocusedCap)}`;
      return {
        refs: { m, ctl, undo, thickPx, ringClip, unfocusedCap, focusedCap, ctlCap, painted },
        pass: m.outlineStyle === 'solid' && Math.abs(m.outlineWidth - thickPx) < 1e-6 && painted === true,
        fired: ctl.outlineStyle === 'none' && buffersEqual(ctlCap, unfocusedCap),
        undo: undoOk,
      };
    });
    if (haveItem) await viewportShots('retry-focused');

    // ---------------------------------------------------------- O10 inside the item
    await observe('O10', async (o) => {
      if (!haveItem) return noItem();
      let m = null;
      let ctl = null;
      let undo = null;
      const inside = (r) => win.evaluate((r) => window.__flf.within(r.outer, r.itemPadding), r);
      m = await ringProbe();
      const mIn = m === null ? null : await inside(m);
      await win.evaluate(() => { window.__flf.first().item.style.padding = '0'; });
      await frames();
      ctl = await ringProbe();
      const ctlIn = ctl === null ? null : await inside(ctl);
      const cleared = await win.evaluate(() => window.__flf.clearInline(window.__flf.first().item, ['padding']));
      await frames();
      undo = await ringProbe();
      const undoOk = cleared && undo !== null && m !== null && undo.itemInline === null &&
        Math.abs(undo.outer.top - m.outer.top) <= tol && Math.abs(undo.outer.left - m.outer.left) <= tol && undo.isRetry === true;
      const f = (r) => `l ${r.left.toFixed(2)} r ${r.right.toFixed(2)} t ${r.top.toFixed(2)} b ${r.bottom.toFixed(2)}`;
      o.measured = m === null ? {} : { ringOuter: f(m.outer), itemPaddingBox: f(m.itemPadding), ringInside: mIn };
      o.control.observed = ctl === null ? 'not measurable' : `ring ${f(ctl.outer)} vs padding box ${f(ctl.itemPadding)}: inside ${ctlIn}`;
      return { refs: { m, ctl, undo, mIn, ctlIn }, pass: mIn === true, fired: ctlIn === false, undo: undoOk };
    });

    // ---------------------------------------------------------- O11 no clipping ancestor
    const clipProbe = () => win.evaluate(() => {
      const F = window.__flf;
      const { item, retry } = F.first();
      if (item === null || retry === null) return null;
      const r = F.ring(retry);
      const checked = [];
      for (let e = retry.parentElement; e !== null; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const pb = F.paddingBox(e);
        checked.push({ ancestor: F.describe(e), overflow: `${cs.overflowX}/${cs.overflowY}`, isItem: e === item, contains: F.within(r.outer, pb) });
      }
      return { checked, clipping: checked.filter((c) => !c.contains), itemInline: item.getAttribute('style'), isRetry: document.activeElement === retry };
    });
    await observe('O11', async (o) => {
      if (!haveItem) return noItem();
      let m = null;
      let ctl = null;
      let undo = null;
      m = await clipProbe();
      await win.evaluate(() => { const i = window.__flf.first().item; i.style.overflow = 'hidden'; i.style.padding = '0'; });
      await frames();
      ctl = await clipProbe();
      const cleared = await win.evaluate(() => window.__flf.clearInline(window.__flf.first().item, ['overflow', 'padding']));
      await frames();
      undo = await clipProbe();
      const undoOk = cleared && undo !== null && m !== null && undo.itemInline === null &&
        JSON.stringify(undo.checked) === JSON.stringify(m.checked) && undo.isRetry === true;
      const list = (x) => (x.checked.length === 0 ? 'none' : x.checked.map((c) => `${c.ancestor} (${c.overflow}) contains ${c.contains}`).join('; '));
      o.measured = m === null ? {} : { ancestorsChecked: list(m), clippingAncestors: m.clipping.length };
      o.control.observed = ctl === null ? 'not measurable' : `clipping ancestors: ${ctl.clipping.map((c) => c.ancestor).join(', ') || 'none'}`;
      return {
        refs: { m, ctl, undo },
        pass: m.clipping.length === 0,
        fired: ctl.clipping.some((c) => c.isItem),
        undo: undoOk,
      };
    });

    // ---------------------------------------------------------- O12, O13 contrast
    const contrastProbe = () => win.evaluate(() => {
      const F = window.__flf;
      const { retry } = F.first();
      if (retry === null) return null;
      const c = F.contrast(retry);
      return { fg: c.fgCss, fgAlpha: c.fgAlpha, bg: c.bg, bgColor: c.bgColor, ratio: c.ratio, inline: retry.getAttribute('style') };
    });
    const contrastObs = (id, scheme) => observe(id, async (o) => {
      if (!haveItem) return noItem();
      let m = null;
      let ctl = null;
      let undo = null;
      await win.emulateMedia({ colorScheme: scheme });
      await parkMouse();
      await frames();
      m = await contrastProbe();
      if (m !== null && m.bg !== null) {
        await win.evaluate((bg) => { window.__flf.first().retry.style.color = bg; }, m.bg);
        await frames();
        ctl = await contrastProbe();
        await win.evaluate(() => window.__flf.clearInline(window.__flf.first().retry, ['color']));
        await frames();
        undo = await contrastProbe();
      }
      const undoOk = undo !== null && m !== null && undo.fg === m.fg && undo.inline === null;
      o.measured = {
        colorScheme: scheme, foreground: m?.fg ?? null, foregroundAlpha: m?.fgAlpha ?? null,
        effectiveBackground: m?.bg ?? null,
        contrastRatio: m === null || m.ratio === null ? null : Number(m.ratio.toFixed(3)), threshold: 4.5,
      };
      o.control.observed = ctl === null || ctl.ratio === null ? 'not measurable under control' : `ratio ${ctl.ratio.toFixed(2)}`;
      return {
        refs: { m, ratio: m?.ratio ?? null, ctl, ctlRatio: ctl?.ratio ?? null, undo },
        pass: m.ratio >= 4.5,
        fired: ctl.ratio.toFixed(2) === '1.00',
        undo: undoOk,
      };
    });
    await contrastObs('O12', 'dark');
    await contrastObs('O13', 'light');
    await win.emulateMedia({ colorScheme: null }).catch(() => {});

    // ---------------------------------------------------------- O14 the preference changes nothing
    const paletteProbe = (scheme) => (async () => {
      await win.emulateMedia({ colorScheme: scheme });
      await frames();
      return win.evaluate(() => {
        const { item, retry } = window.__flf.first();
        if (item === null || retry === null) return null;
        const cs = getComputedStyle(retry);
        return {
          color: cs.color, backgroundColor: cs.backgroundColor, borderTopColor: cs.borderTopColor,
          itemBackgroundColor: getComputedStyle(item).backgroundColor,
          prefersLight: matchMedia('(prefers-color-scheme: light)').matches,
        };
      });
    })();
    const diffs = (a, b) => ['color', 'backgroundColor', 'borderTopColor', 'itemBackgroundColor'].filter((k) => a[k] !== b[k]);
    await observe('O14', async (o) => {
      if (!haveItem) return noItem();
      let dark = null;
      let light = null;
      let ctlDark = null;
      let ctlLight = null;
      let undoLight = null;
      await parkMouse();
      dark = await paletteProbe('dark');
      light = await paletteProbe('light');
      await win.evaluate(() => {
        const s = document.createElement('style');
        s.id = 'flf-o14-control';
        s.textContent = `@media (prefers-color-scheme: light){${window.__flf.cssPath(window.__flf.first().retry)}{color:rgb(1, 2, 3) !important}}`;
        document.head.appendChild(s);
      });
      ctlDark = await paletteProbe('dark');
      ctlLight = await paletteProbe('light');
      await win.evaluate(() => document.getElementById('flf-o14-control')?.remove());
      undoLight = await paletteProbe('light');
      const styleGone = await win.evaluate(() => document.getElementById('flf-o14-control') === null);
      await win.emulateMedia({ colorScheme: null });
      await frames();
      const resetLight = await win.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches);
      const undoOk = styleGone && undoLight !== null && light !== null && diffs(undoLight, light).length === 0;
      o.measured = dark === null || light === null ? {} : {
        dark: `color ${dark.color}; background ${dark.backgroundColor}; border-top ${dark.borderTopColor}; item ${dark.itemBackgroundColor}`,
        light: `color ${light.color}; background ${light.backgroundColor}; border-top ${light.borderTopColor}; item ${light.itemBackgroundColor}`,
        differing: diffs(light, dark).join(', ') || 'none',
        emulationApplied: `dark prefersLight=${dark.prefersLight}, light prefersLight=${light.prefersLight}`,
        emulateMediaResetToNull: true, prefersLightAfterReset: resetLight,
      };
      const dd = ctlDark === null || dark === null ? null : diffs(ctlDark, dark);
      const dl = ctlLight === null || dark === null ? null : diffs(ctlLight, dark);
      o.control.observed = dd === null || dl === null ? 'not measurable'
        : `under dark, differing from dark: ${dd.join(', ') || 'none'}; under light, differing from dark: ${dl.join(', ') || 'none'} (color ${ctlLight.color})`;
      // The emulation itself is a reference: if the window did not see the
      // preference it was given, nothing was compared.
      const emulated = dark !== null && light !== null && dark.prefersLight === false && light.prefersLight === true ? true : null;
      return {
        refs: { dark, light, ctlDark, ctlLight, undoLight, dd, dl, emulated },
        pass: diffs(light, dark).length === 0,
        fired: dd.length === 0 && dl.length === 1 && dl[0] === 'color',
        undo: undoOk,
      };
    });
  } catch (err) {
    console.error('run error:', short(err));
    meta.precondition = meta.precondition ?? (precondition.verdict === 'fail' ? 'O1 did not hold' : `run aborted: ${short(err)}`);
    for (const o of observations) {
      if (o.reason === 'not attempted' || o.reason?.startsWith('precondition O1')) {
        o.verdict = 'instrument-invalid';
        o.fired = false;
        if (o.reason === 'not attempted') o.reason = `run aborted before this observation: ${short(err)}`;
      }
    }
  } finally {
    if (app !== null) await app.close().catch(() => {});
  }

  if (!args.keepSandbox) {
    rmSync(args.sandboxRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
  meta.sandboxRemoved = !existsSync(args.sandboxRoot);
  meta.realSettingsSha256.after = sha256File(realSettings);

  let code = 0;
  if (precondition.verdict !== 'pass' || observations.some((o) => o.verdict === 'instrument-invalid')) code = 2;
  else if (observations.some((o) => o.verdict === 'fail')) code = 1;
  else if (!observations.every((o) => o.fired === true)) code = 2;
  return finish(meta, code);
}

// ---------------------------------------------------------------- reports

/** A markdown cell. A raw `|` would split the row, so it is escaped. */
function cell(v) {
  const s = v === null || v === undefined ? 'null' : String(v).replace(/\r?\n/g, ' ');
  return s.replace(/\|/g, '\\|');
}

function finish(meta, code) {
  meta.exitCode = code;
  meta.generatedAt = new Date().toISOString();
  const report = { meta, plan: PLAN, setup, precondition, observations, screenshots };
  writeFileSync(join(H, `driven-report-${SLUG}.json`), JSON.stringify(report, null, 2) + '\n', 'utf8');

  const md = [];
  md.push(`# Driven hand-run: forced load failure (${SLUG})`, '');
  md.push(`Generated ${meta.generatedAt}. Exit code ${code}.`, '');
  md.push(`- Electron ${meta.electron}, Playwright ${meta.playwright}`);
  md.push(`- devicePixelRatio ${meta.devicePixelRatio}, viewport ${meta.viewport.width}x${meta.viewport.height}`);
  md.push(`- display scale factor ${meta.display?.scaleFactor ?? null}, page zoom factor ${meta.display?.zoomFactor ?? null}`);
  md.push(`- driver sha256 \`${meta.driverSha256}\``);
  md.push(`- out/main/index.js sha256 \`${meta.mainBundleSha256}\``);
  md.push(`- sandbox ${cell(meta.sandboxRoot)}, removed after the run: ${meta.sandboxRemoved}`);
  md.push(`- main env: USERPROFILE ${cell(meta.mainEnv.USERPROFILE)}, APPDATA ${cell(meta.mainEnv.APPDATA)}, userData ${cell(meta.mainEnv.userData)}, CLAUDE_CONFIG_DIR ${cell(meta.mainEnv.CLAUDE_CONFIG_DIR)}`);
  md.push(`- real settings.json sha256 before ${meta.realSettingsSha256.before}, after ${meta.realSettingsSha256.after}`);
  if (meta.precondition) md.push(`- precondition: ${cell(meta.precondition)}`);
  md.push('');
  md.push('## Setup', '');
  for (const [k, p] of Object.entries(setup.pods)) md.push(`- ${k}: ${p.title} \`${p.id}\``);
  md.push(`- tab order: ${setup.tabOrder.map((t) => `${t.index}=${t.title}`).join(', ')}`);
  md.push(`- expected message: \`${setup.expectedMessage?.text ?? null}\` (${setup.expectedMessage?.source ?? 'n/a'})`);
  md.push(`- delete result: \`${JSON.stringify(setup.deleteResult)}\``);
  md.push(`- live activation: \`${JSON.stringify(setup.liveActivation)}\`; target activation: \`${JSON.stringify(setup.targetActivation)}\``);
  md.push('');
  md.push(`## O1 (precondition): ${precondition.verdict}`, '');
  md.push(`${precondition.predicted}. Measured: \`${JSON.stringify(precondition.measured)}\``, '');
  md.push('## Observations', '');
  md.push('| Obs | Row | Verdict | Fired | Undo verified | Measured | Control | Control predicted | Control observed | Reason |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const o of observations) {
    const measured = Object.entries(o.measured).map(([k, v]) => `${k}=${v}`).join('; ');
    md.push(`| ${o.id} | ${o.backlogRow} | ${o.verdict} | ${o.fired} | ${o.undoVerified} | ${cell(measured)} | ${cell(o.control.injection)} | ` +
      `${cell(o.control.predicted)} | ${cell(o.control.observed)} | ${cell(o.reason)} |`);
  }
  md.push('', '## Screenshots', '');
  for (const s of screenshots) md.push(`- \`${s}\``);
  md.push('');
  writeFileSync(join(H, `driven-report-${SLUG}.md`), md.join('\n'), 'utf8');

  console.log(`\n==== FORCED LOAD FAILURE RUN (${SLUG}): exit ${code} ====`);
  for (const o of observations) console.log(`  ${o.id} ${o.verdict}${o.reason ? ' - ' + o.reason : ''}`);
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('FATAL', e);
    process.exit(2);
  });
