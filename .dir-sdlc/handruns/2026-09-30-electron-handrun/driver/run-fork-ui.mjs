/**
 * Fork UI run: the five human checks the two fork sessions left open, measured
 * in the real Electron window.
 *
 *   row 1  the fork glyph renders as a mark, not a missing-glyph box, at the
 *          same size as the play and delete glyphs            (O1, O2)
 *   row 2  on a Pod with no session and on a running Pod, the Fork control is
 *          dimmed, not-allowed, and exposes its reason title    (O3-O8)
 *   row 3  the fork's tab exposes `Forked from <parent title>`  (O9)
 *   row 4  the fork-error dismiss button sits on the error's line, centred,
 *          readable under dark and light preferences            (O10-O13)
 *   row 5  Tab reaches the dismiss button with a visible ring, Enter closes the
 *          alert, and the ring lands on the Pods chrome         (O14-O16)
 *
 * RULES THIS FILE KEEPS
 *   - No verdict compares a length with a literal. Lengths are compared with
 *     another length measured in the same window, or with one device pixel
 *     (`1 / devicePixelRatio`, read in the window).
 *   - Every reference a verdict reads is declared `null` and assigned from a
 *     measurement. A reference still `null` at its comparison makes the
 *     observation `instrument-invalid`, never `pass`.
 *   - Every observation has an in-window control, and its prediction is written
 *     in PLAN below, before anything runs. An observation whose control did not
 *     fire as predicted is `instrument-invalid` whatever it measured. Controls
 *     are inline styles, an added <style>, a substituted text node, or a
 *     different key or pointer path. No file is edited to run one, and each is
 *     undone and the undo verified before the next observation.
 *   - Outputs: `driven-report-<slug>.json` / `.md` and `screenshots/<slug>/`
 *     only. `lib.mjs`'s screenshot and report helpers write to the 2026-10-07
 *     run's paths, so neither is called here.
 *
 * Run `npm run build` first; this launches `<repoRoot>/out/main/index.js`.
 *
 *   node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run-fork-ui.mjs
 *        [--slug fork-ui|fork-ui-recheck] [--sandbox-root <abs path>] [--keep-sandbox]
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, win32 } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, repoRoot } from './lib.mjs';
import { buildSandbox, encodeCwdForProjects } from './sandbox.mjs';

// ---------------------------------------------------------------- invocation

const SLUGS = ['fork-ui', 'fork-ui-recheck'];

function parseArgs(argv) {
  const out = { slug: 'fork-ui', sandboxRoot: null, keepSandbox: false, error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug') out.slug = argv[++i];
    else if (a === '--sandbox-root') out.sandboxRoot = argv[++i];
    else if (a === '--keep-sandbox') out.keepSandbox = true;
    else out.error = `unknown argument ${a}`;
  }
  if (!SLUGS.includes(out.slug)) out.error = `--slug must be one of ${SLUGS.join(', ')}; got ${out.slug}`;
  if (out.sandboxRoot === null) out.sandboxRoot = `C:\\oc-sandbox-${out.slug}`;
  if (typeof out.sandboxRoot !== 'string' || !win32.isAbsolute(out.sandboxRoot) || !isAbsolute(out.sandboxRoot)) {
    out.error = out.error ?? `--sandbox-root must be an absolute path; got ${out.sandboxRoot}`;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.error !== null) {
  // Contract I1: any other slug value exits 2 with nothing written.
  console.error(`run-fork-ui: ${args.error}`);
  process.exit(2);
}

const SLUG = args.slug;
const driverPath = fileURLToPath(import.meta.url);
const H = join(dirname(driverPath), '..');
const shotsDir = join(H, 'screenshots', SLUG);
const mainBundle = join(repoRoot, 'out', 'main', 'index.js');
const realSettings = join(homedir(), '.claude', 'settings.json');
const requireHere = createRequire(import.meta.url);

// ---------------------------------------------------------------- the plan
// Every prediction is written here, before the run, as a literal or as a rule
// over the same window's measurements. `observed` and `fired` are filled in by
// the run and nothing else.

const PLAN = [
  { id: 'O1', row: 1, state: 'S1',
    injection: 'text node of P1 fork span substituted with U+0379, captured at the same clip, same decision applied',
    predicted: 'decision reports "missing glyph"; the U+0379 capture is byte-identical to the U+0378 reference' },
  { id: 'O2', row: 1, state: 'S1',
    injection: 'inline font-size on the P1 fork span set to twice its computed value',
    predicted: '0 of 2 text-range height pairs equal' },
  { id: 'O3', row: 2, state: 'S1',
    injection: 'same measurement on P3 before its fork (eligible)',
    predicted: 'fork opacity equals run opacity (not dimmed)' },
  { id: 'O4', row: 2, state: 'S1',
    injection: 'same measurement on P3 before its fork (eligible)',
    predicted: 'pointer' },
  { id: 'O5', row: 2, state: 'S1',
    injection: 'same hover measurement on P3 fork control before its fork',
    predicted: 'null' },
  { id: 'O6', row: 2, state: 'S2',
    injection: 'same measurement on P3 before its fork (eligible)',
    predicted: 'fork opacity equals run opacity (not dimmed)' },
  { id: 'O7', row: 2, state: 'S2',
    injection: 'same measurement on P3 before its fork (eligible)',
    predicted: 'pointer' },
  { id: 'O8', row: 2, state: 'S2',
    injection: 'same hover measurement on P3 fork control before its fork',
    predicted: 'null' },
  { id: 'O9', row: 3, state: 'S3',
    injection: "same hover measurement on P3's own tab",
    predicted: 'null' },
  { id: 'O10', row: 4, state: 'S4',
    injection: "inline flex-direction: column on the dismiss button's parent",
    predicted: '0 line boxes contain the button centre' },
  { id: 'O11', row: 4, state: 'S4',
    injection: 'inline margin-top on the dismiss button equal to its own measured height',
    predicted: 'difference equals half the button height within one device pixel, so exceeds the tolerance' },
  { id: 'O12', row: 4, state: 'S4',
    injection: 'inline color on the dismiss button set to the measured background colour (dark preference)',
    predicted: 'ratio 1.00' },
  { id: 'O13', row: 4, state: 'S4',
    injection: 'inline color on the dismiss button set to the measured background colour (light preference)',
    predicted: 'ratio 1.00' },
  { id: 'O14', row: 5, state: 'S4',
    injection: 'added <style>: [aria-label="Dismiss fork error"]{outline:none !important}',
    predicted: 'outline-style none; the clip is byte-identical to the control capture' },
  { id: 'O15', row: 5, state: 'S4',
    injection: 'on a second failed fork of P4, Shift (non-activating) pressed on the focused dismiss button instead of Enter',
    predicted: 'alert count stays 1' },
  { id: 'O16', row: 5, state: 'S4',
    injection: 'a further failed fork of P4 dismissed by mouse click instead of Enter',
    predicted: 'chrome focused; :focus-visible false' },
];

const observations = PLAN.map((p) => ({
  id: p.id,
  backlogRow: p.row,
  verdict: 'not-run',
  measured: {},
  control: { injection: p.injection, predicted: p.predicted, observed: '', fired: false },
  reason: 'not attempted',
}));
const obsById = new Map(observations.map((o) => [o.id, o]));
const stateOf = new Map(PLAN.map((p) => [p.id, p.state]));

const states = ['S1', 'S2', 'S3', 'S4'].map((id) => ({ id, route: '', reached: false, evidence: '' }));
const stateById = new Map(states.map((s) => [s.id, s]));

/** The session-id write attempts, shared by S3 and S4. */
const writeRoutes = { route1: null, route2: null, used: null };

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

function buffersEqual(a, b) {
  return a !== null && b !== null && Buffer.compare(a, b) === 0;
}

/** Runs one observation and applies the verdict rule. */
async function observe(id, fn) {
  const o = obsById.get(id);
  const st = stateById.get(stateOf.get(id));
  if (!st.reached) {
    const bothRoutes = writeRoutes.route1 !== null && writeRoutes.route2 !== null &&
      writeRoutes.route1.ok === false && writeRoutes.route2.ok === false;
    if (bothRoutes) {
      o.verdict = 'not-run';
      o.reason = `${st.id} not reached. Route 1: ${writeRoutes.route1.error}. Route 2: ${writeRoutes.route2.error}.`;
    } else {
      o.verdict = 'instrument-invalid';
      o.reason = `${st.id} not reached by its route: ${st.evidence}`;
    }
    console.log(`  ${id}  ${o.verdict}  ${o.reason}`);
    return;
  }
  try {
    const res = await fn(o);
    const missing = nullKeys(res.refs);
    o.control.fired = missing.length === 0 && res.fired === true;
    if (missing.length > 0) {
      o.verdict = 'instrument-invalid';
      o.reason = `null reference(s) at comparison: ${missing.join(', ')}` + (res.nullCause ? `; ${res.nullCause}` : '');
    } else if (!o.control.fired) {
      o.verdict = 'instrument-invalid';
      o.reason = `control did not fire as predicted (${o.control.predicted}); observed: ${o.control.observed}`;
    } else {
      o.verdict = res.pass === true ? 'pass' : 'defect';
      o.reason = null;
    }
  } catch (err) {
    o.control.fired = false;
    o.verdict = 'instrument-invalid';
    o.reason = `error during measurement: ${short(err)}`;
  }
  console.log(`  ${id}  ${o.verdict}  fired=${o.control.fired}  ${o.reason ?? ''}`);
}

// ---------------------------------------------------------------- in-window

/** Installed after the last reload. Measurement helpers only; it changes
 *  nothing on the page. */
function installHelpers() {
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
  const describe = (el) => {
    if (el === null) return null;
    const t = el.getAttribute('data-testid');
    if (t) return `[data-testid="${t}"]`;
    const icon = el.getAttribute('data-icon');
    if (icon) return `span[data-icon="${icon}"]`;
    const label = el.getAttribute('aria-label');
    return label ? `${el.tagName.toLowerCase()}[aria-label="${label}"]` : el.tagName.toLowerCase();
  };
  /** Nearest ancestor-or-self whose computed background alpha is non-zero. */
  const bgOf = (el) => {
    for (let e = el; e !== null; e = e.parentElement) {
      const css = getComputedStyle(e).backgroundColor;
      const c = parseColor(css);
      if (c !== null && c.a > 0) return { css, color: c, owner: describe(e) };
    }
    return null;
  };
  const contrast = (el, prop) => {
    let fg = null;
    let bg = null;
    const fgCss = getComputedStyle(el).getPropertyValue(prop);
    fg = parseColor(fgCss);
    bg = bgOf(el);
    if (fg === null || bg === null) {
      return { fgCss, bgCss: bg?.css ?? null, bgOwner: bg?.owner ?? null, fgAlpha: fg?.a ?? null, ratio: null };
    }
    const eff = fg.a < 1 ? over(fg, bg.color) : fg;
    return { fgCss, bgCss: bg.css, bgOwner: bg.owner, fgAlpha: fg.a, ratio: ratio(eff, bg.color) };
  };
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
  /** The native-tooltip measurement: hit-test the box centre, then the
   *  nearest `[title]`. */
  const titleAtCentre = (el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const holder = hit === null ? null : hit.closest('[title]');
    return { hit: describe(hit), holder: describe(holder), title: holder === null ? null : holder.getAttribute('title') };
  };
  const frames = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
  const forkAlert = (prefix) =>
    [...document.querySelectorAll('[role="alert"]')].filter((e) => (e.textContent ?? '').startsWith(prefix));
  const dismissButtons = () => [...document.querySelectorAll('[aria-label="Dismiss fork error"]')];
  /** Line boxes of the alert's text node, merged by vertical extent (one
   *  line can yield several rects when runs split), and those containing `cy`. */
  const lineBoxes = (alert, cy, tol) => {
    let text = null;
    text = [...alert.childNodes].find((n) => n.nodeType === Node.TEXT_NODE) ?? null;
    if (text === null) return null;
    const range = document.createRange();
    range.selectNodeContents(text);
    const raw = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
    const lines = [];
    for (const r of raw) {
      const same = lines.find((l) => Math.abs(l.top - r.top) <= tol && Math.abs(l.bottom - r.bottom) <= tol);
      if (same) {
        same.left = Math.min(same.left, r.left);
        same.right = Math.max(same.right, r.right);
      } else {
        lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      }
    }
    lines.sort((a, b) => a.top - b.top);
    const containing = lines.map((l, i) => ({ ...l, i })).filter((l) => l.top <= cy && cy <= l.bottom);
    return { rawRectCount: raw.length, lines, containing };
  };
  const tabbableCount = () =>
    [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(
      (e) => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length > 0 && e.closest('[hidden],[inert]') === null,
    ).length;
  const activeDescription = () => describe(document.activeElement);
  window.__forkui = {
    parseColor, contrast, bgOf, rect, byTestId, titleAtCentre, frames, forkAlert, dismissButtons,
    lineBoxes, tabbableCount, activeDescription, describe,
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
    generatedAt: '',
    driverSha256: sha256File(driverPath),
    mainBundleSha256: sha256File(mainBundle),
    electron: '',
    playwright: String(requireHere('playwright/package.json').version),
    devicePixelRatio: null,
    viewport: { width: null, height: null },
    sandboxRoot: args.sandboxRoot,
    mainEnv: { USERPROFILE: null, userData: null, CLAUDE_CONFIG_DIR: null },
    realSettingsSha256: { before: sha256File(realSettings), after: 'absent' },
    exitCode: 2,
    sandboxRemoved: false,
    precondition: null,
  };

  // ------------------------------------------------------------ preconditions
  if (!existsSync(mainBundle)) {
    meta.precondition = `out/main/index.js absent at ${mainBundle}; run npm run build first`;
    for (const o of observations) o.reason = `precondition failed: ${meta.precondition}`;
    meta.realSettingsSha256.after = sha256File(realSettings);
    return finish(meta, 2);
  }

  const expected = {
    noSession: sourceLiteral('src/renderer/src/pods/fork-control.ts', /^export const FORK_REASON_NO_SESSION = '(.*)';$/),
    midTurn: sourceLiteral('src/renderer/src/pods/fork-control.ts', /^export const FORK_REASON_MID_TURN = '(.*)';$/),
    ancestryPrefix: sourceLiteral('src/renderer/src/pods/fork-control.ts', /`([^`$]*)\$\{parentTitle\}`/),
    alertPrefix: sourceLiteral('src/main/pod-manager/pod-manager.ts', /`(forkSession failed for pod )\$\{podId\}/),
  };
  console.log('expected texts:', JSON.stringify(expected));

  const sandbox = buildSandbox(args.sandboxRoot);
  const env = { ...sandbox.env };
  for (const k of Object.keys(env)) {
    const u = k.toUpperCase();
    if (u === 'CLAUDE_CONFIG_DIR' || u === 'CLAUDE_CODE_PROJECT_DIR_NAME') delete env[k];
  }
  const launchTarget = { ...sandbox, env };

  // The S3 fixture: one non-sidechain user record with a string uuid, which is
  // the minimum the SDK's forkSession copies.
  const U3 = randomUUID();
  const U4 = randomUUID();
  const fixtureDir = join(sandbox.roots.projects, encodeCwdForProjects(sandbox.plainRepo));
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(
    join(fixtureDir, `${U3}.jsonl`),
    JSON.stringify({
      type: 'user', uuid: randomUUID(), parentUuid: null, isSidechain: false, sessionId: U3,
      cwd: sandbox.plainRepo, timestamp: new Date().toISOString(),
      message: { role: 'user', content: 'fork-ui fixture: the minimum a fork copies' },
    }) + '\n',
    'utf8',
  );
  const jsonlCount = () => readdirSync(fixtureDir).filter((n) => n.endsWith('.jsonl')).length;

  let app = null;
  let win = null;
  try {
    ({ app, win } = await launch(launchTarget));
    meta.mainEnv = await app.evaluate(({ app: eapp }) => ({
      USERPROFILE: process.env.USERPROFILE ?? null,
      userData: eapp.getPath('userData'),
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? null,
    }));
    meta.electron = await app.evaluate(() => process.versions.electron);
    console.log('main env:', JSON.stringify(meta.mainEnv));

    await win.setViewportSize({ width: 1280, height: 860 }).catch(() => {});

    // ---------------------------------------------------------- the four Pods
    const titles = { P1: 'P1 no session', P2: 'P2 running', P3: 'P3 parent', P4: 'P4 failing' };
    const pods = {};
    for (const [key, title] of Object.entries(titles)) {
      const made = await win.evaluate(
        ({ title, cwd }) => window.orcastrate.pods.create({ title, cwd, permissionMode: 'default' }),
        { title, cwd: sandbox.plainRepo },
      );
      if (made?.ok !== true) throw new Error(`pods.create ${key} failed: ${JSON.stringify(made?.error ?? made)}`);
      pods[key] = made.value;
    }
    console.log('pods:', Object.entries(pods).map(([k, p]) => `${k}=${p.id}`).join(' '));

    // ---------------------------------------------------------- session-id write
    const rows = [{ id: pods.P3.id, sid: U3 }, { id: pods.P4.id, sid: U4 }];
    try {
      const r = await app.evaluate(
        async ({ app: eapp }, { mainPath, rows }) => {
          let req = null;
          const mod = typeof process.getBuiltinModule === 'function' ? process.getBuiltinModule('node:module') : null;
          if (mod !== null && mod !== undefined) req = mod.createRequire(mainPath);
          else if (process.mainModule) req = process.mainModule.require.bind(process.mainModule);
          if (req === null) throw new Error('no require obtainable in main');
          const path = req('node:path');
          const Database = req('better-sqlite3');
          const dbPath = path.join(eapp.getPath('userData'), 'orcastrate.db');
          const db = new Database(dbPath);
          try {
            const stmt = db.prepare('UPDATE pods SET cc_session_id = ? WHERE id = ?');
            return { dbPath, changes: rows.map((x) => stmt.run(x.sid, x.id).changes) };
          } finally {
            db.close();
          }
        },
        { mainPath: mainBundle, rows },
      );
      const ok = r.changes.every((c) => c === 1);
      writeRoutes.route1 = ok ? { ok: true, detail: `changes=${r.changes.join(',')} db=${r.dbPath}` }
        : { ok: false, error: `changes=${r.changes.join(',')} (expected 1 each)` };
    } catch (err) {
      writeRoutes.route1 = { ok: false, error: short(err) };
    }
    if (writeRoutes.route1.ok) {
      writeRoutes.used = 1;
    } else {
      // Route 2: close, write from a separate Electron-as-Node, relaunch.
      try {
        await app.close().catch(() => {});
        const electronPath = requireHere('electron');
        const dbPath = join(meta.mainEnv.userData, 'orcastrate.db');
        const script =
          `const r=require('module').createRequire(${JSON.stringify(mainBundle)});` +
          `const D=r('better-sqlite3');const db=new D(${JSON.stringify(dbPath)});` +
          `const s=db.prepare('UPDATE pods SET cc_session_id = ? WHERE id = ?');` +
          `const c=${JSON.stringify(rows)}.map(x=>s.run(x.sid,x.id).changes);db.close();` +
          `process.stdout.write(JSON.stringify(c));`;
        const res = spawnSync(electronPath, ['-e', script], {
          env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 60000,
        });
        const changes = res.status === 0 ? JSON.parse(res.stdout || '[]') : null;
        if (changes === null || !changes.every((c) => c === 1)) {
          writeRoutes.route2 = { ok: false, error: `status=${res.status} stdout=${res.stdout} stderr=${String(res.stderr).split('\n')[0]}` };
        } else {
          writeRoutes.route2 = { ok: true, detail: `changes=${changes.join(',')}` };
          writeRoutes.used = 2;
        }
        ({ app, win } = await launch(launchTarget));
        await win.setViewportSize({ width: 1280, height: 860 }).catch(() => {});
      } catch (err) {
        writeRoutes.route2 = { ok: false, error: short(err) };
      }
    }
    console.log('session-id write:', JSON.stringify(writeRoutes));

    // A created Pod reaches the bar after a reload, which re-lists.
    await win.reload();
    await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 30000 });
    await win.waitForFunction(
      (n) => document.querySelectorAll('[data-testid^="pod-tab:"]').length === n, 4, { timeout: 30000 },
    );
    await win.evaluate(installHelpers);

    const winFacts = await win.evaluate(() => ({ dpr: window.devicePixelRatio, w: window.innerWidth, h: window.innerHeight }));
    meta.devicePixelRatio = winFacts.dpr;
    meta.viewport = { width: winFacts.w, height: winFacts.h };
    const tol = 1 / winFacts.dpr;
    const park = { x: winFacts.w - 1, y: winFacts.h - 1 };
    const parkMouse = () => win.mouse.move(park.x, park.y);

    // S2: the running push is sent AFTER the last reload, because a reload
    // re-lists from the store and drops it.
    const sent = await app.evaluate(({ BrowserWindow }, payload) => {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) w.webContents.send('push:podStatus', payload);
      return wins.length;
    }, { podId: pods.P2.id, status: 'running' });
    await win.waitForSelector(`[data-testid="pod-tab-stop:${pods.P2.id}"]`, { timeout: 10000 }).catch(() => {});

    const attrs = await win.evaluate((ids) => {
      const out = {};
      for (const [k, id] of Object.entries(ids)) {
        const fork = document.querySelector(`[data-testid="pod-tab-fork:${id}"]`);
        const run = document.querySelector(`[data-testid="pod-tab-open:${id}"],[data-testid="pod-tab-stop:${id}"]`);
        out[k] = { eligibility: fork?.getAttribute('data-eligibility') ?? null, verb: run?.getAttribute('data-verb') ?? null };
      }
      return out;
    }, { P1: pods.P1.id, P2: pods.P2.id, P3: pods.P3.id, P4: pods.P4.id });
    console.log('attrs:', JSON.stringify(attrs));

    const s1 = stateById.get('S1');
    s1.route = 'pods.create, then reload; born closed with ccSessionId null';
    s1.reached = attrs.P1.eligibility === 'no-session';
    s1.evidence = `P1 ${pods.P1.id} fork data-eligibility=${attrs.P1.eligibility}`;

    const s2 = stateById.get('S2');
    s2.route = `pods.create, reload, then main webContents.send('push:podStatus', {podId, status:'running'}) to ${sent} window(s)`;
    s2.reached = attrs.P2.eligibility === 'mid-turn' && attrs.P2.verb === 'stop';
    s2.evidence = `P2 ${pods.P2.id} fork data-eligibility=${attrs.P2.eligibility}, run data-verb=${attrs.P2.verb}`;

    await parkMouse();
    await win.screenshot({ path: join(shotsDir, '01-s1-s2-bar.png') });

    const P = (key) => pods[key].id;
    const forkSel = (key) => `[data-testid="pod-tab-fork:${P(key)}"]`;

    // ---------------------------------------------------------- O1 glyph
    await observe('O1', async (o) => {
      let clip = null;
      let forkCap = null;
      let refCap = null;
      let transparentCap = null;
      let ctlCap = null;
      let restored = null;
      clip = await win.evaluate((id) => {
        const s = document.querySelector(`[data-testid="pod-tab-fork:${id}"] [data-icon="fork"]`);
        return s === null ? null : window.__forkui.rect(s);
      }, P('P1'));
      if (clip === null) return { refs: { clip }, pass: false, fired: false };
      const c = { x: clip.x, y: clip.y, width: clip.width, height: clip.height };
      const set = (mode) => win.evaluate(async ({ id, mode }) => {
        const s = document.querySelector(`[data-testid="pod-tab-fork:${id}"] [data-icon="fork"]`);
        if (s.__orig === undefined) s.__orig = s.firstChild.nodeValue;
        if (mode === 'restore') { s.firstChild.nodeValue = s.__orig; s.style.color = ''; }
        else if (mode === 'transparent') { s.firstChild.nodeValue = s.__orig; s.style.color = 'transparent'; }
        else { s.firstChild.nodeValue = mode; s.style.color = ''; }
        await window.__forkui.frames();
        return { text: s.textContent, styleColor: s.style.color };
      }, { id: P('P1'), mode });
      await parkMouse();
      await set('restore');
      forkCap = await win.screenshot({ clip: c, animations: 'disabled' });
      await set('\u0378');
      refCap = await win.screenshot({ clip: c, animations: 'disabled' });
      await set('transparent');
      transparentCap = await win.screenshot({ clip: c, animations: 'disabled' });
      await set('\u0379');
      ctlCap = await win.screenshot({ clip: c, animations: 'disabled' });
      restored = await set('restore');
      const restoredOk = restored.text === '\u2442' && restored.styleColor === '';
      for (const [n, b] of [['fork', forkCap], ['ref-u0378', refCap], ['transparent', transparentCap], ['control-u0379', ctlCap]]) {
        writeFileSync(join(shotsDir, `O1-${n}.png`), b);
      }
      const decide = (cap) => (!buffersEqual(cap, refCap) && !buffersEqual(cap, transparentCap) ? 'fork mark' : 'missing glyph');
      const instrumentOk = buffersEqual(ctlCap, refCap);
      o.measured = {
        clip: `${c.x.toFixed(2)},${c.y.toFixed(2)} ${c.width.toFixed(2)}x${c.height.toFixed(2)}`,
        forkDiffersFromU0378Reference: !buffersEqual(forkCap, refCap),
        forkDiffersFromTransparent: !buffersEqual(forkCap, transparentCap),
        decision: decide(forkCap),
        instrumentCheckU0379IdenticalToU0378: instrumentOk,
        captureBytes: `fork=${forkCap.length} ref=${refCap.length} transparent=${transparentCap.length} u0379=${ctlCap.length}`,
        undoVerified: restoredOk,
      };
      o.control.observed = `decision "${decide(ctlCap)}"; U+0379 byte-identical to U+0378 reference: ${instrumentOk}`;
      return {
        refs: { clip, forkCap, refCap, transparentCap, ctlCap, restored },
        pass: decide(forkCap) === 'fork mark',
        fired: decide(ctlCap) === 'missing glyph' && instrumentOk && restoredOk,
      };
    });

    // ---------------------------------------------------------- O2 glyph size
    await observe('O2', async (o) => {
      let m = null;
      let ctl = null;
      let undo = null;
      const measure = () => win.evaluate((id) => {
        const q = (sel) => document.querySelector(`[data-testid="${sel}:${id}"] [data-icon]`);
        const spans = { fork: q('pod-tab-fork'), play: q('pod-tab-open'), del: q('pod-tab-delete') };
        if (Object.values(spans).some((s) => s === null)) return null;
        const out = {};
        for (const [k, s] of Object.entries(spans)) {
          // Text-range height over the span's TEXT NODE (contract I4, O2 as
          // amended): the shared [data-icon] rule fixes the element box, so the
          // box cannot respond to the control and is recorded unscored.
          let text = null;
          text = [...s.childNodes].find((n) => n.nodeType === Node.TEXT_NODE) ?? null;
          if (text === null) return null;
          const range = document.createRange();
          range.selectNodeContents(text);
          out[k] = {
            fontSize: parseFloat(getComputedStyle(s).fontSize),
            height: s.getBoundingClientRect().height,
            textHeight: range.getBoundingClientRect().height,
            icon: s.getAttribute('data-icon'),
          };
        }
        return out;
      }, P('P1'));
      m = await measure();
      if (m === null) return { refs: { m }, pass: false, fired: false };
      const pairs = (x, key) => [x.play, x.del].filter((other) => Math.abs(x.fork[key] - other[key]) <= tol).length;
      await win.evaluate(({ id, px }) => {
        document.querySelector(`[data-testid="pod-tab-fork:${id}"] [data-icon="fork"]`).style.fontSize = `${px}px`;
      }, { id: P('P1'), px: m.fork.fontSize * 2 });
      await win.evaluate(() => window.__forkui.frames());
      ctl = await measure();
      await win.evaluate((id) => {
        document.querySelector(`[data-testid="pod-tab-fork:${id}"] [data-icon="fork"]`).style.fontSize = '';
      }, P('P1'));
      undo = await measure();
      const undoOk = undo !== null && undo.fork.fontSize === m.fork.fontSize &&
        Math.abs(undo.fork.textHeight - m.fork.textHeight) <= tol;
      o.measured = {
        devicePixelRatio: winFacts.dpr,
        tolerancePx: tol,
        forkFontSize: m.fork.fontSize, playFontSize: m.play.fontSize, deleteFontSize: m.del.fontSize,
        forkTextRangeHeight: m.fork.textHeight, playTextRangeHeight: m.play.textHeight, deleteTextRangeHeight: m.del.textHeight,
        fontSizePairsEqual: pairs(m, 'fontSize'),
        textRangeHeightPairsEqual: pairs(m, 'textHeight'),
        // Recorded, unscored (amended O2): the element box is fixed by the
        // shared [data-icon] rule.
        forkBoxHeight: m.fork.height, playBoxHeight: m.play.height, deleteBoxHeight: m.del.height,
        boxHeightPairsEqualUnscored: pairs(m, 'height'),
        undoVerified: undoOk,
      };
      o.control.observed = ctl === null ? 'spans not found under control'
        : `${pairs(ctl, 'textHeight')} of 2 text-range height pairs equal (fork text-range height ${ctl.fork.textHeight} ` +
          `at font-size ${ctl.fork.fontSize}px; font-size pairs equal ${pairs(ctl, 'fontSize')} of 2; ` +
          `box height pairs equal ${pairs(ctl, 'height')} of 2, unscored)`;
      return {
        refs: { m, ctl, undo },
        pass: pairs(m, 'fontSize') === 2 && pairs(m, 'textHeight') === 2,
        fired: ctl !== null && pairs(ctl, 'textHeight') === 0 && undoOk,
      };
    });

    // ---------------------------------------------------------- opacity, cursor, title
    const controlStyle = (key) => win.evaluate((id) => {
      const fork = document.querySelector(`[data-testid="pod-tab-fork:${id}"]`);
      const run = document.querySelector(`[data-testid="pod-tab-open:${id}"],[data-testid="pod-tab-stop:${id}"]`);
      if (fork === null || run === null) return null;
      return {
        forkOpacity: Number(getComputedStyle(fork).opacity),
        runOpacity: Number(getComputedStyle(run).opacity),
        cursor: getComputedStyle(fork).cursor,
        eligibility: fork.getAttribute('data-eligibility'),
      };
    }, P(key));
    const hoverTitle = async (selector) => {
      await win.hover(selector);
      const t = await win.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el === null ? null : window.__forkui.titleAtCentre(el);
      }, selector);
      await parkMouse();
      return t;
    };

    let p3Style = null;
    p3Style = await controlStyle('P3');
    let p3ForkTitle = null;
    p3ForkTitle = await hoverTitle(forkSel('P3'));

    const opacityObs = (id, key) => observe(id, async (o) => {
      let s = null;
      s = await controlStyle(key);
      o.measured = {
        pod: key, eligibility: s?.eligibility ?? null,
        forkOpacity: s?.forkOpacity ?? null, runOpacity: s?.runOpacity ?? null,
        controlP3Eligibility: p3Style?.eligibility ?? null,
      };
      o.control.observed = p3Style === null ? 'P3 controls not found'
        : `P3 fork opacity ${p3Style.forkOpacity}, run opacity ${p3Style.runOpacity}: ${p3Style.forkOpacity === p3Style.runOpacity ? 'equal, not dimmed' : 'differ'}`;
      return {
        refs: { s, p3Style },
        pass: s !== null && s.forkOpacity < s.runOpacity,
        fired: p3Style !== null && p3Style.eligibility === 'eligible' && p3Style.forkOpacity === p3Style.runOpacity,
      };
    });
    const cursorObs = (id, key) => observe(id, async (o) => {
      let s = null;
      s = await controlStyle(key);
      o.measured = { pod: key, cursor: s?.cursor ?? null, controlP3Cursor: p3Style?.cursor ?? null };
      o.control.observed = p3Style === null ? 'P3 controls not found' : `P3 cursor ${p3Style.cursor}`;
      return {
        refs: { s, p3Style },
        pass: s !== null && s.cursor === 'not-allowed',
        fired: p3Style !== null && p3Style.cursor === 'pointer',
      };
    });
    const titleObs = (id, key, exp) => observe(id, async (o) => {
      let t = null;
      t = await hoverTitle(forkSel(key));
      o.measured = {
        pod: key, hit: t?.hit ?? null, titleHolder: t?.holder ?? null, hoveredTitle: t?.title ?? null,
        expected: exp?.value ?? null, expectedSource: exp === null ? null : `src/renderer/src/pods/fork-control.ts:${exp.line}`,
        equal: t !== null && exp !== null && t.title === exp.value,
      };
      o.control.observed = p3ForkTitle === null ? 'P3 fork control not found'
        : `P3 hovered title ${p3ForkTitle.title === null ? 'null' : JSON.stringify(p3ForkTitle.title)} (hit ${p3ForkTitle.hit})`;
      return {
        refs: { t, exp, p3ForkTitle },
        pass: t.title === exp.value,
        fired: p3ForkTitle !== null && p3ForkTitle.title === null,
      };
    });

    await opacityObs('O3', 'P1');
    await cursorObs('O4', 'P1');
    await titleObs('O5', 'P1', expected.noSession);
    await opacityObs('O6', 'P2');
    await cursorObs('O7', 'P2');
    await titleObs('O8', 'P2', expected.midTurn);

    // ---------------------------------------------------------- S3 fork succeeds
    const s3 = stateById.get('S3');
    const s4 = stateById.get('S4');
    const routeText = writeRoutes.used === null ? 'session-id write failed by both routes'
      : `session-id write route ${writeRoutes.used}`;
    s3.route = `fixture ${U3}.jsonl in the sandbox projects dir; pods.create; ${routeText}; reload; click P3 Fork`;
    s4.route = `pods.create; cc_session_id ${U4} with no transcript; ${routeText}; reload; click P4 Fork`;
    const writeEvidence = `route1: ${JSON.stringify(writeRoutes.route1)}; route2: ${JSON.stringify(writeRoutes.route2)}`;
    let forkPod = null;
    if (writeRoutes.used === null || attrs.P3.eligibility !== 'eligible') {
      s3.evidence = `P3 eligibility ${attrs.P3.eligibility}; ${writeEvidence}`;
    } else {
      const before = jsonlCount();
      await win.click(forkSel('P3'));
      await win.waitForFunction(
        () => document.querySelectorAll('[data-testid^="pod-tab:"]').length === 5, undefined, { timeout: 30000 },
      ).catch(() => {});
      const listed = await win.evaluate(() => window.orcastrate.pods.list());
      const after = jsonlCount();
      const list = listed?.ok === true ? listed.value : [];
      forkPod = list.find((p) => p.forkedFromPodId === P('P3')) ?? null;
      s3.reached = forkPod !== null && forkPod.ccSessionId !== null && forkPod.ccSessionId !== U3 && after - before === 1;
      s3.evidence = `fork pod ${forkPod?.id ?? 'none'} forkedFromPodId=${forkPod?.forkedFromPodId ?? null} ` +
        `ccSessionId=${forkPod?.ccSessionId ?? null} (source ${U3}); fixture .jsonl count ${before} -> ${after}; ` +
        `no claude process involved; ${writeEvidence}`;
    }
    await parkMouse();
    await win.screenshot({ path: join(shotsDir, '02-s3-forked.png') });

    await observe('O9', async (o) => {
      let t = null;
      let ctl = null;
      let exp = null;
      t = await hoverTitle(`[data-testid="pod-tab:${forkPod.id}"]`);
      ctl = await hoverTitle(`[data-testid="pod-tab:${P('P3')}"]`);
      if (expected.ancestryPrefix !== null) exp = `${expected.ancestryPrefix.value}${pods.P3.title}`;
      o.measured = {
        forkTabTestId: `pod-tab:${forkPod.id}`, hit: t?.hit ?? null, hoveredTitle: t?.title ?? null,
        parentTitle: pods.P3.title, expected: exp,
        expectedSource: expected.ancestryPrefix === null ? null : `src/renderer/src/pods/fork-control.ts:${expected.ancestryPrefix.line}`,
      };
      o.control.observed = ctl === null ? "P3's tab not found"
        : `P3's own tab hovered title ${ctl.title === null ? 'null' : JSON.stringify(ctl.title)}`;
      return { refs: { t, ctl, exp }, pass: t.title === exp, fired: ctl.title === null };
    });

    // ---------------------------------------------------------- S4 fork fails
    const prefix = expected.alertPrefix?.value ?? null;
    if (writeRoutes.used === null || attrs.P4.eligibility !== 'eligible' || prefix === null) {
      s4.evidence = `P4 eligibility ${attrs.P4.eligibility}; alert prefix ${prefix}; ${writeEvidence}`;
    } else {
      const before = await win.evaluate(() => window.orcastrate.pods.list());
      await win.click(forkSel('P4'));
      const shown = await win.waitForFunction(
        (p) => window.__forkui.forkAlert(p).length === 1, prefix, { timeout: 30000 },
      ).then(() => true).catch(() => false);
      const after = await win.evaluate(() => window.orcastrate.pods.list());
      const alertText = await win.evaluate((p) => window.__forkui.forkAlert(p)[0]?.textContent ?? null, prefix);
      const nb = before?.ok === true ? before.value.length : null;
      const na = after?.ok === true ? after.value.length : null;
      s4.reached = shown && alertText !== null && nb !== null && nb === na;
      s4.evidence = `alert shown=${shown}; text starts with "${prefix}": ${alertText?.startsWith(prefix) ?? false}; ` +
        `pods.list length ${nb} -> ${na}; alert text: ${alertText}; ${writeEvidence}`;
    }
    await parkMouse();
    await win.screenshot({ path: join(shotsDir, '03-s4-fork-error.png') });

    // ---------------------------------------------------------- O10, O11 layout
    const layout = () => win.evaluate(({ p, tol }) => {
      const alert = window.__forkui.forkAlert(p)[0] ?? null;
      const btn = window.__forkui.dismissButtons()[0] ?? null;
      if (alert === null || btn === null) return null;
      const b = window.__forkui.rect(btn);
      const cy = b.top + b.height / 2;
      const lb = window.__forkui.lineBoxes(alert, cy, tol);
      return lb === null ? null : { button: b, cy, ...lb };
    }, { p: prefix, tol });

    let base = null;
    await observe('O10', async (o) => {
      let ctl = null;
      let undo = null;
      base = await layout();
      await win.evaluate(() => {
        window.__forkui.dismissButtons()[0].parentElement.style.flexDirection = 'column';
      });
      await win.evaluate(() => window.__forkui.frames());
      ctl = await layout();
      await win.evaluate(() => {
        window.__forkui.dismissButtons()[0].parentElement.style.flexDirection = '';
      });
      await win.evaluate(() => window.__forkui.frames());
      undo = await layout();
      const undoOk = undo !== null && base !== null && undo.containing.length === base.containing.length &&
        Math.abs(undo.cy - base.cy) <= tol;
      const line = base?.containing[0] ?? null;
      o.measured = {
        lineBoxCount: base?.lines.length ?? null,
        rawRectCount: base?.rawRectCount ?? null,
        lineBoxesContainingButtonCentre: base?.containing.length ?? null,
        lineBoxExtentsY: base === null ? null : base.lines.map((l) => `${l.top.toFixed(2)}-${l.bottom.toFixed(2)}`).join('; '),
        buttonExtentY: base === null ? null : `${base.button.top.toFixed(2)}-${base.button.bottom.toFixed(2)}`,
        buttonCentreY: base?.cy ?? null,
        // Recorded, not scored: how close the centre is to a line edge, and the
        // count if containment were widened by one device pixel. The verdict
        // above uses the contract's containment as written.
        nearestLineEdgeDistance: base === null || base.lines.length === 0 ? null
          : Math.min(...base.lines.flatMap((l) => [Math.abs(base.cy - l.top), Math.abs(base.cy - l.bottom)])),
        lineBoxesContainingCentreWithinOneDevicePixel: base === null ? null
          : base.lines.filter((l) => l.top - tol <= base.cy && base.cy <= l.bottom + tol).length,
        buttonRightOfLineRightEdge: line === null ? null : base.button.left >= line.right - tol,
        undoVerified: undoOk,
      };
      o.control.observed = ctl === null ? 'alert or button not found under control'
        : `${ctl.containing.length} line boxes contain the centre`;
      return {
        refs: { base, ctl, undo },
        pass: base.containing.length >= 1,
        fired: ctl.containing.length === 0 && undoOk,
      };
    });

    await observe('O11', async (o) => {
      let line = null;
      let ctl = null;
      let ctlLine = null;
      let undo = null;
      let diff = null;
      let h = null;
      let ctlDiff = null;
      line = base?.containing[0] ?? null;
      if (line !== null) diff = Math.abs(base.cy - (line.top + line.bottom) / 2);
      h = base?.button.height ?? null;
      if (h !== null) {
        await win.evaluate((px) => { window.__forkui.dismissButtons()[0].style.marginTop = `${px}px`; }, h);
        await win.evaluate(() => window.__forkui.frames());
        ctl = await layout();
        await win.evaluate(() => { window.__forkui.dismissButtons()[0].style.marginTop = ''; });
        await win.evaluate(() => window.__forkui.frames());
        undo = await layout();
      }
      ctlLine = line === null || ctl === null ? null : (ctl.lines[line.i] ?? null);
      if (ctlLine !== null) ctlDiff = Math.abs(ctl.cy - (ctlLine.top + ctlLine.bottom) / 2);
      const undoOk = undo !== null && Math.abs(undo.cy - base.cy) <= tol;
      o.measured = {
        centreYDifference: diff, tolerancePx: tol, devicePixelRatio: winFacts.dpr,
        buttonHeight: h, containingLineIndex: line?.i ?? null, lineBoxCount: base?.lines.length ?? null,
        // Recorded, not scored: the distance to the nearest line box's centre,
        // for the case where no line contains the button centre.
        nearestLineCentreYDifference: base === null || base.lines.length === 0 ? null
          : Math.min(...base.lines.map((l) => Math.abs(base.cy - (l.top + l.bottom) / 2))),
        undoVerified: undoOk,
      };
      o.control.observed = ctlDiff === null ? 'not measurable under control'
        : `difference ${ctlDiff.toFixed(3)}; half button height ${(h / 2).toFixed(3)}; |difference - half| ${Math.abs(ctlDiff - h / 2).toFixed(3)} vs tolerance ${tol.toFixed(3)}`;
      return {
        nullCause: line === null
          ? 'the containing line box comes from O10, and no line box of the alert text contains the button centre, so there is no line to centre on'
          : null,
        refs: { line, diff, h, ctl, ctlLine, ctlDiff, undo },
        pass: diff <= tol,
        fired: Math.abs(ctlDiff - h / 2) <= tol && ctlDiff > tol && undoOk,
      };
    });

    // ---------------------------------------------------------- O12, O13 contrast
    let darkColours = null;
    const contrastObs = (id, scheme) => observe(id, async (o) => {
      let m = null;
      let ctl = null;
      let undo = null;
      await win.emulateMedia({ colorScheme: scheme });
      await parkMouse();
      await win.evaluate(() => window.__forkui.frames());
      const read = () => win.evaluate(() => {
        const btn = window.__forkui.dismissButtons()[0] ?? null;
        return btn === null ? null : window.__forkui.contrast(btn, 'color');
      });
      m = await read();
      if (m !== null && m.bgCss !== null) {
        await win.evaluate((bg) => { window.__forkui.dismissButtons()[0].style.color = bg; }, m.bgCss);
        await win.evaluate(() => window.__forkui.frames());
        ctl = await read();
        await win.evaluate(() => { window.__forkui.dismissButtons()[0].style.color = ''; });
        await win.evaluate(() => window.__forkui.frames());
        undo = await read();
      }
      const undoOk = undo !== null && m !== null && undo.fgCss === m.fgCss;
      o.measured = {
        colorScheme: scheme, foreground: m?.fgCss ?? null, foregroundAlpha: m?.fgAlpha ?? null,
        background: m?.bgCss ?? null, backgroundOwner: m?.bgOwner ?? null,
        contrastRatio: m?.ratio === null || m === null ? null : Number(m.ratio.toFixed(3)), threshold: 4.5,
        undoVerified: undoOk,
      };
      if (scheme === 'dark') darkColours = m === null ? null : { fg: m.fgCss, bg: m.bgCss };
      else {
        o.measured.identicalToDarkForeground = darkColours === null || m === null ? null : darkColours.fg === m.fgCss;
        o.measured.identicalToDarkBackground = darkColours === null || m === null ? null : darkColours.bg === m.bgCss;
      }
      o.control.observed = ctl === null || ctl.ratio === null ? 'not measurable under control' : `ratio ${ctl.ratio.toFixed(2)}`;
      return {
        refs: { m, ratio: m?.ratio ?? null, ctl, ctlRatio: ctl?.ratio ?? null, undo },
        pass: m.ratio >= 4.5,
        fired: ctl.ratio.toFixed(2) === '1.00' && undoOk,
      };
    });
    await contrastObs('O12', 'dark');
    await contrastObs('O13', 'light');
    await win.emulateMedia({ colorScheme: null }).catch(() => {});

    // ---------------------------------------------------------- O14 focus ring
    const focusRing = (target) => win.evaluate((target) => {
      const el = target === 'dismiss' ? (window.__forkui.dismissButtons()[0] ?? null)
        : document.querySelector('[data-testid="pods-chrome"]');
      if (el === null) return null;
      const cs = getComputedStyle(el);
      const c = window.__forkui.contrast(el, 'outline-color');
      return {
        active: window.__forkui.activeDescription(),
        isActive: document.activeElement === el,
        focusVisible: el.matches(':focus-visible'),
        outlineStyle: cs.outlineStyle,
        outlineWidth: parseFloat(cs.outlineWidth),
        outlineOffset: parseFloat(cs.outlineOffset),
        outlineColor: c.fgCss, background: c.bgCss, backgroundOwner: c.bgOwner, ratio: c.ratio,
        rect: window.__forkui.rect(el),
      };
    }, target);

    const tabTo = async (description) => {
      let bound = null;
      bound = await win.evaluate(() => window.__forkui.tabbableCount());
      let presses = 0;
      let reached = false;
      for (; presses < bound && !reached;) {
        await win.keyboard.press('Tab');
        presses += 1;
        reached = (await win.evaluate(() => window.__forkui.activeDescription())) === description;
      }
      return { bound, presses, reached };
    };
    const DISMISS = 'button[aria-label="Dismiss fork error"]';

    await observe('O14', async (o) => {
      let tab = null;
      let m = null;
      let clip = null;
      let capA = null;
      let capB = null;
      let capB2 = null;
      let ctl = null;
      let undo = null;
      await parkMouse();
      tab = await tabTo(DISMISS);
      m = await focusRing('dismiss');
      if (m !== null) {
        const pad = m.outlineWidth + Math.abs(m.outlineOffset) + m.outlineWidth;
        clip = {
          x: Math.max(0, m.rect.left - pad), y: Math.max(0, m.rect.top - pad),
          width: m.rect.width + 2 * pad, height: m.rect.height + 2 * pad,
        };
        capA = await win.screenshot({ clip, animations: 'disabled' });
        await win.evaluate(() => {
          const s = document.createElement('style');
          s.id = 'forkui-o14-control';
          s.textContent = '[aria-label="Dismiss fork error"]{outline:none !important}';
          document.head.appendChild(s);
        });
        await win.evaluate(() => window.__forkui.frames());
        ctl = await focusRing('dismiss');
        capB = await win.screenshot({ clip, animations: 'disabled' });
        capB2 = await win.screenshot({ clip, animations: 'disabled' });
        await win.evaluate(() => document.getElementById('forkui-o14-control')?.remove());
        await win.evaluate(() => window.__forkui.frames());
        undo = await focusRing('dismiss');
        writeFileSync(join(shotsDir, 'O14-ring.png'), capA);
        writeFileSync(join(shotsDir, 'O14-control-outline-none.png'), capB);
      }
      const styleGone = await win.evaluate(() => document.getElementById('forkui-o14-control') === null);
      const undoOk = undo !== null && styleGone && undo.outlineStyle === m.outlineStyle && undo.isActive === true;
      const painted = capA !== null && capB !== null ? !buffersEqual(capA, capB) : null;
      o.measured = {
        tabPresses: tab.presses, tabBound: tab.bound, reachedByTab: tab.reached,
        active: m?.active ?? null, focusVisible: m?.focusVisible ?? null,
        outlineStyle: m?.outlineStyle ?? null, outlineWidth: m?.outlineWidth ?? null,
        outlineColor: m?.outlineColor ?? null, background: m?.background ?? null, backgroundOwner: m?.backgroundOwner ?? null,
        outlineContrast: m?.ratio === null || m === null ? null : Number(m.ratio.toFixed(3)), threshold: 3.0,
        paintedClipDiffersFromControl: painted,
        undoVerified: undoOk,
      };
      o.control.observed = ctl === null ? 'not measurable under control'
        : `outline-style ${ctl.outlineStyle}; control capture repeated byte-identical: ${buffersEqual(capB, capB2)}`;
      return {
        refs: { tab, m, clip, capA, capB, capB2, ctl, undo, ratio: m?.ratio ?? null },
        pass: tab.reached && m.isActive && m.focusVisible && m.outlineStyle !== 'none' && m.outlineWidth > 0 &&
          m.ratio >= 3.0 && painted === true,
        fired: ctl.outlineStyle === 'none' && buffersEqual(capB, capB2) && undoOk,
      };
    });

    // ---------------------------------------------------------- O15, O16 keyboard close
    const counts = () => win.evaluate((p) => ({
      alerts: window.__forkui.forkAlert(p).length,
      buttons: window.__forkui.dismissButtons().length,
    }), prefix);
    const waitGone = (ms) => win.waitForFunction(
      (p) => window.__forkui.forkAlert(p).length === 0, prefix, { timeout: ms },
    ).then(() => true).catch(() => false);

    let afterEnter = null;
    await observe('O15', async (o) => {
      let focused = null;
      focused = await win.evaluate(() => window.__forkui.activeDescription());
      await win.keyboard.press('Enter');
      await waitGone(5000);
      afterEnter = await counts();
      o.measured = { focusedBeforeEnter: focused, alertCountAfterEnter: afterEnter.alerts, buttonCountAfterEnter: afterEnter.buttons };
      return { refs: { focused, afterEnter, ctl: 'pending' }, pass: afterEnter.alerts === 0 && afterEnter.buttons === 0, fired: true };
    });
    let chromeAfterEnter = null;
    await observe('O16', async (o) => {
      chromeAfterEnter = await focusRing('chrome');
      const m = chromeAfterEnter;
      o.measured = {
        activeElement: m?.active ?? null, focusVisible: m?.focusVisible ?? null,
        outlineStyle: m?.outlineStyle ?? null, outlineWidth: m?.outlineWidth ?? null,
        outlineColor: m?.outlineColor ?? null, background: m?.background ?? null, backgroundOwner: m?.backgroundOwner ?? null,
        outlineContrast: m?.ratio === null || m === null ? null : Number(m.ratio.toFixed(3)), threshold: 3.0,
      };
      return {
        refs: { m, ratio: m?.ratio ?? null, ctl: 'pending' },
        pass: m.isActive && m.active === '[data-testid="pods-chrome"]' && m.focusVisible && m.outlineStyle !== 'none' &&
          m.outlineWidth > 0 && m.ratio >= 3.0,
        fired: true,
      };
    });

    // The two controls need further failed forks, so they run after both
    // measurements and then re-apply the verdict rule to O15 and O16.
    const refork = async () => {
      await win.evaluate((p) => { for (const a of window.__forkui.forkAlert(p)) a.__forkuiOld = true; }, prefix);
      await win.click(forkSel('P4'));
      return win.waitForFunction(
        (p) => window.__forkui.forkAlert(p).some((a) => a.__forkuiOld !== true), prefix, { timeout: 30000 },
      ).then(() => true).catch(() => false);
    };

    const o15 = obsById.get('O15');
    if (stateById.get('S4').reached && o15.reason === null) {
      try {
        let ctl = null;
        const shown = await refork();
        const tab = await tabTo(DISMISS);
        await win.keyboard.press('Shift');
        const gone = await waitGone(2000);
        ctl = await counts();
        o15.control.observed = `second failed fork shown=${shown}; Tab presses ${tab.presses}, reached=${tab.reached}; ` +
          `after Shift alert count ${ctl.alerts} (dismissed=${gone})`;
        o15.control.fired = shown && tab.reached && ctl.alerts === 1;
      } catch (err) {
        o15.control.observed = `error: ${short(err)}`;
        o15.control.fired = false;
      }
    } else {
      o15.control.observed = o15.control.observed || 'not run';
      o15.control.fired = false;
    }
    const o16 = obsById.get('O16');
    if (stateById.get('S4').reached && o16.reason === null) {
      try {
        let ctl = null;
        const shown = await refork();
        await win.click(DISMISS);
        await waitGone(5000);
        ctl = await focusRing('chrome');
        o16.control.observed = `further failed fork shown=${shown}; after mouse dismiss active ${ctl?.active ?? null}, ` +
          `:focus-visible ${ctl?.focusVisible ?? null}`;
        o16.control.fired = shown && ctl !== null && ctl.isActive === true && ctl.focusVisible === false;
      } catch (err) {
        o16.control.observed = `error: ${short(err)}`;
        o16.control.fired = false;
      }
    } else {
      o16.control.observed = o16.control.observed || 'not run';
      o16.control.fired = false;
    }
    for (const o of [o15, o16]) {
      if (o.reason !== null) continue;
      if (!o.control.fired) {
        o.reason = `control did not fire as predicted (${o.control.predicted}); observed: ${o.control.observed}`;
        o.verdict = 'instrument-invalid';
      }
      console.log(`  ${o.id}  ${o.verdict}  fired=${o.control.fired}  ${o.reason ?? ''}`);
    }
    await parkMouse();
    await win.screenshot({ path: join(shotsDir, '04-after-dismiss.png') });
  } catch (err) {
    console.error('run error:', err);
    for (const o of observations) {
      if (o.reason === 'not attempted') {
        o.verdict = 'instrument-invalid';
        o.reason = `run aborted before this observation: ${short(err)}`;
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

  const verdicts = observations.map((o) => o.verdict);
  let code = 0;
  if (verdicts.some((v) => v === 'not-run' || v === 'instrument-invalid')) code = 2;
  else if (verdicts.some((v) => v === 'defect')) code = 1;
  else if (!observations.every((o) => o.control.fired)) code = 2;
  return finish(meta, code);
}

// ---------------------------------------------------------------- reports

/** A markdown cell. A raw `|` would split the row, so such a value is left to
 *  the JSON. */
function cell(v) {
  const s = v === null || v === undefined ? 'null' : String(v).replace(/\r?\n/g, ' ');
  return s.includes('|') ? 'see JSON' : s;
}

function finish(meta, code) {
  meta.exitCode = code;
  meta.generatedAt = new Date().toISOString();
  const report = { meta, states, observations };
  writeFileSync(join(H, `driven-report-${SLUG}.json`), JSON.stringify(report, null, 2) + '\n', 'utf8');

  const md = [];
  md.push(`# Driven hand-run: fork UI (${SLUG})`, '');
  md.push(`Generated ${meta.generatedAt}. Exit code ${code}.`, '');
  md.push(`- Electron ${meta.electron}, Playwright ${meta.playwright}`);
  md.push(`- devicePixelRatio ${meta.devicePixelRatio}, viewport ${meta.viewport.width}x${meta.viewport.height}`);
  md.push(`- driver sha256 \`${meta.driverSha256}\``);
  md.push(`- out/main/index.js sha256 \`${meta.mainBundleSha256}\``);
  md.push(`- sandbox ${cell(meta.sandboxRoot)}, removed after the run: ${meta.sandboxRemoved}`);
  md.push(`- main env: USERPROFILE ${cell(meta.mainEnv.USERPROFILE)}, userData ${cell(meta.mainEnv.userData)}, CLAUDE_CONFIG_DIR ${cell(meta.mainEnv.CLAUDE_CONFIG_DIR)}`);
  md.push(`- real settings.json sha256 before ${meta.realSettingsSha256.before}, after ${meta.realSettingsSha256.after}`);
  if (meta.precondition) md.push(`- precondition failed: ${cell(meta.precondition)}`);
  md.push('');
  md.push('## States', '', '| State | Reached | Route | Evidence |', '|---|---|---|---|');
  for (const s of states) md.push(`| ${s.id} | ${s.reached} | ${cell(s.route)} | ${cell(s.evidence)} |`);
  md.push('');
  md.push('## Observations', '');
  md.push('| Obs | Row | Verdict | Fired | Measured | Control | Predicted | Observed | Reason |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const o of observations) {
    const measured = Object.entries(o.measured).map(([k, v]) => `${k}=${v}`).join('; ');
    md.push(`| ${o.id} | ${o.backlogRow} | ${o.verdict} | ${o.control.fired} | ${cell(measured)} | ${cell(o.control.injection)} | ` +
      `${cell(o.control.predicted)} | ${cell(o.control.observed)} | ${cell(o.reason)} |`);
  }
  md.push('');
  writeFileSync(join(H, `driven-report-${SLUG}.md`), md.join('\n'), 'utf8');

  console.log(`\n==== FORK UI RUN (${SLUG}): exit ${code} ====`);
  for (const o of observations) console.log(`  ${o.id} ${o.verdict}${o.reason ? ' - ' + o.reason : ''}`);
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('FATAL', e);
    process.exit(2);
  });
