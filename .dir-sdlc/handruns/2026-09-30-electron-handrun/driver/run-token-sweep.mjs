/**
 * TOKEN SWEEP verification run — the 36 border widths and 3 `letter-spacing`
 * values this session tokenised, driven in the real Electron window.
 *
 * WHY THIS EXISTS: a call site is not a pixel. The five preceding commits
 * converted 36 border declarations and 3 tracking declarations and added three
 * repo-wide censuses. All of that is asserted by grep, by census predicate and
 * by a green suite — and none of it had been seen. The previous session (C3)
 * confirmed its own work the same way and recorded the honest limit that only
 * 3 of its 10 converted sites were ever on screen. `.railHeading` was not one
 * of them, and `.railHeading` is the element this session deliberately changed:
 * its tracking tightens from `0.06em` to `var(--oc-tracking-wide)` (0.04em),
 * the session's one authorised visible change.
 *
 * Three things here cannot be done in the vitest suite, and they are the point:
 *
 *   1. DOES `.railHeading` ACTUALLY RENDER TIGHTER? jsdom computes no styles,
 *      so `letter-spacing: var(--oc-tracking-wide)` and `0.06em` are
 *      indistinguishable to every unit test in the repo. Here the value is
 *      MEASURED in the running window, and measured against the element's own
 *      computed `font-size` rather than a hardcoded pixel value — at
 *      `--oc-text-xs: 11px` both candidate values are sub-pixel (0.44px vs
 *      0.66px), so a hardcoded expectation would be the wrong instrument.
 *   2. DOES THE BORDER TOKEN RESOLVE? This is the failure a passing suite
 *      cannot see. `border: var(--oc-border-hairline) solid …` with a token
 *      that fails to resolve is invalid at computed-value time, and the
 *      element silently renders a DIFFERENT width. Only the engine knows.
 *   3. WHICH CONVERTED SITES ARE REACHABLE AT ALL? Recorded per stylesheet,
 *      with the unreachable ones named and the reason given. That limit is the
 *      most useful thing this document carries, exactly as C3's "3 of 10" is
 *      what scoped this run.
 *
 * ATTRIBUTION BY FILE HASH, NOT BY CLASS NAME. CSS Modules emits
 * `_<name>_<filehash>_<line>` in a production build. The class NAME alone is
 * ambiguous — `dialog`, `error` and `button` each exist in both pod dialogs,
 * and `pane` exists in both `WorkspaceLayout` and `Transcript` — so a sweep
 * keyed on the name would misattribute measurements between stylesheets. Each
 * stylesheet's hash is resolved at run time from a SIGNATURE of several
 * classes that co-occur only in that file, and the run FAILS LOUDLY if a
 * signature is missing or ambiguous rather than quietly measuring the wrong
 * file. A single-class anchor is not enough: the first pass of this run used
 * `.empty` for `EmptyWorkspace`, which also exists in `Helm.module.css`, and
 * the resulting ambiguity dropped that whole stylesheet from the sweep — so
 * the `New Pod` button was reported "not reached" while it was plainly on
 * screen in the very screenshot the same step had just taken.
 *
 * BORDER WIDTHS ARE MEASURED RELATIVELY, NOT AGAINST A HARDCODED `1px`. On a
 * fractionally-scaled display Chromium snaps used border widths to whole
 * DEVICE pixels, so a declaration of `1px` computes `0.8px` on a 125% display.
 * That is the engine's pixel grid, not a token failure: a synthetic element
 * with a literal `border-width: 1px` measures exactly the same `0.8px` in the
 * same window. Hardcoding `1px` would therefore be the wrong instrument, in
 * precisely the way criterion 4 already warns about for tracking — so every
 * border check below compares the converted element against a literal-`1px`
 * REFERENCE measured live in the same window, and the pixel ladder is recorded
 * at TS-1 so the number is explained rather than asserted.
 *
 * A RESOLVED VALUE IS NOT A RENDERED ONE. `getComputedStyle` answers for a
 * `display:none` element too, so every hit records its layout rect and only
 * hits with a real rect are counted as measured. Claiming a site that was
 * never on screen is the precise defect this run exists to avoid.
 *
 * Run `npm run build` in THIS worktree first; this launches
 * `<repoRoot>/out/main/index.js`, and `repoRoot` resolves relative to this
 * file — so a copy of this driver run from another checkout would launch that
 * checkout's build and confirm nothing. Step TS-0 proves which build is live.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  launch,
  step,
  check,
  note,
  stepError,
  results,
  repoRoot,
  shotsDir,
} from './lib.mjs';
import { buildSandbox, writeSettings, BASELINE_SETTINGS } from './sandbox.mjs';

/** A root of its own, so this run neither races nor clobbers C3's sandbox. */
const SANDBOX_ROOT = 'C:\\oc-sandbox-token-sweep';

const SHOT_DIR = join(shotsDir, 'token-sweep');
const REPORT_DIR = join(shotsDir, '..');

/** Screenshots land under `screenshots/token-sweep/`. `lib.mjs`'s `shot()`
 *  writes to the shared screenshots root and `writeReport()` hardcodes
 *  `driven-report.*`, which belong to earlier runs — this run owns neither, so
 *  it writes its own and leaves both alone. */
async function shot(win, name) {
  const file = join(SHOT_DIR, `${name}.png`);
  await win.screenshot({ path: file, fullPage: true }).catch(() => {});
  const rel = `screenshots/token-sweep/${name}.png`;
  const cur = results[results.length - 1];
  if (cur) cur.shots.push(rel);
  return rel;
}

// ---------------------------------------------------------------------------
// The converted population, transcribed from the five conversion commits.
// ---------------------------------------------------------------------------

/**
 * `signature` is a set of classes that co-occur only in that stylesheet, used
 * to resolve its CSS Modules file hash in the built bundle. `borders` maps a
 * converted class to
 * the SIDES its declaration actually sets — a longhand like
 * `border-right: var(--oc-border-hairline) …` leaves the other three sides at
 * 0, so checking all four would manufacture a failure. `tracking` lists the
 * converted `letter-spacing` classes.
 */
const ALL = ['top', 'right', 'bottom', 'left'];
const CONVERTED = {
  'lanes/LaneRail.module.css': {
    signature: ['railHeading', 'rail', 'finishedToggle'],
    borders: {
      rail: ['right'],
      inlineNote: ALL,
      errorState: ALL,
      row: ['bottom'],
      dot: ALL,
      rowAction: ALL,
      finishedToggle: ALL,
    },
    tracking: ['railHeading'],
  },
  'pods/DeletePodDialog.module.css': {
    signature: ['session', 'dialog', 'buttonDanger'],
    borders: { dialog: ALL, error: ALL, button: ALL },
    tracking: [],
  },
  'pods/NewPodDialog.module.css': {
    signature: ['cwdDisplay', 'bypass', 'bypassWarning'],
    borders: {
      dialog: ALL,
      input: ALL,
      cwdDisplay: ALL,
      mode: ALL,
      bypass: ALL,
      error: ALL,
      button: ALL,
    },
    tracking: [],
  },
  'pods/PodBar.module.css': {
    signature: ['bypassBadge', 'newPod', 'runControl'],
    borders: { statusDot: ALL, bypassBadge: ALL, runControl: ALL, newPod: ALL },
    tracking: ['bypassBadge'],
  },
  'shell/EmptyWorkspace.module.css': {
    // `.empty` ALONE is ambiguous — `Helm.module.css` has one too. All four.
    signature: ['empty', 'heading', 'body', 'action'],
    borders: { action: ALL },
    tracking: [],
  },
  'shell/WorkspaceLayout.module.css': {
    signature: ['podBarRegion', 'laneRailRegion', 'composerRegion'],
    borders: {
      podBarRegion: ['bottom'],
      panelBarRegion: ['bottom'],
      laneRailRegion: ['right'],
      splitPane: ['left'],
      composerRegion: ['top'],
    },
    tracking: [],
  },
  'transcript/Transcript.module.css': {
    signature: ['dispatchCard', 'dispatchAgent', 'paneHeader'],
    borders: {
      pane: ['left'],
      paneHeader: ['bottom'],
      unpin: ALL,
      paneError: ALL,
      event: ALL,
      eventCode: ALL,
      disclosure: ALL,
      loadMore: ALL,
      dispatchCard: ALL,
      dispatchAgent: ALL,
    },
    tracking: ['eventLabel'],
  },
};

/**
 * NOT converted by this session — already tokenised at the session base.
 *
 * The map above enumerates 40 sites across the 7 stylesheets, but this session
 * converted 39 of them (36 border declarations + 3 tracking). The difference is
 * this one: `.panelBarRegion` already named `var(--oc-border-hairline)` at
 * `af12edc`. Counted:
 *   `git show af12edc:src/renderer/src/shell/WorkspaceLayout.module.css |
 *    grep -c 'var(--oc-border-hairline)'` -> 1, against 5 at `9a09c1b`.
 * It is still measured and reported — it just is not this session's work, and
 * saying so is what keeps the 36 in the frozen contract and the 40 here from
 * silently disagreeing.
 */
const PRE_EXISTING = new Set(['shell/WorkspaceLayout.module.css:panelBarRegion']);

/** Why a site may be out of reach, written down before the run rather than
 *  after it, so an unreachable site is a recorded limit and not a surprise. */
const REACH_NOTES = {
  'transcript/Transcript.module.css:eventLabel':
    'needs a real transcript event, which needs a live `claude` process',
  'transcript/Transcript.module.css:event':
    'needs a user-role transcript event, which needs a live `claude` process',
  'transcript/Transcript.module.css:eventCode':
    'needs a tool-result event carrying code',
  'transcript/Transcript.module.css:disclosure':
    'needs compact tool activity in the stream',
  'transcript/Transcript.module.css:loadMore':
    'needs more events than one transcript page',
  'transcript/Transcript.module.css:dispatchCard':
    'needs a dispatch event from a live agent',
  'transcript/Transcript.module.css:dispatchAgent':
    'needs a dispatch event from a live agent',
  'transcript/Transcript.module.css:unpin':
    'needs a SPLIT pane, i.e. a pinned follower lane',
  'transcript/Transcript.module.css:paneError':
    'needs the transcript to fail to load',
  'lanes/LaneRail.module.css:row':
    'needs at least one lane, which needs a live `claude` process',
  'lanes/LaneRail.module.css:dot':
    'needs a lane row to carry a status dot',
  'lanes/LaneRail.module.css:rowAction':
    'needs a lane row with a Steer action',
  'lanes/LaneRail.module.css:finishedToggle':
    'needs at least one FINISHED lane',
  'lanes/LaneRail.module.css:inlineNote':
    "needs routingMode === 'inline'",
  'lanes/LaneRail.module.css:errorState':
    'needs the rail to fail to load',
  'shell/WorkspaceLayout.module.css:splitPane':
    'needs a split view, i.e. a pinned follower lane',
  'pods/NewPodDialog.module.css:error':
    'needs a rejected submission',
  'pods/DeletePodDialog.module.css:error':
    'needs a failing delete',
};

// ---------------------------------------------------------------------------
// Bundle provenance
// ---------------------------------------------------------------------------

/** The built renderer CSS for the build this driver is about to launch. */
function readBuiltCss() {
  const dir = join(repoRoot, 'out', 'renderer', 'assets');
  const file = readdirSync(dir).find((f) => f.endsWith('.css'));
  if (!file) throw new Error(`no built CSS under ${dir} — run \`npm run build\``);
  return { file, dir, text: readFileSync(join(dir, file), 'utf8') };
}

/** Resolves each stylesheet's CSS Modules file hash from its signature: the
 *  one hash under which EVERY signature class appears. Ambiguity or absence is
 *  a HARNESS failure, not an application defect, and is reported as one. */
function resolveHashes(css) {
  const byHash = new Map();
  for (const [, name, hash] of css.matchAll(/_([A-Za-z0-9]+)_([a-z0-9]{5})_\d+/g)) {
    if (!byHash.has(hash)) byHash.set(hash, new Set());
    byHash.get(hash).add(name);
  }
  const out = {};
  for (const [file, spec] of Object.entries(CONVERTED)) {
    const candidates = [...byHash.entries()]
      .filter(([, names]) => spec.signature.every((s) => names.has(s)))
      .map(([h]) => h);
    out[file] = {
      signature: spec.signature,
      candidates,
      hash: candidates.length === 1 ? candidates[0] : null,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The in-page sweep
// ---------------------------------------------------------------------------

/**
 * Measures every converted class currently in the DOM. One `evaluate` per
 * call; called after each UI state change and merged, first measurement per
 * site winning. Each hit carries its rect so a resolved-but-not-rendered
 * element can never be reported as seen.
 */
function sweep(win, plan) {
  return win.evaluate((plan) => {
    const SIDE = {
      top: 'border-top-width',
      right: 'border-right-width',
      bottom: 'border-bottom-width',
      left: 'border-left-width',
    };
    const hits = [];
    const els = document.querySelectorAll('*');
    for (const el of els) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (!cls) continue;
      for (const entry of plan) {
        const token = `_${entry.cls}_${entry.hash}_`;
        if (!cls.includes(token)) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const widths = {};
        for (const s of entry.sides) widths[s] = cs.getPropertyValue(SIDE[s]);
        hits.push({
          file: entry.file,
          cls: entry.cls,
          kind: entry.kind,
          sides: entry.sides,
          widths,
          letterSpacing: cs.letterSpacing,
          fontSize: cs.fontSize,
          rect: { w: r.width, h: r.height },
          rendered: r.width > 0 && r.height > 0,
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 30),
        });
      }
    }
    return { hits, elementCount: els.length };
  }, plan);
}

/** `.railHeading` by its contract id, measured against its OWN font-size. */
function probeRailHeading(win) {
  return win.evaluate(() => {
    const el = document.getElementById('lane-rail-heading');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      className: String(el.className),
      letterSpacing: cs.letterSpacing,
      fontSize: cs.fontSize,
      text: (el.innerText || '').slice(0, 30),
      rendered: r.width > 0 && r.height > 0,
      rect: { w: r.width, h: r.height },
    };
  });
}

/** Computed border widths of one element located by its full class token. */
function probeBorder(win, token) {
  return win.evaluate((token) => {
    const el = [...document.querySelectorAll('*')].find((e) =>
      typeof e.className === 'string' ? e.className.includes(token) : false,
    );
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      className: String(el.className),
      top: cs.borderTopWidth,
      right: cs.borderRightWidth,
      bottom: cs.borderBottomWidth,
      left: cs.borderLeftWidth,
      style: cs.borderBottomStyle,
      rendered: r.width > 0 && r.height > 0,
    };
  }, token);
}

const px = (v) => Number.parseFloat(String(v ?? 'NaN'));

/**
 * THE PIXEL-GRID REFERENCE. Measures, on synthetic off-screen elements in the
 * live window, what a literal `border-width: 1px` actually computes to, what
 * `var(--oc-border-hairline)` computes to, and the whole declared-to-computed
 * ladder. On a fractionally-scaled display these are not `1px`: Chromium snaps
 * used border widths to whole device pixels. Everything downstream compares
 * against `oneCssPx` rather than the string '1px', so the checks measure the
 * TOKEN rather than the display scale.
 */
function probePixelGrid(win) {
  return win.evaluate(() => {
    const mk = (css) => {
      const d = document.createElement('div');
      d.style.cssText =
        'position:fixed;left:-9999px;top:0;width:40px;height:40px;border-style:solid;' + css;
      document.body.appendChild(d);
      const v = getComputedStyle(d).borderTopWidth;
      d.remove();
      return v;
    };
    const ladder = {};
    for (const n of [1, 2, 3, 4, 5]) ladder[`${n}px`] = mk(`border-width:${n}px`);
    return {
      oneCssPx: mk('border-width:1px'),
      viaToken: mk('border-width:var(--oc-border-hairline)'),
      ladder,
      keywords: {
        thin: mk('border-width:thin'),
        medium: mk('border-width:medium'),
        thick: mk('border-width:thick'),
      },
      devicePixelRatio: window.devicePixelRatio,
    };
  });
}

async function main() {
  rmSync(SHOT_DIR, { recursive: true, force: true });
  mkdirSync(SHOT_DIR, { recursive: true });

  const built = readBuiltCss();
  const hashes = resolveHashes(built.text);

  /** Flat sweep plan: one entry per converted class with a resolved hash. */
  const plan = [];
  for (const [file, spec] of Object.entries(CONVERTED)) {
    const h = hashes[file].hash;
    if (!h) continue;
    for (const [cls, sides] of Object.entries(spec.borders)) {
      plan.push({ file, cls, hash: h, sides, kind: 'border' });
    }
    for (const cls of spec.tracking) {
      plan.push({ file, cls, hash: h, sides: [], kind: 'tracking' });
    }
  }

  /** site key -> best measurement seen (a rendered hit beats a resolved one). */
  const measured = new Map();
  function absorb(hits, where) {
    for (const h of hits) {
      const key = `${h.file}:${h.cls}`;
      const prev = measured.get(key);
      if (!prev || (!prev.rendered && h.rendered)) {
        measured.set(key, { ...h, where });
      }
    }
  }

  const sandbox = buildSandbox(SANDBOX_ROOT);
  writeSettings(sandbox, BASELINE_SETTINGS);

  const { app, win } = await launch(sandbox);
  await win.setViewportSize?.({ width: 1280, height: 860 }).catch(() => {});

  const harnessFaults = [];
  /** What a literal `border-width: 1px` computes to in THIS window. Set at
   *  TS-1; every border check is relative to it. */
  let ONE = '1px';
  let grid = null;

  // ------------------------------------------------------------------ TS-0
  // WHICH BUILD IS THIS? The criterion a wrongly-run driver would pass.
  try {
    step('TS-0', 'Provenance: the live window is THIS worktree\'s build');
    note(`repoRoot resolved by lib.mjs = ${repoRoot}`);
    note(`sandbox root = ${sandbox.root}`);
    note(`built renderer CSS = out/renderer/assets/${built.file}`);

    // The session's one visible change, read out of the bundle that is running.
    const railRule = /\._railHeading_([a-z0-9]{5})_\d+\s*\{([^}]*)\}/.exec(built.text);
    check(
      'the built bundle contains a .railHeading rule',
      railRule !== null,
      railRule ? `hash=${railRule[1]}` : 'not found',
    );
    const ruleText = railRule ? railRule[2].replace(/\s+/g, ' ').trim() : '';
    check(
      'that rule carries letter-spacing: var(--oc-tracking-wide) — the converted form',
      /letter-spacing:\s*var\(--oc-tracking-wide\)/.test(ruleText),
      ruleText.slice(0, 160),
    );
    const stale = (built.text.match(/0\.06em/g) ?? []).length;
    check(
      'the pre-conversion literal 0.06em appears 0 times in the built bundle',
      stale === 0,
      `${stale} occurrence(s)`,
    );
    const hairline = (built.text.match(/var\(--oc-border-hairline\)/g) ?? []).length;
    note(
      `var(--oc-border-hairline) appears ${hairline} time(s) in the built bundle ` +
        '(counted by this driver over the bundle text; the frozen contract records ' +
        '24 consumers at the session base `af12edc`, so a bundle showing ~24 would ' +
        'be a PRE-session build)',
    );
    check(
      'the bundle has strictly more hairline consumers than the 24 recorded at af12edc',
      hairline > 24,
      `${hairline} > 24`,
    );

    // And the WINDOW agrees with the bundle: same per-file hash on the live
    // element. This is what rules out a stale bundle being served.
    const liveRail = await probeRailHeading(win);
    if (liveRail && railRule) {
      check(
        'the live .railHeading element carries the SAME file hash as that bundle rule',
        liveRail.className.includes(`_railHeading_${railRule[1]}_`),
        `live=${liveRail.className} bundle hash=${railRule[1]}`,
      );
    } else {
      note(
        'no .railHeading in the DOM yet (no active Pod) — the window/bundle hash ' +
          'agreement is re-checked at TS-4 where the rail renders',
      );
    }

    for (const [file, h] of Object.entries(hashes)) {
      check(
        `file hash resolved unambiguously for ${file}`,
        h.hash !== null,
        h.hash
          ? `signature {${h.signature.join(', ')}} -> _${h.hash}_`
          : `signature {${h.signature.join(', ')}} -> ${h.candidates.length} candidates`,
      );
      if (!h.hash) {
        harnessFaults.push(
          `signature {${h.signature.join(', ')}} for ${file} resolved to ` +
            `${h.candidates.length} hashes — attribution for that stylesheet is ` +
            'unsafe, so it was dropped from the sweep (HARNESS)',
        );
      }
    }
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-1
  try {
    step('TS-1', 'Both tokens resolve on :root in the real window');
    const tok = await win.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        hairline: cs.getPropertyValue('--oc-border-hairline').trim(),
        tracking: cs.getPropertyValue('--oc-tracking-wide').trim(),
        textXs: cs.getPropertyValue('--oc-text-xs').trim(),
        thick: cs.getPropertyValue('--oc-border-thick').trim(),
      };
    });
    check('--oc-border-hairline resolves to 1px', tok.hairline === '1px', tok.hairline);
    check('--oc-tracking-wide resolves to 0.04em', tok.tracking === '0.04em', tok.tracking);
    note(`--oc-text-xs = ${tok.textXs}, --oc-border-thick = ${tok.thick}`);

    // ---- THE PIXEL GRID ------------------------------------------------
    // Establishes what a DECLARED 1px actually computes to here, so the border
    // checks can measure the token instead of the display scale.
    grid = await probePixelGrid(win);
    ONE = grid.oneCssPx;
    note(
      `pixel grid measured on synthetic elements: declared 1px computes ${grid.oneCssPx}; ` +
        `ladder ${Object.entries(grid.ladder).map(([k, v]) => `${k}->${v}`).join(' ')}; ` +
        `devicePixelRatio=${grid.devicePixelRatio}`,
    );
    if (ONE !== '1px') {
      note(
        `NOT 1px. This display snaps used border widths to whole DEVICE pixels, so a ` +
          `declared 1px computes ${ONE}. This is the engine's pixel grid, not a token ` +
          `failure — and it is why every border check below compares against this ` +
          `measured reference rather than the string "1px". Hardcoding 1px here would ` +
          `be the same mistake criterion 4 forbids for tracking.`,
      );
    }
    check(
      'a literal 1px and var(--oc-border-hairline) compute IDENTICALLY on synthetic elements',
      grid.viaToken === grid.oneCssPx,
      `literal 1px -> ${grid.oneCssPx}, var(--oc-border-hairline) -> ${grid.viaToken}`,
    );
    note(
      'At --oc-text-xs: 11px both tracking candidates are SUB-PIXEL — ' +
        '0.04em = 0.44px, 0.06em = 0.66px — which is why every tracking check ' +
        "below is computed from the element's own measured font-size.",
    );
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-2
  // No Pod yet: EmptyWorkspace and the always-present WorkspaceLayout regions.
  try {
    step('TS-2', 'Empty workspace — WorkspaceLayout regions and EmptyWorkspace action');
    const s = await sweep(win, plan);
    absorb(s.hits, 'TS-2 empty workspace');
    note(`swept ${s.elementCount} elements; ${s.hits.length} converted-class hit(s)`);

    const pod = s.hits.find((h) => h.cls === 'podBarRegion' && h.rendered);
    check(
      `podBarRegion border-bottom computes a declared 1px (=${ONE}) — WorkspaceLayout.module.css:20`,
      pod !== undefined && pod.widths.bottom === ONE,
      pod ? `border-bottom-width=${pod.widths.bottom} (reference ${ONE})` : 'not rendered',
    );
    const panel = s.hits.find((h) => h.cls === 'panelBarRegion' && h.rendered);
    check(
      `panelBarRegion border-bottom computes a declared 1px (=${ONE}) — WorkspaceLayout.module.css:30`,
      panel !== undefined && panel.widths.bottom === ONE,
      panel ? `border-bottom-width=${panel.widths.bottom} (reference ${ONE})` : 'not rendered',
    );
    const action = s.hits.find((h) => h.cls === 'action' && h.rendered);
    if (action) {
      check(
        `EmptyWorkspace .action border computes a declared 1px (=${ONE}) on all four sides — EmptyWorkspace.module.css:26`,
        ALL.every((k) => action.widths[k] === ONE),
        ALL.map((k) => `${k}=${action.widths[k]}`).join(' ') + ` (reference ${ONE})`,
      );
    } else {
      check(
        'EmptyWorkspace .action is rendered in the first-run state',
        false,
        'not found in the sweep — the "New Pod" button should be on screen with no Pods',
      );
    }
    await shot(win, '01-empty-workspace');
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-3
  // The border probe and its TOKEN-RESOLUTION control. Run EARLY and on an
  // element that is always on screen, so no later stateful step can delete the
  // control — C3's first pass put its control last and a modal swallowed it.
  let borderToken = null;
  try {
    step('TS-3', 'Border probe + CONTROL: the probe discriminates on TOKEN RESOLUTION');
    borderToken = `_podBarRegion_${hashes['shell/WorkspaceLayout.module.css'].hash}_`;
    const base = await probeBorder(win, borderToken);
    check('the probe found .podBarRegion in the live DOM', base !== null, base?.className ?? 'absent');
    check(
      `BASELINE: .podBarRegion computes border-bottom-width ${ONE} — identical to a literal 1px`,
      base?.bottom === ONE,
      `bottom=${base?.bottom} style=${base?.style} (literal-1px reference ${ONE})`,
    );
    note(
      'Element: the Pod-bar region div. Stylesheet: ' +
        'src/renderer/src/shell/WorkspaceLayout.module.css:20 — ' +
        '`border-bottom: var(--oc-border-hairline) solid var(--oc-border)`.',
    );

    // THE CONTROL. Override the token to something that is not a length. The
    // `var()` substitution then makes the whole `border-bottom` shorthand
    // INVALID AT COMPUTED-VALUE TIME, so the longhands fall back to their
    // initial values and the computed width stops being 1px. A token that
    // silently failed to resolve in a shipped build would look exactly like
    // this, and a probe that cannot tell the two apart proves nothing.
    await win.evaluate(() =>
      document.documentElement.style.setProperty('--oc-border-hairline', 'not-a-length'),
    );
    await win.waitForTimeout(250);
    const broken = await probeBorder(win, borderToken);
    check(
      'CONTROL: with --oc-border-hairline overridden to a non-length, the computed width CHANGES',
      broken !== null && broken.bottom !== base?.bottom,
      `baseline bottom=${base?.bottom} -> overridden bottom=${broken?.bottom} ` +
        `(style ${base?.style} -> ${broken?.style})`,
    );
    check(
      'CONTROL: the overridden width is no longer 1px',
      broken?.bottom !== ONE,
      `${broken?.bottom} (shipped reference ${ONE})`,
    );
    await shot(win, '02-control-border-token-broken');

    await win.evaluate(() =>
      document.documentElement.style.removeProperty('--oc-border-hairline'),
    );
    await win.waitForTimeout(250);
    const restored = await probeBorder(win, borderToken);
    check(
      'the override was removed and the shipped hairline came back',
      restored?.bottom === ONE,
      `bottom=${restored?.bottom} (reference ${ONE})`,
    );
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-4
  try {
    step('TS-4', 'NewPodDialog — converted borders in the open dialog');
    await win.getByTestId('new-pod-button').click();
    await win.waitForSelector('[data-testid="new-pod-dialog"]', { timeout: 10000 });
    await win.waitForTimeout(400);
    const s = await sweep(win, plan);
    absorb(s.hits, 'TS-4 NewPodDialog open');

    const h = hashes['pods/NewPodDialog.module.css'].hash;
    const dlg = s.hits.find(
      (x) => x.file === 'pods/NewPodDialog.module.css' && x.cls === 'dialog' && x.rendered,
    );
    check(
      `NewPodDialog .dialog border computes a declared 1px (=${ONE}) on all sides — NewPodDialog.module.css:19`,
      dlg !== undefined && ALL.every((k) => dlg.widths[k] === ONE),
      dlg ? ALL.map((k) => `${k}=${dlg.widths[k]}`).join(' ') : 'not rendered',
    );
    const inDlg = s.hits.filter(
      (x) => x.file === 'pods/NewPodDialog.module.css' && x.rendered,
    );
    note(
      `rendered NewPodDialog converted classes (hash ${h}): ` +
        inDlg.map((x) => `.${x.cls}`).join(', '),
    );
    const wrong = inDlg.filter((x) => !x.sides.every((k) => x.widths[k] === ONE));
    check(
      `every rendered NewPodDialog converted border is a declared 1px (=${ONE}) on the sides it sets`,
      wrong.length === 0,
      wrong.length
        ? wrong.map((x) => `.${x.cls}:${x.sides.map((k) => k + '=' + x.widths[k]).join(',')}`).join(' ')
        : `all ${inDlg.length} rendered hit(s) at ${ONE}`,
    );
    await shot(win, '03-newpod-dialog');

    // `.bypass` and `.bypassWarning` render only while the dangerous permission
    // mode is selected (`dangerSelected`, NewPodDialog.tsx:213). That is state
    // the driver CAN create — one click on the mode radio — so it is measured
    // rather than recorded as unreachable.
    const picked = await win
      .getByTestId('new-pod-mode:bypassPermissions')
      .click()
      .then(() => true)
      .catch(() => false);
    check('the bypassPermissions mode option could be selected', picked, picked ? '' : 'control not found');
    if (picked) {
      await win.waitForTimeout(400);
      const s2 = await sweep(win, plan);
      absorb(s2.hits, 'TS-4 NewPodDialog, bypass mode selected');
      const by = s2.hits.find(
        (x) => x.file === 'pods/NewPodDialog.module.css' && x.cls === 'bypass' && x.rendered,
      );
      check(
        `NewPodDialog .bypass border computes a declared 1px (=${ONE}) — NewPodDialog.module.css:74`,
        by !== undefined && ALL.every((k) => by.widths[k] === ONE),
        by ? ALL.map((k) => `${k}=${by.widths[k]}`).join(' ') : 'not rendered',
      );
      await shot(win, '03b-newpod-dialog-bypass-mode');
    }

    await win.keyboard.press('Escape');
    await win.waitForTimeout(400);
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-5
  // THE SESSION'S ONE VISIBLE CHANGE. The lane rail renders only when a Pod is
  // active and no panel is open, which is why no previous hand-run ever saw it.
  try {
    step('TS-5', '.railHeading RENDERED — tracking measured against its own font-size');
    // `createPod` validates the cwd and spawns nothing, so a Pod — and with it
    // the whole rail/transcript/composer body — is reachable with no `claude`
    // process. `buildSandbox` creates `repos\plain-repo` as a real directory.
    const made = await win.evaluate(
      async (cwd) =>
        window.orcastrate.pods.create({ title: 'oc-token-sweep', cwd, permissionMode: 'default' }),
      join(SANDBOX_ROOT, 'repos', 'plain-repo'),
    );
    check('createPod succeeded', made?.ok === true, JSON.stringify(made).slice(0, 140));
    if (made?.ok !== true) {
      harnessFaults.push(`createPod failed: ${JSON.stringify(made).slice(0, 140)} (HARNESS)`);
    }

    // Creating through the preload bridge writes the store without notifying
    // the renderer, so the Pod bar never learns about it. A reload re-fetches
    // the list from the sandbox sqlite store. C3 recorded this same fault.
    await win.reload();
    await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 30000 });
    await win.waitForTimeout(1800);

    const tabs = await win.evaluate(
      () => document.querySelectorAll('[data-testid^="pod-tab:"]').length,
    );
    check('a Pod tab is rendered after the reload', tabs > 0, `${tabs} tab(s)`);

    // Activate the Pod so the workspace body (rail + transcript + composer)
    // replaces the empty state.
    const activated = await win.evaluate(() => {
      const tab = document.querySelector('[data-testid^="pod-tab:"]');
      if (!tab) return null;
      const btn = tab.querySelector('button') ?? tab;
      btn.click();
      return tab.getAttribute('data-testid');
    });
    note(`activated ${activated ?? 'nothing'}`);
    await win.waitForTimeout(1500);

    const railPresent = await win
      .waitForSelector('#lane-rail-heading', { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check('the lane rail heading is present in the DOM', railPresent, railPresent ? '' : 'absent');

    const rail = await probeRailHeading(win);
    check(
      '.railHeading is ON SCREEN (non-zero layout rect)',
      rail?.rendered === true,
      rail ? `${rail.tag}#lane-rail-heading rect=${rail.rect.w}x${rail.rect.h} text="${rail.text}"` : 'absent',
    );

    if (rail?.rendered) {
      const ls = px(rail.letterSpacing);
      const fs = px(rail.fontSize);
      const want = 0.04 * fs;
      const ceiling = 0.06 * fs;
      note(
        `MEASURED: letter-spacing=${rail.letterSpacing} font-size=${rail.fontSize} ` +
          `-> 0.04x font-size = ${want.toFixed(4)}px, 0.06x font-size = ${ceiling.toFixed(4)}px`,
      );
      check(
        'measured letter-spacing equals 0.04 x its own computed font-size (sub-pixel tolerance)',
        Number.isFinite(ls) && Number.isFinite(fs) && Math.abs(ls - want) < 0.02,
        `|${ls} - ${want.toFixed(4)}| = ${Math.abs(ls - want).toFixed(4)}px`,
      );
      check(
        'measured letter-spacing is STRICTLY LESS than 0.06 x font-size (the old value)',
        Number.isFinite(ls) && ls < ceiling,
        `${ls}px < ${ceiling.toFixed(4)}px`,
      );
      check(
        'the live element is the h2 the contract names',
        rail.tag === 'h2',
        `<${rail.tag} id="lane-rail-heading">`,
      );
      await shot(win, '04-rail-heading-rendered');

      // ---- THE DISCRIMINATION CONTROL for the tracking probe -------------
      // Put the PRE-SESSION value back on the same element, in-page, and
      // re-measure. A probe that has only ever reported the value it expected
      // has not been shown to measure anything.
      await win.evaluate(() => {
        const el = document.getElementById('lane-rail-heading');
        if (el) el.style.letterSpacing = '0.06em';
      });
      await win.waitForTimeout(250);
      const back = await probeRailHeading(win);
      const lsBack = px(back?.letterSpacing);
      check(
        'CONTROL: overridden back to 0.06em, the SAME probe reports a STRICTLY LARGER value',
        Number.isFinite(lsBack) && lsBack > ls,
        `shipped ${rail.letterSpacing} -> overridden ${back?.letterSpacing} ` +
          `(${lsBack} > ${ls})`,
      );
      check(
        'CONTROL: the overridden value matches 0.06 x font-size, so the probe tracks the declaration',
        Number.isFinite(lsBack) && Math.abs(lsBack - 0.06 * fs) < 0.02,
        `|${lsBack} - ${(0.06 * fs).toFixed(4)}| = ${Math.abs(lsBack - 0.06 * fs).toFixed(4)}px`,
      );
      await shot(win, '05-control-rail-heading-0.06em');
      await win.evaluate(() => {
        const el = document.getElementById('lane-rail-heading');
        if (el) el.style.letterSpacing = '';
      });
      await win.waitForTimeout(200);
      const restored = await probeRailHeading(win);
      check(
        'the override was removed and the shipped tracking came back',
        Math.abs(px(restored?.letterSpacing) - ls) < 0.005,
        `${restored?.letterSpacing}`,
      );
    }

    // The rail, transcript and composer are all on screen in this state.
    const s = await sweep(win, plan);
    absorb(s.hits, 'TS-5 active Pod, workspace body');
    note(
      `rendered converted classes with an active Pod: ` +
        s.hits.filter((x) => x.rendered).map((x) => `${x.file.split('/').pop()}:.${x.cls}`).join(', '),
    );
    await shot(win, '06-workspace-body');
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-6
  // `.bypassBadge` — the second of the three tracking sites. `PodTab.tsx:113`
  // derives the badge from `pod.permissionMode` ALONE, so a `bypassPermissions`
  // Pod renders it with no `claude` process. The brief expected this to be out
  // of reach; it is not.
  try {
    step('TS-6', '.bypassBadge — tracking and border on a bypassPermissions Pod');
    const made = await win.evaluate(
      async (cwd) =>
        window.orcastrate.pods.create({
          title: 'oc-token-sweep-bypass',
          cwd,
          permissionMode: 'bypassPermissions',
        }),
      join(SANDBOX_ROOT, 'repos', 'blocked-repo'),
    );
    check('createPod with permissionMode bypassPermissions succeeded', made?.ok === true, JSON.stringify(made).slice(0, 140));
    await win.reload();
    await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 30000 });
    await win.waitForTimeout(1800);

    const badge = await win.evaluate(() => {
      const el = document.querySelector('[data-testid^="pod-tab-bypass"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        className: String(el.className),
        letterSpacing: cs.letterSpacing,
        fontSize: cs.fontSize,
        top: cs.borderTopWidth,
        right: cs.borderRightWidth,
        bottom: cs.borderBottomWidth,
        left: cs.borderLeftWidth,
        rendered: r.width > 0 && r.height > 0,
        rect: { w: r.width, h: r.height },
      };
    });
    check('the bypass badge is on screen', badge?.rendered === true, badge ? `rect=${badge.rect.w}x${badge.rect.h}` : 'absent');
    if (badge?.rendered) {
      const ls = px(badge.letterSpacing);
      const fs = px(badge.fontSize);
      note(
        `MEASURED .bypassBadge: letter-spacing=${badge.letterSpacing} font-size=${badge.fontSize} ` +
          `-> 0.04x font-size = ${(0.04 * fs).toFixed(4)}px`,
      );
      check(
        '.bypassBadge letter-spacing equals 0.04 x its own font-size (PodBar.module.css:212)',
        Math.abs(ls - 0.04 * fs) < 0.02,
        `|${ls} - ${(0.04 * fs).toFixed(4)}| = ${Math.abs(ls - 0.04 * fs).toFixed(4)}px`,
      );
      check(
        `.bypassBadge border computes a declared 1px (=${ONE}) on all sides — PodBar.module.css:206`,
        ALL.every((k) => badge[k] === ONE),
        ALL.map((k) => `${k}=${badge[k]}`).join(' ') + ` (reference ${ONE})`,
      );
    }
    const s = await sweep(win, plan);
    absorb(s.hits, 'TS-6 bypassPermissions Pod');
    await shot(win, '07-bypass-badge');
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-7
  try {
    step('TS-7', 'DeletePodDialog — converted borders in the open dialog');
    const ctl = await win.evaluate(() => {
      const el = document.querySelector('[data-testid^="pod-tab-delete:"]');
      return el ? el.getAttribute('data-testid') : null;
    });
    if (!ctl) {
      check('a delete control is reachable on a Pod tab', false, 'no pod-tab-delete testid found');
      harnessFaults.push('no pod-tab-delete control found on any Pod tab (HARNESS)');
    } else {
      await win.getByTestId(ctl).click();
      await win.waitForSelector('[data-testid="delete-pod-dialog"]', { timeout: 10000 });
      await win.waitForTimeout(400);
      const s = await sweep(win, plan);
      absorb(s.hits, 'TS-7 DeletePodDialog open');
      const inDlg = s.hits.filter(
        (x) => x.file === 'pods/DeletePodDialog.module.css' && x.rendered,
      );
      check(
        'at least one DeletePodDialog converted border is rendered',
        inDlg.length > 0,
        inDlg.map((x) => `.${x.cls}`).join(', ') || 'none',
      );
      const wrong = inDlg.filter((x) => !x.sides.every((k) => x.widths[k] === ONE));
      check(
        `every rendered DeletePodDialog converted border is a declared 1px (=${ONE}) on the sides it sets`,
        wrong.length === 0,
        wrong.length
          ? wrong.map((x) => `.${x.cls}:${x.sides.map((k) => k + '=' + x.widths[k]).join(',')}`).join(' ')
          : `all ${inDlg.length} rendered hit(s) at ${ONE}`,
      );
      await shot(win, '08-deletepod-dialog');
      await win.getByTestId('delete-pod-cancel').click().catch(() => {});
      await win.waitForTimeout(400);
    }
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-8
  // Per-stylesheet coverage. Every one of the 7 converted stylesheets is
  // accounted for here: either a measured value, or named as unreached.
  const coverage = {};
  try {
    step('TS-8', 'Per-stylesheet coverage — measured, or named as unreachable');
    for (const [file, spec] of Object.entries(CONVERTED)) {
      const sites = [
        ...Object.keys(spec.borders).map((cls) => ({ cls, kind: 'border' })),
        ...spec.tracking.map((cls) => ({ cls, kind: 'tracking' })),
      ];
      const rows = sites.map(({ cls, kind }) => {
        const m = measured.get(`${file}:${cls}`);
        const convertedThisSession = !PRE_EXISTING.has(`${file}:${cls}`);
        if (m?.rendered) {
          return {
            cls,
            kind,
            convertedThisSession,
            status: 'measured',
            value:
              kind === 'tracking'
                ? `letter-spacing=${m.letterSpacing} (font-size=${m.fontSize})`
                : m.sides.map((k) => `${k}=${m.widths[k]}`).join(' '),
            where: m.where,
          };
        }
        return {
          cls,
          kind,
          convertedThisSession,
          status: m ? 'in DOM but not rendered' : 'not reached',
          reason: REACH_NOTES[`${file}:${cls}`] ?? 'not reached by any state this driver creates',
        };
      });
      coverage[file] = rows;
      const ok = rows.filter((r) => r.status === 'measured');
      check(
        `${file}: at least one converted declaration MEASURED on screen`,
        ok.length > 0,
        ok.length
          ? `${ok.length}/${rows.length} site(s) measured: ${ok.map((r) => `.${r.cls}`).join(', ')}`
          : `0/${rows.length} measured — every site recorded as unreachable with a reason`,
      );
      for (const r of rows.filter((x) => x.status !== 'measured')) {
        note(`${file} .${r.cls} (${r.kind}) NOT measured — ${r.reason}`);
      }
    }

    // The tally, counted over the coverage table this step just built.
    const all = Object.values(coverage).flat();
    const mine = all.filter((r) => r.convertedThisSession);
    const mineMeasured = mine.filter((r) => r.status === 'measured');
    note(
      `TALLY (counted over this run's coverage table): ${all.length} enumerated site(s), ` +
        `of which ${mine.length} were converted by this session ` +
        `(36 border declarations + 3 tracking) and ${all.length - mine.length} ` +
        'was already tokenised at af12edc (.panelBarRegion).',
    );
    check(
      'every one of the 7 converted stylesheets is accounted for in the coverage table',
      Object.keys(coverage).length === 7,
      `${Object.keys(coverage).length} stylesheet(s)`,
    );
    check(
      "this session's converted-site count matches the frozen contract's 36 + 3",
      mine.length === 39,
      `${mine.length} site(s) enumerated as converted by this session`,
    );
    note(
      `MEASURED ${mineMeasured.length} of this session's ${mine.length} converted sites ` +
        `on screen; the remaining ${mine.length - mineMeasured.length} are listed above, ` +
        'each with the reason it was not reachable.',
    );
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ TS-9
  // OPTIONAL, outside the acceptance criteria: does `border-width: thin`
  // compute to 1px in this Electron's Chromium? Measured on a SYNTHETIC
  // element; no stylesheet is touched.
  let thinObservation = null;
  try {
    step('TS-9', 'OBSERVATION (not a criterion): does border-width `thin` compute to 1px?');
    // Re-measured fresh here rather than reusing TS-1's reading, so the
    // observation stands on its own measurement.
    const g = await probePixelGrid(win);
    thinObservation = {
      thin: g.keywords.thin,
      medium: g.keywords.medium,
      thick: g.keywords.thick,
      onepx: g.oneCssPx,
      ladder: g.ladder,
      devicePixelRatio: g.devicePixelRatio,
      equivalentTo1px: g.keywords.thin === g.oneCssPx,
    };
    note(
      `synthetic elements: thin=${g.keywords.thin} medium=${g.keywords.medium} ` +
        `thick=${g.keywords.thick}; declared 1px=${g.oneCssPx}; dpr=${g.devicePixelRatio}`,
    );
    check(
      'OBSERVATION: `thin` computes to the SAME width as a declared `1px` in this engine',
      g.keywords.thin === g.oneCssPx,
      `thin=${g.keywords.thin} vs 1px=${g.oneCssPx}`,
    );
    note(
      'Consequence for the backlog item: converting the six surviving `thin` border ' +
        'widths in composer/Composer.module.css and permissions/PermissionCards.module.css ' +
        'to var(--oc-border-hairline) is a ZERO-PIXEL change in this engine — the two ' +
        'compute identically here. It is a consistency change, not a visual one.',
    );
    note(
      'Scope: this says what THIS Chromium does, measured here, on this display. The CSS ' +
        'spec fixes only the thin<medium<thick ordering and leaves the widths UA-defined, ' +
        'so this is an engine measurement, not a standards claim, and it is an observation ' +
        'outside this run\'s acceptance criteria.',
    );
  } catch (e) {
    stepError(e);
  }

  await app.close().catch(() => {});

  // ---------------------------------------------------------------- report
  const total = results.reduce((n, s) => n + s.checks.length, 0);
  const failed = results.reduce((n, s) => n + s.checks.filter((c) => !c.ok).length, 0);
  const errored = results.filter((s) => s.error).length;

  const meta = {
    generatedAt: new Date().toISOString(),
    scope: 'Token sweep verification — 36 border widths, 3 letter-spacing sites',
    repoRoot,
    sandboxRoot: sandbox.root,
    builtCss: `out/renderer/assets/${built.file}`,
    build: 'out/main/index.js',
    electron: process.versions.electron ?? 'via playwright _electron',
    playwright: 'local devDependency',
    hashes,
    harnessFaults,
    thinObservation,
    pixelGrid: grid,
    oneCssPxReference: ONE,
    countProvenance: {
      'checks total/failed/errored':
        'counted by this driver over its own results array at report time',
      'hairline consumers in bundle':
        "counted by this driver as /var\\(--oc-border-hairline\\)/g over the built CSS text",
      '0.06em occurrences in bundle':
        "counted by this driver as /0\\.06em/g over the built CSS text",
      'swept element count': 'document.querySelectorAll("*").length at sweep time',
      'the 1px reference used by every border check':
        'measured at TS-1 on a synthetic element declaring border-width:1px in this window',
      'per-stylesheet measured/total':
        'counted over this run\'s own coverage table, which lists every converted site',
    },
  };

  writeFileSync(
    join(REPORT_DIR, 'driven-report-token-sweep.json'),
    JSON.stringify({ meta, coverage, results, total, failed, errored }, null, 2),
    'utf8',
  );

  const md = [];
  md.push('# Driven hand-run — token sweep', '');
  md.push(`Generated ${meta.generatedAt}`);
  md.push('');
  md.push(`**${total - failed}/${total} checks passed.** ${errored} step(s) errored.`);
  md.push('');
  md.push('Every number in this file was produced by the run that wrote it:');
  md.push('');
  md.push('| Count | Produced by |');
  md.push('|---|---|');
  for (const [k, v] of Object.entries(meta.countProvenance)) md.push(`| ${k} | ${v} |`);
  md.push('');
  md.push(`- repoRoot launched: \`${meta.repoRoot}\``);
  md.push(`- sandbox root: \`${meta.sandboxRoot}\``);
  md.push(`- built renderer CSS: \`${meta.builtCss}\``);
  md.push('');
  if (grid) {
    md.push('## The pixel grid this run measured against', '');
    md.push(
      `A declared \`border-width: 1px\` computes to **\`${grid.oneCssPx}\`** in this window, ` +
        `and \`var(--oc-border-hairline)\` computes to \`${grid.viaToken}\` — identical. ` +
        'Chromium snaps used border widths to whole DEVICE pixels, so on a fractionally ' +
        'scaled display the computed value of a 1px border is not the string "1px". Every ' +
        'border check in this run therefore compares against that measured reference ' +
        'rather than a hardcoded literal.',
      '',
    );
    md.push('| Declared | Computed |');
    md.push('|---|---|');
    for (const [k, v] of Object.entries(grid.ladder)) md.push(`| \`${k}\` | \`${v}\` |`);
    for (const [k, v] of Object.entries(grid.keywords)) md.push(`| \`${k}\` | \`${v}\` |`);
    md.push(`| \`var(--oc-border-hairline)\` | \`${grid.viaToken}\` |`);
    md.push('');
    md.push(`devicePixelRatio reported by the window: \`${grid.devicePixelRatio}\``, '');
  }
  md.push('## Steps', '');
  md.push('| Step | Title | Checks | Verdict |');
  md.push('|---|---|---|---|');
  for (const s of results) {
    const bad = s.checks.filter((c) => !c.ok).length;
    const verdict = s.error ? 'ERROR' : bad === 0 ? (s.checks.length ? 'PASS' : 'n/a') : `FAIL (${bad})`;
    md.push(`| ${s.id} | ${s.title} | ${s.checks.length} | ${verdict} |`);
  }
  md.push('');
  md.push('## Per-stylesheet coverage', '');
  md.push('| Stylesheet | Site | Kind | This session? | Status | Measured value / reason |');
  md.push('|---|---|---|---|---|---|');
  for (const [file, rows] of Object.entries(coverage)) {
    for (const r of rows) {
      md.push(
        `| \`${file}\` | \`.${r.cls}\` | ${r.kind} | ${r.convertedThisSession ? 'yes' : 'no — already tokenised at af12edc'} | ${r.status} | ${r.status === 'measured' ? '`' + r.value + '`' : r.reason} |`,
      );
    }
  }
  md.push('');
  if (harnessFaults.length) {
    md.push('## Harness faults (NOT application defects)', '');
    for (const f of harnessFaults) md.push(`- ${f}`);
    md.push('');
  }
  md.push('## Full check log', '');
  for (const s of results) {
    md.push(`### ${s.id} — ${s.title}`, '');
    if (s.error) md.push(`**Step errored:** \`${s.error}\``, '');
    for (const c of s.checks) md.push(`- ${c.ok ? 'PASS' : '**FAIL**'} ${c.label}${c.detail ? ` — \`${c.detail}\`` : ''}`);
    for (const n of s.notes) md.push(`- note: ${n}`);
    for (const p of s.shots) md.push(`- shot: \`${p}\``);
    md.push('');
  }
  writeFileSync(join(REPORT_DIR, 'driven-report-token-sweep.md'), md.join('\n'), 'utf8');

  console.log(`\n==== TOKEN SWEEP RUN: ${total - failed}/${total} checks passed, ${errored} step error(s) ====`);
  console.log(`     sandbox: ${sandbox.root}`);
  console.log('     report: driven-report-token-sweep.md / .json');
  for (const s of results) {
    const bad = s.checks.filter((c) => !c.ok);
    if (bad.length || s.error) {
      console.log(`  ${s.id} ${s.error ? 'ERROR ' + s.error : ''}`);
      for (const c of bad) console.log(`    FAIL ${c.label} — ${c.detail}`);
    }
  }
  process.exit(failed > 0 || errored > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
