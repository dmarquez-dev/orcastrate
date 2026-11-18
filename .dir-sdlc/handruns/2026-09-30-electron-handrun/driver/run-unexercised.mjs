/**
 * Unexercised steps run: the three TESTPLAN steps the 2026-10-07 run recorded as
 * not exercised (`FINDINGS.md`, "Not exercised, and why"), driven in the real
 * Electron window. The fourth row there, the same-millisecond backup collision
 * (B4), was dropped by the user at Gate 1 of session
 * 20261117-2333-handrun-unexercised-steps and is not attempted.
 *
 *   B5      a blocked backup aborts the write                       (O2, O3)
 *   D3      a failed `helm:scopes` says its sentence once           (O4, O5)
 *   A3      layout at narrow window widths, a Pod and Helm open     (O6-O9)
 *
 * THE CLOCK. Helm takes its backup name from `deps.now()`, which main wires as
 * `now: () => new Date()` (`src/main/index.ts:168`), and names the backup
 * `settings.json.<backupStamp(now)>.bak` (`src/main/helm/atomic-write.ts:47-67`).
 * The driver replaces the main process's global `Date` through
 * `electronApp.evaluate` with a subclass whose no-argument constructor and
 * `Date.now()` return a fixed instant, performs one save, and restores the real
 * `Date`. O2 is the positive control: the backup that save writes must carry
 * the frozen instant's stamp. Only if O2 passes is B5 (O3) attempted.
 *
 * THE SCOPES FAILURE. `listScopes` stats every scope file and rethrows any
 * error that is not ENOENT (`src/main/helm/revision.ts:63-71`). Renaming
 * `~/.claude` (TESTPLAN D3's suggestion) yields ENOENT, which is "absent", not a
 * failure. A junction at `<home>/.claude/settings.json` pointing at itself makes
 * the stat throw ELOOP; a junction needs no privilege on Windows. It is staged
 * in its own sandbox before a second launch.
 *
 * RULES THIS FILE KEEPS (precedent `run-forced-load-failure.mjs`)
 *   - Every prediction is written in PLAN below, before anything runs.
 *   - Every reference a verdict reads starts `null` and is assigned from a
 *     measurement; a reference still `null` at its comparison makes the
 *     observation `instrument-invalid`, never `pass`.
 *   - Every observation has a control. One whose control did not fire as
 *     predicted is `instrument-invalid` whatever it measured.
 *   - No fixed sleep: every wait is a condition with a timeout.
 *   - The real `~/.claude` is never read or written: not hashed, not listed.
 *     Isolation is shown by main's own env and by the path Helm displays.
 *   - Outputs: `driven-report-<slug>.json` / `.md` and `screenshots/<slug>/`
 *     under the output directory (default: the hand-run directory), and the
 *     sandbox root. `lib.mjs`'s screenshot and report helpers write to the
 *     2026-10-07 run's paths, so neither is called here.
 *
 * Run `npm run build` first; this launches `<repoRoot>/out/main/index.js`.
 *
 *   node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run-unexercised.mjs
 *        --sandbox-root <abs path> [--skip-obstruction | --skip-freeze]
 *        [--out-dir <abs path>] [--keep-sandbox]
 *
 * `--skip-obstruction` (slug `unexercised-control`) is the must-fail control:
 * the directory at the second instant's backup path is never created, so the
 * B5 save succeeds and O3 must `fail`. `--skip-freeze` (slug
 * `unexercised-control-skip-freeze`) never freezes the clock, so O2 must `fail`
 * and O3 is not attempted.
 *
 * Exit 0 iff every observation is `pass` and every control fired; 1 when every
 * observation is valid and at least one is `fail`; 2 otherwise (an
 * `instrument-invalid` observation, a failed precondition, a bad invocation).
 */
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, repoRoot } from './lib.mjs';
import { BASELINE_SETTINGS, buildSandbox, writeSettings } from './sandbox.mjs';

// ---------------------------------------------------------------- invocation

function parseArgs(argv) {
  const out = { sandboxRoot: null, outDir: null, skipObstruction: false, skipFreeze: false, keepSandbox: false, error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sandbox-root' || a === '--out-dir') {
      const v = i + 1 < argv.length ? argv[++i] : null;
      if (v === null) out.error = out.error ?? `${a} needs a value`;
      if (a === '--sandbox-root') out.sandboxRoot = v;
      else out.outDir = v;
    } else if (a === '--skip-obstruction') out.skipObstruction = true;
    else if (a === '--skip-freeze') out.skipFreeze = true;
    else if (a === '--keep-sandbox') out.keepSandbox = true;
    else out.error = out.error ?? `unknown argument ${a}`;
  }
  if (out.error === null && out.skipObstruction && out.skipFreeze) out.error = '--skip-obstruction and --skip-freeze are exclusive';
  if (out.error === null && out.sandboxRoot === null) out.error = '--sandbox-root <absolute dir> is required';
  for (const [k, v] of [['--sandbox-root', out.sandboxRoot], ['--out-dir', out.outDir]]) {
    if (out.error === null && v !== null && (!win32.isAbsolute(v) || !isAbsolute(v))) out.error = `${k} must be an absolute path; got ${v}`;
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
  console.error(`run-unexercised: ${args.error}`);
  process.exit(2);
}

const SLUG = args.skipObstruction ? 'unexercised-control' : args.skipFreeze ? 'unexercised-control-skip-freeze' : 'unexercised';
const driverPath = fileURLToPath(import.meta.url);
const H = args.outDir ?? join(dirname(driverPath), '..');
const shotsDir = join(H, 'screenshots', SLUG);
const mainBundle = join(repoRoot, 'out', 'main', 'index.js');
const requireHere = createRequire(import.meta.url);
const ROOT_HELM = join(args.sandboxRoot, 'helm');
const ROOT_SCOPES = join(args.sandboxRoot, 'scopes-fail');

/** Two fixed instants, years ahead of any real clock, so no real-time stamp can equal either. */
const T1 = '2031-02-03T04:05:06.789Z';
const T2 = '2031-02-03T04:05:07.321Z';
/** `backupStamp` (`src/main/helm/atomic-write.ts:47-49`), reproduced; O2's source check reads that line. */
const stampOf = (iso) => iso.replace(/[:.]/g, '-');
const POD_TITLE = 'UX narrow pod';

// ---------------------------------------------------------------- the plan

const PLAN = [
  { id: 'O2', row: 'B5 clock-freeze positive control (C1)',
    predicted: `with main's Date frozen at ${T1}, one Helm save of the user scope creates exactly one new settings.json.* entry, named settings.json.${stampOf(T1)}.bak, the panel's backup banner names it, and it holds the pre-save bytes`,
    injection: 'main\'s new Date().toISOString() read before the freeze, and again after the real Date is restored',
    controlPredicted: `both differ from ${T1}; the restored Date is the original constructor` },
  { id: 'O3', row: 'B5 a blocked backup aborts the write (C2)',
    predicted: `with main's Date frozen at ${T2} and a directory pre-created at settings.json.${stampOf(T2)}.bak: the save fails, the helm-error banner contains the OS error text main's own copyFileSync onto that path produces, settings.json sha256 is identical before and after, no settings.json.${stampOf(T2)}.<n>.bak exists, the directory is still an empty directory, and no new settings.json.* entry appears`,
    injection: `the .<n>.bak sibling scan run after a decoy file settings.json.${stampOf(T2)}.7.bak is written, then again after it is removed`,
    controlPredicted: '1 sibling with the decoy, 0 after removal' },
  { id: 'O4', row: 'D3 instrument check: the scopes call fails (C3)',
    predicted: 'in the second launch, whose home has a self-referencing junction at .claude/settings.json, window.orcastrate.helm.listScopes() resolves ok: false with a non-empty error message',
    injection: 'the same bridge call in the first launch (a healthy sandbox home)',
    controlPredicted: 'ok: true' },
  { id: 'O5', row: 'D3 the failure sentence once (C3)',
    predicted: 'after opening Helm in the second launch, the helm-panel element\'s textContent contains O4\'s message exactly 1 time (non-overlapping occurrences)',
    injection: 'a clone of the <p> holding the message appended to the helm-error banner, counted, then removed',
    controlPredicted: '2 with the clone; 1 after removal' },
  { id: 'O6', row: 'A3 the narrowest width the app allows (C4)',
    predicted: 'the window\'s getMinimumSize() width equals minWidth in src/main/window.ts, and setSize to 140 below it yields the same getSize() width as setSize to the minimum, which is not below the minimum',
    injection: 'setSize to 60 above the minimum',
    controlPredicted: 'getSize() width equals the request' },
  ...['O7', 'O8', 'O9'].map((id, i) => ({
    id, row: `A3 narrow window, width ${['1280', '1100', 'minimum'][i]} (C4)`,
    predicted: 'with a Pod tab selected and Helm open on the user scope: document.documentElement.scrollWidth <= clientWidth (no horizontal overflow of the root); a screenshot is saved. Appearance is human check H1, not judged here',
    injection: 'a div of width clientWidth + 200 px appended to <body>, measured, then removed',
    controlPredicted: 'root scrollWidth > clientWidth with the div; back to the measured value after removal',
  })),
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
  predicted: 'each launch\'s main process reports USERPROFILE, APPDATA and userData inside its sandbox and CLAUDE_CONFIG_DIR unset; in the first launch Helm\'s File row shows the sandbox settings path',
  measured: {},
  verdict: 'not-run',
  note: 'a precondition: it carries no control; if it does not hold for a launch, that launch\'s observations are instrument-invalid',
};

const setup = { instants: { T1, T2, stampT1: stampOf(T1), stampT2: stampOf(T2) }, healthyListScopes: null, pod: null, stampSource: null, minWidthSource: null, scopesStaging: null, afterB5MinWidth: null };
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

function countOccurrences(hay, needle) {
  if (typeof hay !== 'string' || typeof needle !== 'string' || needle === '') return null;
  return hay.split(needle).length - 1;
}

function sourceLine(rel, pattern) {
  const lines = readFileSync(join(repoRoot, rel), 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = pattern.exec(lines[i]);
    if (m) return { value: m[1] ?? m[0], line: i + 1, text: lines[i].trim() };
  }
  return null;
}

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

function stripEnv(env) {
  const out = { ...env };
  for (const k of Object.keys(out)) {
    const u = k.toUpperCase();
    if (u === 'CLAUDE_CONFIG_DIR' || u === 'CLAUDE_CODE_PROJECT_DIR_NAME') delete out[k];
  }
  return out;
}

const inside = (outer, inner) => {
  if (typeof inner !== 'string') return false;
  const rel = relative(outer.toLowerCase(), inner.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

async function mainEnv(app) {
  return app.evaluate(({ app: eapp }) => ({
    USERPROFILE: process.env.USERPROFILE ?? null,
    APPDATA: process.env.APPDATA ?? null,
    userData: eapp.getPath('userData'),
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? null,
  }));
}

function envInSandbox(env, root) {
  return inside(root, env.USERPROFILE) && inside(root, env.APPDATA) && inside(root, env.userData) && env.CLAUDE_CONFIG_DIR === null;
}

const frames = (win) => win.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true)))));

async function snap(win, name) {
  const file = join(shotsDir, name);
  await win.screenshot({ path: file });
  screenshots.push(`screenshots/${SLUG}/${name}`);
}

// ---- the clock, in main. Functions passed to `app.evaluate` run in the main
// process; the global they replace is the one `new Date()` in the bundle reads.

const freezeMainClock = (app, iso) => app.evaluate((_e, at) => {
  const g = globalThis;
  if (g.__ocRealDate === undefined) g.__ocRealDate = g.Date;
  const Real = g.__ocRealDate;
  const fixed = Real.parse(at);
  class FrozenDate extends Real {
    constructor(...a) {
      if (a.length === 0) super(fixed);
      else super(...a);
    }

    static now() {
      return fixed;
    }
  }
  g.Date = FrozenDate;
  return { now: new Date().toISOString(), dateNow: Date.now(), replaced: g.Date !== Real };
}, iso);

const thawMainClock = (app) => app.evaluate(() => {
  const g = globalThis;
  const real = g.__ocRealDate;
  if (real !== undefined) g.Date = real;
  return { now: new Date().toISOString(), restored: real === undefined ? null : g.Date === real };
});

const mainNow = (app) => app.evaluate(() => new Date().toISOString());

/** main's own copyFileSync from settings.json onto `dest`, only when `dest` is a
 *  directory (so the probe can never create a file). Returns the OS message. */
const mainCopyErrorOnto = (app, src, dest) => app.evaluate((_e, p) => {
  const req = process.mainModule?.require ?? globalThis.require;
  if (typeof req !== 'function') return { message: null, note: 'no require in main evaluate' };
  const fs = req('node:fs');
  let isDir = false;
  try { isDir = fs.statSync(p.dest).isDirectory(); } catch { isDir = false; }
  if (!isDir) return { message: null, note: 'destination is not a directory; probe not run' };
  try {
    fs.copyFileSync(p.src, p.dest);
    return { message: null, note: 'copyFileSync onto the directory did not throw' };
  } catch (err) {
    return { message: String(err.message), code: err.code ?? null };
  }
}, { src, dest });

// ---------------------------------------------------------------- main

async function main() {
  mkdirSync(H, { recursive: true });
  rmSync(shotsDir, { recursive: true, force: true });
  mkdirSync(shotsDir, { recursive: true });

  const meta = {
    slug: SLUG,
    skipObstruction: args.skipObstruction,
    skipFreeze: args.skipFreeze,
    generatedAt: '',
    driverSha256: sha256File(driverPath),
    mainBundleSha256: sha256File(mainBundle),
    electron: '',
    playwright: String(requireHere('playwright/package.json').version),
    devicePixelRatio: null,
    display: { scaleFactor: null },
    sandboxRoot: args.sandboxRoot,
    outDir: H,
    keepSandbox: args.keepSandbox,
    mainEnv: { helm: null, scopesFail: null },
    realClaudeHome: 'never read or written by this driver',
    exitCode: 2,
    sandboxRemoved: false,
    precondition: null,
  };

  if (!existsSync(mainBundle)) {
    meta.precondition = `out/main/index.js absent at ${mainBundle}; run npm run build first`;
    for (const o of observations) o.reason = `precondition failed: ${meta.precondition}`;
    return finish(meta, 2);
  }

  setup.stampSource = sourceLine('src/main/helm/atomic-write.ts', /return now\.toISOString\(\)\.replace\(\/\[:\.\]\/g, '-'\);/);
  setup.minWidthSource = sourceLine('src/main/window.ts', /minWidth:\s*(\d+)/);
  console.log('sources:', JSON.stringify({ stamp: setup.stampSource, minWidth: setup.minWidthSource }));
  const preHelm = { ok: null, launch: 'helm' };
  const preScopes = { ok: null, launch: 'scopes-fail' };
  precondition.measured = { helm: preHelm, scopesFail: preScopes };

  // =========================================================== launch 1: helm
  const sandbox = buildSandbox(ROOT_HELM);
  writeSettings(sandbox, BASELINE_SETTINGS);
  const entries = () => readdirSync(sandbox.claude).filter((n) => n.startsWith('settings.json.')).sort();

  let app = null;
  let win = null;
  try {
    ({ app, win } = await launch({ ...sandbox, env: stripEnv(sandbox.env) }));
    meta.electron = await app.evaluate(() => process.versions.electron);
    meta.mainEnv.helm = await mainEnv(app);
    meta.display = await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0] ?? null;
      return { scaleFactor: w === null ? null : screen.getDisplayMatching(w.getBounds()).scaleFactor };
    }).catch((e) => ({ error: short(e) }));
    meta.devicePixelRatio = await win.evaluate(() => window.devicePixelRatio);
    console.log('main env (helm):', JSON.stringify(meta.mainEnv.helm), 'display', JSON.stringify(meta.display));

    // The bridge call O4's control reads: the same call, in a healthy home.
    const healthy = await win.evaluate(() => window.orcastrate.helm.listScopes());
    setup.healthyListScopes = { ok: healthy?.ok ?? null, scopes: healthy?.ok ? healthy.value.length : null, error: healthy?.ok === false ? healthy.error : null };

    // A Pod, so the workspace has a Pod tab selected for the narrow-window shots.
    const made = await win.evaluate(
      ({ title, cwd }) => window.orcastrate.pods.create({ title, cwd, permissionMode: 'default' }),
      { title: POD_TITLE, cwd: sandbox.plainRepo },
    );
    if (made?.ok !== true) throw new Error(`pods.create failed: ${JSON.stringify(made?.error ?? made)}`);
    setup.pod = { id: made.value.id, title: made.value.title };
    await win.reload();
    await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 30000 });
    await win.waitForFunction(
      (id) => document.querySelector(`[data-testid="pod-tab:${id}"]`)?.getAttribute('aria-current') === 'true',
      setup.pod.id, { timeout: 30000 },
    ).catch(() => {});

    await win.getByTestId('panel-bar-open:helm').click();
    await win.waitForSelector('[data-testid="helm-panel"]', { timeout: 15000 });
    await win.getByTestId('helm-scope-select').selectOption({ label: 'All projects — This machine' });
    await win.waitForFunction(() => {
      const el = document.querySelector('[data-testid="helm-model"]');
      return el !== null && !el.disabled && el.value === 'claude-opus-5';
    }, undefined, { timeout: 15000 });
    const scopePath = (await win.getByTestId('helm-scope-path').textContent())?.trim() ?? null;
    preHelm.scopePath = scopePath;
    preHelm.env = meta.mainEnv.helm;
    preHelm.ok = envInSandbox(meta.mainEnv.helm, ROOT_HELM) && typeof scopePath === 'string' && scopePath.includes(sandbox.claude);
    console.log('O1 helm', preHelm.ok, scopePath);
    if (!preHelm.ok) throw new Error('precondition O1 (helm launch) did not hold');

    const podSelected = () => win.evaluate((id) => document.querySelector(`[data-testid="pod-tab:${id}"]`)?.getAttribute('aria-current') === 'true', setup.pod.id);
    const helmOpen = () => win.evaluate(() => document.querySelector('[data-testid="helm-panel"]') !== null);

    // ------------------------------------------------------- O6 the minimum
    const winGeom = () => app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { size: w.getSize(), content: w.getContentSize(), min: w.getMinimumSize(), maximized: w.isMaximized() };
    });
    const resize = async (width, height) => {
      await app.evaluate(({ BrowserWindow }, s) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w.isMaximized()) w.unmaximize();
        w.setSize(s.width, s.height);
      }, { width, height });
      const g = await winGeom();
      await win.waitForFunction((cw) => Math.abs(window.innerWidth - cw) <= 1, g.content[0], { timeout: 10000 }).catch(() => {});
      await frames(win);
      return g;
    };
    const HEIGHT = 800;
    let minWidth = null;
    await observe('O6', async (o) => {
      let g0 = null;
      let gMin = null;
      let gBelow = null;
      let gAbove = null;
      g0 = await winGeom();
      minWidth = g0.min[0];
      const src = setup.minWidthSource === null ? null : Number(setup.minWidthSource.value);
      gMin = await resize(minWidth, HEIGHT);
      gBelow = await resize(minWidth - 140, HEIGHT);
      gAbove = await resize(minWidth + 60, HEIGHT);
      o.measured = {
        minimumSize: g0.min.join('x'), sourceMinWidth: src, sourceLine: setup.minWidthSource ? `src/main/window.ts:${setup.minWidthSource.line}` : null,
        initialSize: g0.size.join('x'), sizeAtMinimumRequest: gMin.size.join('x'),
        requestedBelow: minWidth - 140, sizeAfterBelow: gBelow.size.join('x'),
      };
      o.control.observed = `requested ${minWidth + 60}, getSize ${gAbove.size.join('x')}`;
      // The clamp is judged against the width the minimum request itself
      // yields in the same window, not against the literal: at a fractional
      // display scale the OS may round the outer width by a DIP or two.
      return {
        refs: { g0, gMin, gBelow, gAbove, src },
        pass: minWidth === src && gBelow.size[0] === gMin.size[0] && gBelow.size[0] >= minWidth,
        fired: gAbove.size[0] === minWidth + 60,
        undo: true,
      };
    });
    obsById.get('O6').undoNote = 'the width is set again by each of O7-O9';

    // ------------------------------------------------------- O7-O9 the widths
    const overflowProbe = () => win.evaluate(() => {
      const r = document.documentElement;
      const b = document.body;
      const hp = document.querySelector('[data-testid="helm-panel"]');
      const cw = r.clientWidth;
      const past = [...document.querySelectorAll('body *')].filter((e) => {
        const rc = e.getBoundingClientRect();
        return rc.width > 0 && rc.height > 0 && rc.right > cw + 1;
      }).length;
      return {
        innerWidth: window.innerWidth, rootScrollWidth: r.scrollWidth, rootClientWidth: cw,
        bodyScrollWidth: b.scrollWidth, bodyClientWidth: b.clientWidth,
        helmScrollWidth: hp?.scrollWidth ?? null, helmClientWidth: hp?.clientWidth ?? null,
        elementsPastRightEdge: past,
      };
    });
    const widths = { O7: 1280, O8: 1100, O9: 'min' };
    for (const [id, wReq] of Object.entries(widths)) {
      await observe(id, async (o) => {
        if (minWidth === null) return { notRun: 'O6 did not read the minimum width' };
        const width = wReq === 'min' ? minWidth : wReq;
        let g = null;
        let m = null;
        let ctl = null;
        let undo = null;
        g = await resize(width, HEIGHT);
        const pod = await podSelected();
        const helm = await helmOpen();
        m = await overflowProbe();
        const name = `narrow-${width}.png`;
        await snap(win, name);
        await win.evaluate(() => {
          const d = document.createElement('div');
          d.id = 'ux-overflow-control';
          d.style.width = `${document.documentElement.clientWidth + 200}px`;
          d.style.height = '1px';
          document.body.appendChild(d);
        });
        await frames(win);
        ctl = await overflowProbe();
        await win.evaluate(() => document.getElementById('ux-overflow-control')?.remove());
        await frames(win);
        undo = await overflowProbe();
        const gone = await win.evaluate(() => document.getElementById('ux-overflow-control') === null);
        o.measured = {
          requestedWidth: width, windowSize: g.size.join('x'), contentSize: g.content.join('x'),
          innerWidth: m.innerWidth, rootScrollWidth: m.rootScrollWidth, rootClientWidth: m.rootClientWidth,
          rootOverflowsX: m.rootScrollWidth > m.rootClientWidth,
          bodyScrollWidth: m.bodyScrollWidth, bodyClientWidth: m.bodyClientWidth,
          helmPanelScrollWidth: m.helmScrollWidth, helmPanelClientWidth: m.helmClientWidth,
          elementsPastRightEdge: m.elementsPastRightEdge, podTabSelected: pod, helmOpen: helm,
          screenshot: `screenshots/${SLUG}/${name}`,
        };
        o.control.observed = `with the div: root scrollWidth ${ctl.rootScrollWidth} vs clientWidth ${ctl.rootClientWidth}; after removal ${undo.rootScrollWidth}`;
        return {
          refs: { g, m, ctl, undo, pod: pod === true ? true : null, helm: helm === true ? true : null },
          pass: m.rootScrollWidth <= m.rootClientWidth,
          fired: ctl.rootScrollWidth > ctl.rootClientWidth,
          undo: gone && undo.rootScrollWidth === m.rootScrollWidth,
        };
      });
    }
    await resize(1280, HEIGHT);

    // ------------------------------------------------------- O2 clock freeze
    const bannerText = (id) => win.evaluate((t) => document.querySelector(`[data-testid="${t}"]`)?.textContent ?? null, id);
    const saveWith = async (value) => {
      const prevBackup = await bannerText('helm-backup-path');
      await win.getByTestId('helm-model').fill(value);
      await win.waitForFunction(() => document.querySelector('[data-testid="helm-save"]')?.disabled === false, undefined, { timeout: 10000 });
      await win.getByTestId('helm-save').click();
      const settled = await win.waitForFunction((prev) => {
        if (document.querySelector('[data-testid="helm-error"]') !== null) return 'error';
        const b = document.querySelector('[data-testid="helm-backup-path"]');
        if (b !== null && b.textContent !== prev) return 'saved';
        return false;
      }, prevBackup, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => 'timeout');
      await frames(win);
      return settled;
    };

    /** Context only, never a verdict: whether any part of a banner lies inside
     *  the visible area of every scrolling ancestor and the viewport. */
    const bannerInView = (testid) => win.evaluate((t) => {
      const el = document.querySelector(`[data-testid="${t}"]`);
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      let top = 0;
      let bottom = window.innerHeight;
      for (let e = el.parentElement; e !== null; e = e.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(e).overflowY)) {
          const pr = e.getBoundingClientRect();
          top = Math.max(top, pr.top);
          bottom = Math.min(bottom, pr.bottom);
        }
      }
      return { bannerTop: Math.round(r.top), bannerBottom: Math.round(r.bottom), visibleTop: Math.round(top), visibleBottom: Math.round(bottom), anyPartVisible: r.bottom > top && r.top < bottom };
    }, testid);
    const scrollBannerIntoView = (testid) => win.evaluate((t) => {
      document.querySelector(`[data-testid="${t}"]`)?.scrollIntoView({ block: 'start' });
    }, testid);

    let o2Pass = false;
    await observe('O2', async (o) => {
      let pre = null;
      let frozen = null;
      let thawed = null;
      let settled = null;
      const before = entries();
      const bytesBefore = readFileSync(sandbox.settingsPath);
      pre = await mainNow(app);
      try {
        if (!args.skipFreeze) frozen = await freezeMainClock(app, T1);
        settled = await saveWith('frozen-clock-probe');
      } finally {
        thawed = args.skipFreeze ? { now: await mainNow(app), restored: true } : await thawMainClock(app);
      }
      const after = entries();
      const added = after.filter((n) => !before.includes(n));
      const expectedName = `settings.json.${stampOf(T1)}.bak`;
      const banner = await bannerText('helm-backup-path');
      const backupBytesMatch = added.length === 1 && Buffer.compare(readFileSync(join(sandbox.claude, added[0])), bytesBefore) === 0;
      await snap(win, 'c1-clock-frozen-save.png');
      const view = await bannerInView('helm-backup-path');
      if (view !== null) {
        await scrollBannerIntoView('helm-backup-path');
        await frames(win);
        await snap(win, 'c1-backup-banner.png');
      }
      o.measured = {
        backupBannerInViewAfterSave: view === null ? 'no banner' : JSON.stringify(view),
        mainNowBeforeFreeze: pre, mainNowWhileFrozen: frozen?.now ?? (args.skipFreeze ? 'not frozen (--skip-freeze)' : null),
        saveSettled: settled, newEntries: added.join(', ') || 'none', expectedName,
        bannerNamesExpected: typeof banner === 'string' && banner.includes(expectedName), backupHoldsPreSaveBytes: backupBytesMatch,
        stampSource: setup.stampSource ? `src/main/helm/atomic-write.ts:${setup.stampSource.line}` : null,
      };
      o.control.observed = `before freeze ${pre}; after restore ${thawed.now} (restored constructor: ${thawed.restored})`;
      o2Pass = settled === 'saved' && added.length === 1 && added[0] === expectedName && o.measured.bannerNamesExpected && backupBytesMatch;
      return {
        refs: { pre, thawed, settled, stampSource: setup.stampSource, ...(args.skipFreeze ? {} : { frozen }) },
        pass: o2Pass,
        fired: pre !== T1 && thawed.now !== T1,
        undo: thawed.restored === true,
      };
    });
    if (obsById.get('O2').verdict !== 'pass') o2Pass = false;

    // ------------------------------------------------------- O3 B5
    await observe('O3', async (o) => {
      if (!o2Pass) {
        return { notRun: `C1's positive control (O2) did not pass, so B5 is not attempted; O2 observed new entries: ${obsById.get('O2').measured.newEntries ?? 'n/a'}` };
      }
      const stamp2 = stampOf(T2);
      const obstruction = join(sandbox.claude, `settings.json.${stamp2}.bak`);
      const siblingRe = new RegExp(`^settings\\.json\\.${stamp2.replace(/[-]/g, '\\-')}\\.\\d+\\.bak$`);
      const siblings = () => readdirSync(sandbox.claude).filter((n) => siblingRe.test(n));
      if (!args.skipObstruction) mkdirSync(obstruction);
      const before = entries();
      let shaBefore = null;
      let shaAfter = null;
      let probe = null;
      let frozen = null;
      let thawed = null;
      let settled = null;
      shaBefore = sha256File(sandbox.settingsPath);
      try {
        frozen = await freezeMainClock(app, T2);
        if (!args.skipObstruction) probe = await mainCopyErrorOnto(app, sandbox.settingsPath, obstruction);
        settled = await saveWith('blocked-backup-probe');
      } finally {
        thawed = await thawMainClock(app);
      }
      shaAfter = sha256File(sandbox.settingsPath);
      const after = entries();
      const added = after.filter((n) => !before.includes(n));
      const errText = await bannerText('helm-error');
      const sib = siblings();
      let obstructionState = 'absent';
      if (existsSync(obstruction)) obstructionState = statSync(obstruction).isDirectory() ? `directory, ${readdirSync(obstruction).length} entries` : 'file';
      await snap(win, 'b5-blocked-backup.png');
      const errView = await bannerInView('helm-error');
      if (errView !== null) {
        await scrollBannerIntoView('helm-error');
        await frames(win);
        await snap(win, 'b5-error-banner.png');
      }

      // control: the sibling scan must see a decoy, and stop seeing it.
      const decoy = join(sandbox.claude, `settings.json.${stamp2}.7.bak`);
      writeFileSync(decoy, 'decoy\n', 'utf8');
      const withDecoy = siblings().length;
      unlinkSync(decoy);
      const afterDecoy = siblings().length;

      const expected = probe?.message ?? null;
      o.measured = {
        obstruction: args.skipObstruction ? 'not created (--skip-obstruction)' : obstruction,
        mainNowWhileFrozen: frozen?.now ?? null, saveSettled: settled,
        mainOsErrorText: args.skipObstruction ? 'not probed (--skip-obstruction)' : expected,
        helmErrorBanner: errText, bannerCarriesOsText: expected !== null && typeof errText === 'string' && errText.includes(expected),
        sha256Before: shaBefore, sha256After: shaAfter, ordinalSiblings: sib.join(', ') || 'none',
        newEntries: added.join(', ') || 'none', obstructionAfter: obstructionState,
        errorBannerInViewAfterSave: errView === null ? 'no banner' : JSON.stringify(errView),
      };
      o.control.observed = `${withDecoy} sibling(s) with the decoy, ${afterDecoy} after removal`;
      const okObstruction = args.skipObstruction || obstructionState === 'directory, 0 entries';
      return {
        refs: { shaBefore, shaAfter, frozen, thawed, settled, ...(args.skipObstruction ? {} : { expected }) },
        pass: settled === 'error' && o.measured.bannerCarriesOsText && shaBefore === shaAfter && sib.length === 0 &&
          added.length === 0 && okObstruction,
        fired: withDecoy === 1 && afterDecoy === 0,
        undo: afterDecoy === 0 && thawed.restored === true,
      };
    });

    // Context only, no verdict: the narrowest width again, now with whatever
    // banner the B5 save left on screen.
    if (minWidth !== null) {
      await resize(minWidth, HEIGHT);
      const m = await overflowProbe();
      setup.afterB5MinWidth = { width: minWidth, ...m };
      await snap(win, `narrow-${minWidth}-after-b5.png`);
      await resize(1280, HEIGHT);
    }
  } catch (err) {
    console.error('run error (helm launch):', short(err));
    meta.precondition = meta.precondition ?? `helm launch aborted: ${short(err)}`;
    for (const id of ['O2', 'O3', 'O6', 'O7', 'O8', 'O9']) {
      const o = obsById.get(id);
      if (o.reason === 'not attempted') o.reason = `run aborted before this observation: ${short(err)}`;
    }
  } finally {
    if (app !== null) await app.close().catch(() => {});
  }

  // =========================================================== launch 2: scopes fail
  const sb2 = buildSandbox(ROOT_SCOPES);
  let app2 = null;
  let win2 = null;
  try {
    // The staging: a junction at settings.json that points at itself.
    symlinkSync(sb2.settingsPath, sb2.settingsPath, 'junction');
    let staged = null;
    try { statSync(sb2.settingsPath); staged = { code: null, message: 'stat did not throw' }; } catch (e) { staged = { code: e.code ?? null, message: String(e.message) }; }
    setup.scopesStaging = { junction: sb2.settingsPath, nodeStat: staged };
    console.log('scopes staging:', JSON.stringify(setup.scopesStaging));

    ({ app: app2, win: win2 } = await launch({ ...sb2, env: stripEnv(sb2.env) }));
    meta.mainEnv.scopesFail = await mainEnv(app2);
    preScopes.env = meta.mainEnv.scopesFail;
    preScopes.ok = envInSandbox(meta.mainEnv.scopesFail, ROOT_SCOPES);
    console.log('O1 scopes-fail', preScopes.ok, JSON.stringify(meta.mainEnv.scopesFail));
    if (!preScopes.ok) throw new Error('precondition O1 (scopes-fail launch) did not hold');

    let bridgeMsg = null;
    await observe('O4', async (o) => {
      let res = null;
      res = await win2.evaluate(() => window.orcastrate.helm.listScopes());
      const healthyOk = setup.healthyListScopes?.ok ?? null;
      bridgeMsg = res?.ok === false && typeof res.error?.message === 'string' && res.error.message !== '' ? res.error.message : null;
      o.measured = { ok: res?.ok ?? null, code: res?.error?.code ?? null, message: res?.error?.message ?? null, nodeStatCode: staged.code };
      o.control.observed = `first launch listScopes ok: ${healthyOk}${setup.healthyListScopes?.scopes != null ? `, ${setup.healthyListScopes.scopes} scope(s)` : ''}`;
      return { refs: { res, healthyOk }, pass: res.ok === false && bridgeMsg !== null, fired: healthyOk === true, undo: true };
    });
    obsById.get('O4').undoNote = 'read-only control; nothing to undo';

    await observe('O5', async (o) => {
      if (bridgeMsg === null) return { notRun: 'O4 produced no failure message to count' };
      await win2.getByTestId('panel-bar-open:helm').click();
      await win2.waitForSelector('[data-testid="helm-panel"]', { timeout: 15000 });
      const appeared = await win2.waitForSelector('[data-testid="helm-error"]', { timeout: 15000 }).then(() => true).catch(() => false);
      await frames(win2);
      const read = () => win2.evaluate(() => ({
        panel: document.querySelector('[data-testid="helm-panel"]')?.textContent ?? null,
        doc: document.body.textContent ?? null,
        bannerParagraphs: document.querySelectorAll('[data-testid="helm-error"] p').length,
      }));
      let m = null;
      let ctl = null;
      let undo = null;
      m = await read();
      await snap(win2, 'd3-scopes-failed.png');
      const cloned = await win2.evaluate((msg) => {
        const p = [...document.querySelectorAll('[data-testid="helm-panel"] p')].find((x) => x.textContent === msg) ?? null;
        if (p === null) return false;
        const c = p.cloneNode(true);
        c.id = 'ux-d3-control';
        document.querySelector('[data-testid="helm-error"]').appendChild(c);
        return true;
      }, bridgeMsg);
      ctl = await read();
      await win2.evaluate(() => document.getElementById('ux-d3-control')?.remove());
      undo = await read();
      const count = countOccurrences(m.panel, bridgeMsg);
      const ctlCount = cloned ? countOccurrences(ctl.panel, bridgeMsg) : null;
      const undoCount = countOccurrences(undo.panel, bridgeMsg);
      o.measured = {
        helmErrorAppeared: appeared, occurrencesInHelmPanel: count, occurrencesInBody: countOccurrences(m.doc, bridgeMsg),
        helmErrorParagraphs: m.bannerParagraphs, message: bridgeMsg,
      };
      o.control.observed = `${ctlCount} with the clone, ${undoCount} after removal`;
      return {
        refs: { m, count, ctlCount, undoCount },
        pass: count === 1,
        fired: ctlCount === 2,
        undo: undoCount === count,
      };
    });
  } catch (err) {
    console.error('run error (scopes-fail launch):', short(err));
    meta.precondition = meta.precondition ?? `scopes-fail launch aborted: ${short(err)}`;
    for (const id of ['O4', 'O5']) {
      const o = obsById.get(id);
      if (o.reason === 'not attempted') o.reason = `run aborted before this observation: ${short(err)}`;
    }
  } finally {
    if (app2 !== null) await app2.close().catch(() => {});
  }

  precondition.verdict = preHelm.ok === true && preScopes.ok === true ? 'pass' : 'fail';

  if (!args.keepSandbox) {
    rmSync(args.sandboxRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
  meta.sandboxRemoved = !existsSync(args.sandboxRoot);

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
  const counts = {
    pass: observations.filter((o) => o.verdict === 'pass').length,
    fail: observations.filter((o) => o.verdict === 'fail').length,
    instrumentInvalid: observations.filter((o) => o.verdict === 'instrument-invalid').length,
    total: observations.length,
  };
  const report = { meta, counts, plan: PLAN, setup, precondition, observations, screenshots };
  writeFileSync(join(H, `driven-report-${SLUG}.json`), JSON.stringify(report, null, 2) + '\n', 'utf8');

  const md = [];
  md.push(`# Driven hand-run: unexercised steps (${SLUG})`, '');
  md.push(`Generated ${meta.generatedAt}. Exit code ${code}. Observations: ${counts.pass} pass, ${counts.fail} fail, ${counts.instrumentInvalid} instrument-invalid, of ${counts.total}.`, '');
  md.push(`- Electron ${meta.electron}, Playwright ${meta.playwright}`);
  md.push(`- devicePixelRatio ${meta.devicePixelRatio}, display scale factor ${meta.display?.scaleFactor ?? null}`);
  md.push(`- driver sha256 \`${meta.driverSha256}\``);
  md.push(`- out/main/index.js sha256 \`${meta.mainBundleSha256}\``);
  md.push(`- sandbox ${cell(meta.sandboxRoot)}, removed after the run: ${meta.sandboxRemoved}`);
  for (const [k, e] of Object.entries(meta.mainEnv)) {
    md.push(`- main env (${k}): ${e === null ? 'not launched' : `USERPROFILE ${cell(e.USERPROFILE)}, APPDATA ${cell(e.APPDATA)}, userData ${cell(e.userData)}, CLAUDE_CONFIG_DIR ${cell(e.CLAUDE_CONFIG_DIR)}`}`);
  }
  md.push(`- real ~/.claude: ${meta.realClaudeHome}`);
  if (meta.precondition) md.push(`- precondition: ${cell(meta.precondition)}`);
  md.push('');
  md.push('## Setup', '');
  md.push(`- frozen instants: T1 \`${T1}\` (stamp \`${stampOf(T1)}\`), T2 \`${T2}\` (stamp \`${stampOf(T2)}\`)`);
  md.push(`- backupStamp source: \`${cell(setup.stampSource ? `src/main/helm/atomic-write.ts:${setup.stampSource.line} ${setup.stampSource.text}` : null)}\``);
  md.push(`- minWidth source: \`${cell(setup.minWidthSource ? `src/main/window.ts:${setup.minWidthSource.line} ${setup.minWidthSource.text}` : null)}\``);
  md.push(`- Pod: \`${JSON.stringify(setup.pod)}\``);
  md.push(`- first launch listScopes: \`${JSON.stringify(setup.healthyListScopes)}\``);
  md.push(`- scopes-fail staging: \`${cell(JSON.stringify(setup.scopesStaging))}\``);
  md.push(`- context, no verdict: minimum width after the B5 save: \`${cell(JSON.stringify(setup.afterB5MinWidth))}\``);
  md.push('');
  md.push(`## O1 (precondition): ${precondition.verdict}`, '');
  md.push(`${precondition.predicted}. Measured: \`${cell(JSON.stringify(precondition.measured))}\``, '');
  md.push('## Observations', '');
  md.push('| Obs | Row | Verdict | Fired | Undo verified | Measured | Control | Control predicted | Control observed | Reason |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const o of observations) {
    const measured = Object.entries(o.measured).map(([k, v]) => `${k}=${v}`).join('; ');
    md.push(`| ${o.id} | ${cell(o.backlogRow)} | ${o.verdict} | ${o.fired} | ${o.undoVerified} | ${cell(measured)} | ${cell(o.control.injection)} | ` +
      `${cell(o.control.predicted)} | ${cell(o.control.observed)} | ${cell(o.reason)} |`);
  }
  md.push('', '## Screenshots', '');
  for (const s of screenshots) md.push(`- \`${s}\``);
  md.push('');
  writeFileSync(join(H, `driven-report-${SLUG}.md`), md.join('\n'), 'utf8');

  console.log(`\n==== UNEXERCISED RUN (${SLUG}): exit ${code}; ${counts.pass} pass, ${counts.fail} fail, ${counts.instrumentInvalid} instrument-invalid of ${counts.total} ====`);
  for (const o of observations) console.log(`  ${o.id} ${o.verdict}${o.reason ? ' - ' + o.reason : ''}`);
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('FATAL', e);
    process.exit(2);
  });
