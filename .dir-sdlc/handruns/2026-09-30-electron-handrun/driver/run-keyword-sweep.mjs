/**
 * KEYWORD HAIRLINE SWEEP verification run — the six `thin` border widths this
 * session tokenised, driven in the real Electron window, PLUS the enumeration
 * defect that the previous run's own coverage table exposed.
 *
 * WHY THIS DRIVER EXISTS AND `run-token-sweep.mjs` WAS NOT EDITED. A completed
 * driver is the record of its own run; editing it would silently restate what
 * that run observed. Each session in this directory ships its own driver (Gate
 * 2 decision, upheld by the user). `run-token-sweep.mjs` is left byte-identical
 * and the correction note in `FINDINGS-TOKEN-SWEEP.md` points here.
 *
 * ---------------------------------------------------------------------------
 * THE ENUMERATION DEFECT, AS A PROPERTY RATHER THAN AS ITS ONE INSTANCE.
 *
 * `run-token-sweep.mjs` keys its site map by CLASS NAME: `borders` maps one
 * class to the sides its declaration sets. A declaration written under a
 * COMMA-GROUPED selector has more than one class and that map can hold only
 * one of them, so the other selectors are never probed and the declaration is
 * reported `not reached` while it is on screen.
 *
 * This driver keys every site by the DECLARATION — `<stylesheet>:<line>` — and
 * carries `selectors`, EVERY class in that declaration's selector group. A
 * declaration counts as REACHED when ANY of those selectors renders. That is
 * the frozen contract's `SiteEnumerationRequirement`, and it is held by the
 * data shape rather than by a special case: no entry below names an extra
 * class for the one known instance, and the shape is identical for a
 * single-selector declaration (a group of one) and for a grouped one.
 *
 * THE MAP IS NOT TRUSTED EITHER. KS-2 reads each stylesheet on disk, finds the
 * rule block that physically contains the declared line, extracts that rule's
 * own selector list, and fails loudly if it disagrees with `selectors` below.
 * So a group member missing from this file is a HARNESS failure rather than a
 * silent "not reached" — which is exactly the failure mode being closed. That
 * validator is itself positive-controlled in the same step against a
 * deliberately-wrong group, because a validator never seen rejecting anything
 * has not been shown to validate.
 *
 * ---------------------------------------------------------------------------
 * THE MEASUREMENT PROTOCOL — A CONSTRAINT ON WHAT MAY BE WRITTEN DOWN.
 *
 * NO PIXEL LITERAL IS EVER AN EXPECTATION HERE. On a fractionally scaled
 * display Chromium snaps used border widths to whole DEVICE pixels, so a
 * declaration of `1px` does not compute to the string `1px`. What survives
 * that quantization is an EQUALITY BETWEEN TWO VALUES MEASURED IN THE SAME
 * WINDOW: every converted border below is compared against the used width of a
 * synthetic element DECLARING `1px`, measured live in this window at KS-1 and
 * never hardcoded.
 *
 * The `1px`, `2px`, … strings inside `probeReference` are DECLARED INPUTS to a
 * measurement — the thing whose computed value is being read — and are not
 * expectations. Nothing in this file compares a measurement to a pixel literal.
 *
 * `border-width: thin` versus a declared `1px` is measured FRESHLY in this
 * run's own window, on two synthetic elements that exist at the same moment,
 * with `devicePixelRatio` reported beside them. The previous run's figure is
 * not carried over: it was measured in a different window.
 *
 * ---------------------------------------------------------------------------
 * ATTRIBUTION BY FILE HASH, NOT BY CLASS NAME. CSS Modules emits
 * `_<name>_<filehash>_<line>`. In the bundle under test `input` occurs under
 * four file hashes and `action` under two, so a sweep keyed on the bare name
 * would misattribute measurements between stylesheets. Each stylesheet's hash
 * is resolved at run time from a SIGNATURE of classes that co-occur only in
 * that file, and the run fails loudly on absence or ambiguity rather than
 * quietly measuring the wrong file or dropping it.
 *
 * A RESOLVED VALUE IS NOT A RENDERED ONE. `getComputedStyle` answers for a
 * `display:none` element too, so every hit records its layout rect and only
 * hits with a real box count as measured.
 *
 * ---------------------------------------------------------------------------
 * Run `npm run build` in THIS worktree first; this launches
 * `<repoRoot>/out/main/index.js` and `repoRoot` resolves relative to this file,
 * so a copy run from another checkout would launch that checkout's build and
 * confirm nothing. KS-0 proves which build is live.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { launch, step, check, note, stepError, results, repoRoot, shotsDir } from './lib.mjs';
import { buildSandbox, writeSettings, BASELINE_SETTINGS } from './sandbox.mjs';

/** A root of its own, so this run neither races nor clobbers an earlier one. */
const SANDBOX_ROOT = 'C:\\oc-sandbox-keyword-sweep';

const SHOT_DIR = join(shotsDir, 'keyword-sweep');
const REPORT_DIR = join(shotsDir, '..');
const SRC = join(repoRoot, 'src', 'renderer', 'src');

/** Screenshots land under `screenshots/keyword-sweep/`. `lib.mjs`'s `shot()`
 *  writes to the shared screenshots root and `writeReport()` hardcodes
 *  `driven-report.*`, which belong to earlier runs — this run owns neither. */
async function shot(win, name) {
  const file = join(SHOT_DIR, `${name}.png`);
  await win.screenshot({ path: file, fullPage: true }).catch(() => {});
  const rel = `screenshots/keyword-sweep/${name}.png`;
  const cur = results[results.length - 1];
  if (cur) cur.shots.push(rel);
  return rel;
}

// ---------------------------------------------------------------------------
// The converted population, keyed by DECLARATION
// ---------------------------------------------------------------------------

const ALL = ['top', 'right', 'bottom', 'left'];

/**
 * One entry per CONVERTED DECLARATION.
 *
 *   line       the declaration's own line in the stylesheet, which with the
 *              stylesheet path is this site's identity.
 *   selectors  EVERY class in the declaration's selector group. Reached when
 *              ANY of them renders. Validated against the stylesheet at KS-2.
 *   sides      the sides the declaration actually sets. A longhand leaves the
 *              other three at 0, so probing all four would manufacture a
 *              failure.
 *   inContract true for the six sites named in the frozen contract's
 *              `KEYWORD_WIDTH_SITES`.
 *   reachNote  why this site may be out of reach, written BEFORE the run so an
 *              unreachable site is a recorded limit and not a surprise.
 */
const SITES = {
  'composer/Composer.module.css': {
    signature: ['composer', 'srOnly', 'send', 'hint'],
    declarations: [
      { line: 15, selectors: ['composer'], sides: ['top'], inContract: true },
      { line: 44, selectors: ['input'], sides: ALL, inContract: true },
      { line: 70, selectors: ['send'], sides: ALL, inContract: true },
    ],
  },
  'permissions/PermissionCards.module.css': {
    signature: ['card', 'reason', 'kicker', 'asked'],
    declarations: [
      {
        line: 27,
        selectors: ['card'],
        sides: ALL,
        inContract: true,
        reachNote:
          'needs a pending permission request on the active Pod\'s Matriarch lane: ' +
          'PermissionCardList returns null on an empty card list (PermissionCardList.tsx:35)',
      },
      {
        line: 85,
        selectors: ['reason'],
        sides: ALL,
        inContract: true,
        reachNote: 'renders inside a permission card; same precondition as .card',
      },
      {
        line: 100,
        selectors: ['action'],
        sides: ALL,
        inContract: true,
        reachNote: 'renders inside a permission card; same precondition as .card',
      },
    ],
  },
  /**
   * NOT one of the six. This is the declaration that EXPOSED the enumeration
   * defect: a comma-grouped selector whose hairline declaration the previous
   * run reported `not reached` because its map could hold only `.unpin`.
   * `.filterToggle` renders unconditionally in the pane header
   * (`TranscriptPane.tsx:175-181`).
   */
  'transcript/Transcript.module.css': {
    signature: ['filterToggle', 'unpin', 'paneHeaderActions', 'paneHeader'],
    declarations: [
      {
        line: 51,
        selectors: ['filterToggle', 'unpin'],
        sides: ALL,
        inContract: false,
        groupedSelectorDemonstration: true,
        reachNote:
          '.unpin alone needs a SPLIT pane (a pinned follower lane); .filterToggle, the ' +
          'other member of the same selector group, renders unconditionally in the pane header',
      },
    ],
  },
};

/** A group this file deliberately gets WRONG, used at KS-2 to show the
 *  selector-group validator can reject. It is never swept. */
const VALIDATOR_NEGATIVE_CONTROL = {
  file: 'transcript/Transcript.module.css',
  line: 51,
  selectors: ['filterToggle'],
};

// ---------------------------------------------------------------------------
// Selector-group validation, read off the stylesheets themselves
// ---------------------------------------------------------------------------

/** Blanks comments while preserving every byte offset and newline, so offsets
 *  computed on the result still address the original file's lines. */
function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Top-level rule blocks with their selector text and body span. These three
 * stylesheets contain no `@media`/`@supports` (asserted by the caller), so
 * every declaration sits in a depth-1 block.
 */
function parseRules(text) {
  const src = blankComments(text);
  const rules = [];
  let depth = 0;
  let selStart = 0;
  let blockStart = -1;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) blockStart = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        rules.push({ selector: src.slice(selStart, blockStart).trim(), start: blockStart, end: i });
        selStart = i + 1;
      }
    }
  }
  return { src, rules };
}

/** 1-based line number of a byte offset. */
function lineOfOffset(src, offset) {
  return src.slice(0, offset).split('\n').length;
}

/** Byte offset of the start of a 1-based line. */
function offsetOfLine(src, line) {
  const lines = src.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1; i += 1) offset += lines[i].length + 1;
  return offset;
}

/**
 * Reads the stylesheet and reports, for the declaration at `line`:
 *   - the selector group of the rule that physically contains it, as class
 *     names, and
 *   - whether that line really is a `var(--oc-border-hairline)` declaration.
 * Everything a caller needs to tell a stale map from a correct one.
 */
function readDeclarationSite(file, line) {
  const text = readFileSync(join(SRC, file), 'utf8');
  const { src, rules } = parseRules(text);
  const atRules = (src.match(/@(media|supports|container)\b/g) ?? []).length;
  const offset = offsetOfLine(src, line);
  const lineText = src.split('\n')[line - 1] ?? '';
  const rule = rules.find((r) => offset > r.start && offset < r.end) ?? null;
  const selectors =
    rule === null
      ? null
      : rule.selector
          .split(',')
          .map((s) => s.trim())
          .map((s) => {
            const m = /^\.([A-Za-z0-9_-]+)$/.exec(s);
            return m === null ? `UNPARSED(${s})` : m[1];
          });
  return {
    atRules,
    lineText: lineText.trim(),
    isHairlineDeclaration: /var\(--oc-border-hairline\)/.test(lineText),
    selectorText: rule?.selector ?? null,
    selectors,
    ruleStartLine: rule === null ? null : lineOfOffset(src, rule.start),
  };
}

const sameSet = (a, b) =>
  a !== null && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

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

/** Resolves each stylesheet's CSS Modules file hash from its signature: the one
 *  hash under which EVERY signature class appears. Absence or ambiguity is a
 *  HARNESS failure and is reported as one. */
function resolveHashes(css) {
  const byHash = new Map();
  for (const m of css.matchAll(/_([A-Za-z0-9]+)_([a-z0-9]{5})_\d+/g)) {
    // Indexed access with an explicit cast would be needed if this file were
    // typechecked; it is plain ESM run by node, and both groups are
    // unconditional in the pattern, so a match always carries both.
    const name = m[1];
    const hash = m[2];
    if (!byHash.has(hash)) byHash.set(hash, new Set());
    byHash.get(hash).add(name);
  }
  const out = {};
  for (const [file, spec] of Object.entries(SITES)) {
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
 * Measures every converted DECLARATION currently in the DOM. For each site,
 * every selector in its group is probed; the first selector found with a real
 * layout box resolves the site, and which one did is recorded. One `evaluate`
 * per call, called after each UI state change and merged.
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
    const els = [...document.querySelectorAll('*')];
    for (const entry of plan) {
      for (const cls of entry.selectors) {
        const token = `_${cls}_${entry.hash}_`;
        for (const el of els) {
          const name = typeof el.className === 'string' ? el.className : '';
          if (!name || !name.includes(token)) continue;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const widths = {};
          for (const s of entry.sides) widths[s] = cs.getPropertyValue(SIDE[s]);
          hits.push({
            key: entry.key,
            file: entry.file,
            line: entry.line,
            selectorResolved: cls,
            selectorGroup: entry.selectors,
            sides: entry.sides,
            widths,
            rect: { w: r.width, h: r.height },
            rendered: r.width > 0 && r.height > 0,
            tag: el.tagName.toLowerCase(),
            className: name,
            text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 30),
          });
        }
      }
    }
    return { hits, elementCount: els.length };
  }, plan);
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
      style: cs.borderTopStyle,
      rendered: r.width > 0 && r.height > 0,
    };
  }, token);
}

/**
 * THE REFERENCE, MEASURED IN THIS WINDOW.
 *
 * `thin` and a declared `1px` are measured SIDE BY SIDE: both synthetic
 * elements exist in the document at the same moment and are read in the same
 * pass, so the comparison cannot straddle a window change. The `Npx` strings
 * below are declared inputs whose computed values are being read — not
 * expectations.
 */
function probeReference(win) {
  return win.evaluate(() => {
    const made = [];
    const mk = (css) => {
      const d = document.createElement('div');
      d.style.cssText =
        'position:fixed;left:-9999px;top:0;width:40px;height:40px;border-style:solid;' + css;
      document.body.appendChild(d);
      made.push(d);
      return d;
    };
    const used = (d) => getComputedStyle(d).borderTopWidth;

    // Side by side, alive together, read together.
    const elThin = mk('border-width:thin');
    const elOne = mk('border-width:1px');
    const elToken = mk('border-width:var(--oc-border-hairline)');
    const elMedium = mk('border-width:medium');
    const elThick = mk('border-width:thick');
    const ladderEls = {};
    for (const n of [1, 2, 3, 4, 5]) ladderEls[`${n}px`] = mk(`border-width:${n}px`);

    const out = {
      declaredOnePx: used(elOne),
      keywordThin: used(elThin),
      viaToken: used(elToken),
      keywordMedium: used(elMedium),
      keywordThick: used(elThick),
      ladder: Object.fromEntries(Object.entries(ladderEls).map(([k, d]) => [k, used(d)])),
      devicePixelRatio: window.devicePixelRatio,
      bothAliveTogether: document.body.contains(elThin) && document.body.contains(elOne),
    };
    for (const d of made) d.remove();
    return out;
  });
}

/** Pushes one of the app's own IPC events from the MAIN process into the
 *  window, exactly as `pod-manager/pushes.ts` does. The channel, the preload
 *  bridge, the store, React and the CSS engine are all the shipped ones; only
 *  the originating `claude` process is absent. */
function sendPush(app, channel, payload) {
  return app.evaluate(
    ({ BrowserWindow }, { channel, payload }) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (!w) return false;
      w.webContents.send(channel, payload);
      return true;
    },
    { channel, payload },
  );
}

function sha256OrNull(path) {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function main() {
  rmSync(SHOT_DIR, { recursive: true, force: true });
  mkdirSync(SHOT_DIR, { recursive: true });

  const built = readBuiltCss();
  const hashes = resolveHashes(built.text);

  /** Flat sweep plan: one entry per DECLARATION with a resolved file hash. */
  const plan = [];
  for (const [file, spec] of Object.entries(SITES)) {
    const h = hashes[file].hash;
    if (!h) continue;
    for (const d of spec.declarations) {
      plan.push({ key: `${file}:${d.line}`, file, line: d.line, hash: h, selectors: d.selectors, sides: d.sides });
    }
  }

  /** site key -> best measurement seen (a rendered hit beats a resolved one). */
  const measured = new Map();
  function absorb(hits, where) {
    for (const h of hits) {
      const prev = measured.get(h.key);
      if (!prev || (!prev.rendered && h.rendered)) measured.set(h.key, { ...h, where });
    }
  }

  /** The real home is never written. Hashed before and after as a safety check. */
  const realSettings = join(homedir(), '.claude', 'settings.json');
  const realSettingsBefore = sha256OrNull(realSettings);

  const sandbox = buildSandbox(SANDBOX_ROOT);
  writeSettings(sandbox, BASELINE_SETTINGS);

  const { app, win } = await launch(sandbox);
  await win.setViewportSize?.({ width: 1280, height: 900 }).catch(() => {});

  const harnessFaults = [];
  /** What a DECLARED `1px` computes to in THIS window. Set at KS-1; every
   *  border check is an equality against it. Deliberately not initialised to a
   *  pixel literal: an unset reference must fail, not silently pass. */
  let ONE = null;
  let reference = null;
  let groupValidation = [];

  // ------------------------------------------------------------------ KS-0
  try {
    step('KS-0', 'Provenance: the live window is THIS worktree\'s build');
    note(`repoRoot resolved by lib.mjs = ${repoRoot}`);
    note(`sandbox root = ${sandbox.root}`);
    note(`built renderer CSS = out/renderer/assets/${built.file}`);

    for (const [file, h] of Object.entries(hashes)) {
      check(
        `file hash resolved unambiguously for ${file}`,
        h.hash !== null,
        h.hash
          ? `signature {${h.signature.join(', ')}} -> _${h.hash}_`
          : `signature {${h.signature.join(', ')}} -> ${h.candidates.length} candidate(s)`,
      );
      if (!h.hash) {
        harnessFaults.push(
          `signature {${h.signature.join(', ')}} for ${file} resolved to ${h.candidates.length} ` +
            'hashes — attribution for that stylesheet is unsafe (HARNESS)',
        );
      }
    }

    // The six conversions, read out of the bundle that is about to run. The
    // bundle is minified, so each rule is located by its class token.
    const composerHash = hashes['composer/Composer.module.css'].hash;
    const permsHash = hashes['permissions/PermissionCards.module.css'].hash;
    const ruleOf = (cls, hash) => {
      const re = new RegExp(`\\._${cls}_${hash}_\\d+[^{]*\\{([^}]*)\\}`);
      const m = re.exec(built.text);
      return m === null ? null : m[1];
    };
    for (const [cls, hash] of [
      ['composer', composerHash],
      ['input', composerHash],
      ['send', composerHash],
      ['card', permsHash],
      ['reason', permsHash],
      ['action', permsHash],
    ]) {
      const body = hash === null ? null : ruleOf(cls, hash);
      check(
        `the built bundle's .${cls} rule (hash ${hash}) names var(--oc-border-hairline)`,
        body !== null && /var\(--oc-border-hairline\)/.test(body),
        body === null ? 'rule not found' : body.replace(/\s+/g, ' ').slice(0, 150),
      );
      // The pre-conversion form, gone from THIS rule. A keyword census over the
      // whole bundle would flag `var(--oc-border-thick)` on its name, which is
      // this session's load-bearing near-miss; scoped to one rule's body and
      // term-anchored, it cannot.
      check(
        `that same .${cls} rule no longer declares a bare width keyword`,
        body !== null &&
          !/(^|[;:\s])(thin|medium|thick)(\s|;|$)/.test(body.replace(/var\([^)]*\)/g, 'VAR')),
        body === null ? 'rule not found' : 'no bare keyword in the rule body',
      );
    }

    // POSITIVE CONTROL for the two checks above: the same two predicates, run
    // against a body that is KNOWN to contain each thing, must report it. A
    // predicate that can only say "absent" has not been shown to look.
    const controlBody = 'border:thin solid var(--oc-border);';
    check(
      'CONTROL: the keyword predicate FLAGS a body declaring `border: thin solid …`',
      /(^|[;:\s])(thin|medium|thick)(\s|;|$)/.test(controlBody.replace(/var\([^)]*\)/g, 'VAR')),
      controlBody,
    );
    const nearMissBody = 'border:var(--oc-border-thick) solid var(--oc-border);';
    check(
      'CONTROL: the same predicate does NOT flag var(--oc-border-thick) — the session near-miss',
      !/(^|[;:\s])(thin|medium|thick)(\s|;|$)/.test(nearMissBody.replace(/var\([^)]*\)/g, 'VAR')),
      nearMissBody,
    );
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ KS-1
  try {
    step('KS-1', 'The reference, measured in THIS window: declared 1px, and `thin` beside it');
    const tok = await win.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        hairline: cs.getPropertyValue('--oc-border-hairline').trim(),
        thick: cs.getPropertyValue('--oc-border-thick').trim(),
      };
    });
    note(`--oc-border-hairline resolves on :root to "${tok.hairline}"; --oc-border-thick to "${tok.thick}"`);
    check(
      '--oc-border-hairline resolves to a non-empty value on :root',
      tok.hairline.length > 0,
      tok.hairline,
    );

    reference = await probeReference(win);
    ONE = reference.declaredOnePx;
    check(
      'the two synthetic elements were alive in the document together when read',
      reference.bothAliveTogether === true,
      `bothAliveTogether=${reference.bothAliveTogether}`,
    );
    note(
      `MEASURED FRESH IN THIS WINDOW: border-width:thin -> ${reference.keywordThin}; ` +
        `border-width:1px -> ${reference.declaredOnePx}; ` +
        `border-width:var(--oc-border-hairline) -> ${reference.viaToken}; ` +
        `medium -> ${reference.keywordMedium}; thick -> ${reference.keywordThick}; ` +
        `devicePixelRatio=${reference.devicePixelRatio}`,
    );
    note(
      'declared-to-computed ladder in this window: ' +
        Object.entries(reference.ladder).map(([k, v]) => `${k}->${v}`).join(' ') +
        ' — these are declared INPUTS whose computed values are read, not expectations.',
    );
    check(
      'THE SESSION\'S PREMISE, measured in this window: `thin` and a declared `1px` have the SAME used width',
      reference.keywordThin === reference.declaredOnePx,
      `thin -> ${reference.keywordThin}, declared 1px -> ${reference.declaredOnePx}`,
    );
    check(
      'var(--oc-border-hairline) and a declared `1px` have the SAME used width',
      reference.viaToken === reference.declaredOnePx,
      `token -> ${reference.viaToken}, declared 1px -> ${reference.declaredOnePx}`,
    );
    check(
      'the reference is ORDERED thin < medium < thick, so the probe distinguishes the keywords',
      Number.parseFloat(reference.keywordThin) < Number.parseFloat(reference.keywordMedium) &&
        Number.parseFloat(reference.keywordMedium) < Number.parseFloat(reference.keywordThick),
      `${reference.keywordThin} < ${reference.keywordMedium} < ${reference.keywordThick}`,
    );
    if (ONE !== '1px') {
      note(
        `A declared 1px does NOT compute to the string "1px" here: it computes ${ONE}. That is ` +
          'this display\'s device-pixel quantization, not a token failure — and it is why every ' +
          'border check below is an EQUALITY against this measured reference rather than against ' +
          'any literal.',
      );
    }
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ KS-2
  // THE MAP IS VALIDATED AGAINST THE STYLESHEETS, and the validator against a
  // group that is known to be wrong.
  try {
    step('KS-2', 'Selector groups validated against the stylesheets, and the validator controlled');
    for (const [file, spec] of Object.entries(SITES)) {
      for (const d of spec.declarations) {
        const site = readDeclarationSite(file, d.line);
        groupValidation.push({ file, line: d.line, declared: d.selectors, found: site.selectors, ok: sameSet(site.selectors, d.selectors) });
        check(
          `${file}:${d.line} is a var(--oc-border-hairline) declaration in the stylesheet`,
          site.isHairlineDeclaration,
          site.lineText,
        );
        check(
          `${file}:${d.line} — this driver's selector group matches the stylesheet's own`,
          sameSet(site.selectors, d.selectors),
          `stylesheet rule at :${site.ruleStartLine} is "${site.selectorText}" -> ` +
            `{${(site.selectors ?? []).join(', ')}}; this driver carries {${d.selectors.join(', ')}}`,
        );
        check(
          `${file} contains no at-rule that could nest a declaration out of this parse`,
          site.atRules === 0,
          `${site.atRules} at-rule(s)`,
        );
        if (!sameSet(site.selectors, d.selectors)) {
          harnessFaults.push(
            `${file}:${d.line} selector group in this driver {${d.selectors.join(', ')}} ` +
              `disagrees with the stylesheet {${(site.selectors ?? []).join(', ')}} (HARNESS)`,
          );
        }
      }
    }
    // THE CONTROL. The same validator, against a group this file deliberately
    // gets wrong by dropping one member — the exact defect shape being closed.
    const nc = VALIDATOR_NEGATIVE_CONTROL;
    const ncSite = readDeclarationSite(nc.file, nc.line);
    check(
      'CONTROL: the validator REJECTS a selector group with a member missing',
      !sameSet(ncSite.selectors, nc.selectors),
      `offered {${nc.selectors.join(', ')}} against the stylesheet's ` +
        `{${(ncSite.selectors ?? []).join(', ')}} -> rejected`,
    );
    note(
      'That control is the class-keyed defect in miniature: {filterToggle} alone is what a ' +
        'one-class-per-declaration map can hold, and the validator rejects it.',
    );
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ KS-3
  try {
    step('KS-3', 'Empty workspace — sweep before any Pod exists');
    const s = await sweep(win, plan);
    absorb(s.hits, 'KS-3 empty workspace');
    note(`swept ${s.elementCount} elements; ${s.hits.length} converted-declaration hit(s)`);
    await shot(win, '01-empty-workspace');
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ KS-4
  // An active Pod puts the composer and the transcript pane on screen.
  let podId = null;
  try {
    step('KS-4', 'Active Pod — the composer declarations and the GROUPED transcript declaration');
    const made = await win.evaluate(
      async (cwd) =>
        window.orcastrate.pods.create({ title: 'oc-keyword-sweep', cwd, permissionMode: 'default' }),
      join(SANDBOX_ROOT, 'repos', 'plain-repo'),
    );
    check('createPod succeeded', made?.ok === true, JSON.stringify(made).slice(0, 140));
    if (made?.ok !== true) harnessFaults.push(`createPod failed: ${JSON.stringify(made).slice(0, 140)} (HARNESS)`);

    // Creating through the preload bridge writes the store without notifying
    // the renderer, so the Pod bar never learns about it. A reload re-fetches
    // the list. Both earlier runs recorded this same harness fault.
    await win.reload();
    await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 30000 });
    await win.waitForTimeout(1800);

    const activated = await win.evaluate(() => {
      const tab = document.querySelector('[data-testid^="pod-tab:"]');
      if (!tab) return null;
      const btn = tab.querySelector('button') ?? tab;
      btn.click();
      return tab.getAttribute('data-testid');
    });
    note(`activated ${activated ?? 'nothing'}`);
    await win.waitForTimeout(1500);

    const listed = await win.evaluate(async () => window.orcastrate.pods.list());
    podId = listed?.ok === true ? (listed.value[0]?.id ?? null) : null;
    check('a Pod id is known to the driver for the push steps', podId !== null, String(podId));

    const s = await sweep(win, plan);
    absorb(s.hits, 'KS-4 active Pod');
    note(
      'rendered declarations with an active Pod: ' +
        (s.hits.filter((x) => x.rendered).map((x) => `${x.key} via .${x.selectorResolved}`).join(', ') || 'none'),
    );

    for (const key of [
      'composer/Composer.module.css:15',
      'composer/Composer.module.css:44',
      'composer/Composer.module.css:70',
    ]) {
      const m = measured.get(key);
      check(
        `${key} MEASURED on screen and equal to the declared-1px reference on the sides it sets`,
        m?.rendered === true && m.sides.every((k) => m.widths[k] === ONE),
        m?.rendered
          ? `via .${m.selectorResolved} <${m.tag}> rect=${m.rect.w.toFixed(1)}x${m.rect.h.toFixed(1)} ` +
            m.sides.map((k) => `${k}=${m.widths[k]}`).join(' ') +
            ` (reference ${ONE})`
          : 'not rendered',
      );
    }

    // THE DEMONSTRATION. The grouped declaration the previous run reported
    // `not reached`.
    const grouped = measured.get('transcript/Transcript.module.css:51');
    check(
      'transcript/Transcript.module.css:51 (.filterToggle, .unpin) is MEASURED, not `not reached`',
      grouped?.rendered === true,
      grouped?.rendered
        ? `resolved via .${grouped.selectorResolved} of group {${grouped.selectorGroup.join(', ')}}; ` +
          `<${grouped.tag}> text="${grouped.text}" rect=${grouped.rect.w.toFixed(1)}x${grouped.rect.h.toFixed(1)}; ` +
          ALL.map((k) => `${k}=${grouped.widths[k]}`).join(' ')
        : 'not rendered',
    );
    check(
      'that grouped declaration equals the declared-1px reference on all four sides',
      grouped?.rendered === true && ALL.every((k) => grouped.widths[k] === ONE),
      grouped?.rendered
        ? ALL.map((k) => `${k}=${grouped.widths[k]}`).join(' ') + ` (reference ${ONE})`
        : 'not rendered',
    );
    check(
      'it resolved through a selector that is NOT the one a class-keyed map would have held (.unpin)',
      grouped?.rendered === true && grouped.selectorResolved !== 'unpin',
      `resolved via .${grouped?.selectorResolved ?? 'none'}`,
    );
    await shot(win, '02-active-pod-composer-and-transcript');
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ KS-5
  // THE MEASUREMENT CONTROL. A probe that has only ever reported the value it
  // expected has not been shown to measure anything.
  try {
    step('KS-5', 'CONTROL: the border probe discriminates on TOKEN RESOLUTION');
    const token = `_composer_${hashes['composer/Composer.module.css'].hash}_`;
    const base = await probeBorder(win, token);
    check('the probe found the .composer element in the live DOM', base !== null, base?.className ?? 'absent');
    check(
      'BASELINE: .composer border-top equals the declared-1px reference',
      base?.top === ONE,
      `top=${base?.top} style=${base?.style} (reference ${ONE})`,
    );
    await win.evaluate(() =>
      document.documentElement.style.setProperty('--oc-border-hairline', 'not-a-length'),
    );
    await win.waitForTimeout(250);
    const broken = await probeBorder(win, token);
    check(
      'CONTROL: with --oc-border-hairline overridden to a non-length, the measured width CHANGES',
      broken !== null && broken.top !== base?.top,
      `baseline top=${base?.top} -> overridden top=${broken?.top} (style ${base?.style} -> ${broken?.style})`,
    );
    check(
      'CONTROL: the overridden width no longer equals the reference',
      broken?.top !== ONE,
      `${broken?.top} (reference ${ONE})`,
    );
    await shot(win, '03-control-token-broken');
    await win.evaluate(() => document.documentElement.style.removeProperty('--oc-border-hairline'));
    await win.waitForTimeout(250);
    const restored = await probeBorder(win, token);
    check(
      'the override was removed and the shipped hairline came back',
      restored?.top === ONE,
      `top=${restored?.top} (reference ${ONE})`,
    );
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ KS-6
  // The three permission-card declarations. A card needs a pending request on
  // the active Pod's Matriarch lane. The contract's reach note says that needs
  // a live `claude` process — it needs the app's own two PUSHES, which the main
  // process can send without one. The channel, the preload bridge, the store,
  // React and the CSS engine are all shipped code.
  try {
    step('KS-6', 'Permission cards — .card, .reason and .action through the app\'s own pushes');
    if (podId === null) {
      check('a Pod id was available for the permission pushes', false, 'no Pod id');
    } else {
      const laneId = 'oc-keyword-sweep-lane-1';
      const startedAt = new Date().toISOString();
      const laneSent = await sendPush(app, 'push:laneChanged', {
        podId,
        lanes: [
          {
            id: laneId,
            podId,
            kind: 'matriarch',
            toolUseId: null,
            agentId: null,
            parentLaneId: null,
            depth: 0,
            subagentType: null,
            description: null,
            status: 'running',
            startedAt,
            endedAt: null,
          },
        ],
      });
      check('the laneChanged push was sent from the main process', laneSent === true, String(laneSent));
      await win.waitForTimeout(600);

      const reqSent = await sendPush(app, 'push:permissionRequested', {
        podId,
        laneId,
        requestId: 'oc-keyword-sweep-req-1',
        toolName: 'Bash',
        input: { command: 'echo keyword-sweep', description: 'driven hand-run probe' },
      });
      check('the permissionRequested push was sent from the main process', reqSent === true, String(reqSent));

      const appeared = await win
        .waitForSelector('[data-testid="permission-card-list"]', { timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      check('a permission card list is in the DOM', appeared, appeared ? '' : 'absent');
      await win.waitForTimeout(600);

      const s = await sweep(win, plan);
      absorb(s.hits, 'KS-6 permission card on screen');
      for (const key of [
        'permissions/PermissionCards.module.css:27',
        'permissions/PermissionCards.module.css:85',
        'permissions/PermissionCards.module.css:100',
      ]) {
        const m = measured.get(key);
        check(
          `${key} MEASURED on screen and equal to the declared-1px reference on all four sides`,
          m?.rendered === true && m.sides.every((k) => m.widths[k] === ONE),
          m?.rendered
            ? `via .${m.selectorResolved} <${m.tag}> rect=${m.rect.w.toFixed(1)}x${m.rect.h.toFixed(1)} ` +
              m.sides.map((k) => `${k}=${m.widths[k]}`).join(' ') +
              ` (reference ${ONE})`
            : 'not rendered',
        );
      }
      note(
        'HOW THIS STATE WAS REACHED, stated so the measurement is not read as more than it is: ' +
          'the lane and the pending request were delivered on the app\'s own `push:laneChanged` ' +
          'and `push:permissionRequested` channels from the main process. No `claude` process ran. ' +
          'Everything between the channel and the pixel — preload bridge, store, React tree, ' +
          'stylesheet, layout — is the shipped code path.',
      );
      await shot(win, '04-permission-card');
    }
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ KS-7
  const coverage = {};
  try {
    step('KS-7', 'Coverage — every enumerated declaration measured, or named unreachable with its reason');
    for (const [file, spec] of Object.entries(SITES)) {
      coverage[file] = spec.declarations.map((d) => {
        const key = `${file}:${d.line}`;
        const m = measured.get(key);
        const base = {
          line: d.line,
          selectors: d.selectors,
          sides: d.sides,
          inContract: d.inContract === true,
          groupedSelectorDemonstration: d.groupedSelectorDemonstration === true,
        };
        if (m?.rendered) {
          return {
            ...base,
            status: 'measured',
            selectorResolved: m.selectorResolved,
            value: m.sides.map((k) => `${k}=${m.widths[k]}`).join(' '),
            equalsReference: m.sides.every((k) => m.widths[k] === ONE),
            where: m.where,
          };
        }
        return {
          ...base,
          status: m ? 'in DOM but not rendered' : 'not reached',
          reason: d.reachNote ?? 'not reached by any state this driver creates',
        };
      });
      for (const r of coverage[file].filter((x) => x.status !== 'measured')) {
        note(`${file}:${r.line} {${r.selectors.join(', ')}} NOT measured — ${r.reason}`);
      }
    }

    const rows = Object.entries(coverage).flatMap(([file, rs]) => rs.map((r) => ({ ...r, file })));
    const contractRows = rows.filter((r) => r.inContract);
    const contractMeasured = contractRows.filter((r) => r.status === 'measured');
    note(
      `TALLY (counted over this run's own coverage table): ${rows.length} declaration(s) ` +
        `enumerated, of which ${contractRows.length} are the frozen contract's ` +
        `KEYWORD_WIDTH_SITES and ${rows.length - contractRows.length} is the grouped-selector ` +
        'declaration this session\'s enumeration fix was written for.',
    );
    check(
      "every one of the frozen contract's six converted declarations is enumerated",
      contractRows.length === 6,
      `${contractRows.length} enumerated as inContract`,
    );
    check(
      'every enumerated declaration is EITHER measured on screen OR carries a reason written before the run',
      rows.every((r) => r.status === 'measured' || typeof r.reason === 'string'),
      `${contractMeasured.length}/${contractRows.length} contract site(s) measured; ` +
        `${rows.filter((r) => r.status !== 'measured').length} unreached, each with a reason`,
    );
    check(
      'every MEASURED declaration equals the declared-1px reference on the sides it sets',
      rows.filter((r) => r.status === 'measured').every((r) => r.equalsReference === true),
      rows
        .filter((r) => r.status === 'measured')
        .map((r) => `${r.file}:${r.line}=${r.equalsReference ? 'eq' : 'NE'}`)
        .join(' '),
    );
    check(
      'no selector group in the coverage table disagreed with its stylesheet',
      groupValidation.every((g) => g.ok),
      `${groupValidation.filter((g) => g.ok).length}/${groupValidation.length} group(s) validated`,
    );
  } catch (e) {
    stepError(e);
  }

  // ------------------------------------------------------------------ KS-8
  try {
    step('KS-8', 'Safety: the real ~/.claude/settings.json was never written');
    const after = sha256OrNull(realSettings);
    check(
      'the real settings.json is byte-identical (sha256) to before the run',
      realSettingsBefore === after,
      realSettingsBefore === null && after === null
        ? 'no real settings.json exists on this machine; absent before and after'
        : `before=${String(realSettingsBefore).slice(0, 16)} after=${String(after).slice(0, 16)}`,
    );
    const backups = existsSync(join(homedir(), '.claude'))
      ? readdirSync(join(homedir(), '.claude')).filter((f) => /settings\.json\.(bak|backup|orc)/.test(f))
      : [];
    check('no stray settings backup appeared beside it', backups.length === 0, backups.join(', ') || 'none');
    // POSITIVE CONTROL for that "found nothing": the same predicate over a
    // directory listing that DOES contain such a name must report it.
    const controlNames = ['settings.json', 'settings.json.bak'];
    check(
      'CONTROL: the same backup predicate FLAGS a listing containing settings.json.bak',
      controlNames.filter((f) => /settings\.json\.(bak|backup|orc)/.test(f)).length === 1,
      controlNames.join(', '),
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
    scope: 'Keyword hairline sweep — 6 converted `thin` border widths, plus the grouped-selector declaration',
    repoRoot,
    sandboxRoot: sandbox.root,
    builtCss: `out/renderer/assets/${built.file}`,
    build: 'out/main/index.js',
    electron: process.versions.electron ?? 'via playwright _electron',
    playwright: 'devDependency, resolved from the repository root',
    hashes,
    harnessFaults,
    reference,
    declaredOnePxReference: ONE,
    groupValidation,
    countProvenance: {
      'checks total/failed/errored': 'counted by this driver over its own results array at report time',
      'swept element count': 'document.querySelectorAll("*").length at sweep time',
      'the declared-1px reference every border check uses':
        'measured at KS-1 on a synthetic element declaring border-width:1px in this window',
      '`thin` versus a declared `1px`':
        'measured at KS-1 on two synthetic elements alive in this window at the same moment',
      'enumerated / measured / unreached':
        "counted over this run's own coverage table, which lists every enumerated declaration",
      'selector groups validated':
        'read from the stylesheets on disk at KS-2 and compared with this driver\'s map',
    },
  };

  writeFileSync(
    join(REPORT_DIR, 'driven-report-keyword-sweep.json'),
    JSON.stringify({ meta, coverage, results, total, failed, errored }, null, 2),
    'utf8',
  );

  const md = [];
  md.push('# Driven hand-run — keyword hairline sweep', '');
  md.push(`Generated ${meta.generatedAt}`);
  md.push('');
  md.push(`**${total - failed}/${total} checks passed.** ${errored} step(s) errored.`);
  md.push('');
  md.push('Every number in this file was produced by the run that wrote it:', '');
  md.push('| Count | Produced by |');
  md.push('|---|---|');
  for (const [k, v] of Object.entries(meta.countProvenance)) md.push(`| ${k} | ${v} |`);
  md.push('');
  md.push(`- repoRoot launched: \`${meta.repoRoot}\``);
  md.push(`- sandbox root: \`${meta.sandboxRoot}\``);
  md.push(`- built renderer CSS: \`${meta.builtCss}\``);
  md.push('');
  if (reference) {
    md.push('## The reference this run measured against', '');
    md.push(
      'No pixel literal is an expectation anywhere in this run. Every border below is an ' +
        'EQUALITY against the used width of a synthetic element DECLARING `1px`, measured in ' +
        'this same window. `thin` and that declared `1px` were measured side by side, on two ' +
        'elements alive in the document at the same moment.',
      '',
    );
    md.push('| Declared | Used width measured in this window |');
    md.push('|---|---|');
    md.push(`| \`border-width: thin\` | \`${reference.keywordThin}\` |`);
    md.push(`| \`border-width: 1px\` | \`${reference.declaredOnePx}\` |`);
    md.push(`| \`border-width: var(--oc-border-hairline)\` | \`${reference.viaToken}\` |`);
    md.push(`| \`border-width: medium\` | \`${reference.keywordMedium}\` |`);
    md.push(`| \`border-width: thick\` | \`${reference.keywordThick}\` |`);
    for (const [k, v] of Object.entries(reference.ladder)) md.push(`| \`border-width: ${k}\` | \`${v}\` |`);
    md.push('');
    md.push(`\`devicePixelRatio\` reported by this window: \`${reference.devicePixelRatio}\``, '');
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
  md.push('## Coverage — one row per converted DECLARATION', '');
  md.push('| Stylesheet | Line | Selector group | Sides | Contract site? | Status | Resolved via | Measured value / reason |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const [file, rows] of Object.entries(coverage)) {
    for (const r of rows) {
      md.push(
        `| \`${file}\` | ${r.line} | ${r.selectors.map((s) => '`.' + s + '`').join(', ')} | ` +
          `${r.sides.join('/')} | ${r.inContract ? 'yes' : 'no — the grouped-selector demonstration'} | ` +
          `${r.status} | ${r.status === 'measured' ? '`.' + r.selectorResolved + '`' : '—'} | ` +
          `${r.status === 'measured' ? '`' + r.value + '`' : r.reason} |`,
      );
    }
  }
  md.push('');
  md.push('## Selector groups, as read off the stylesheets', '');
  md.push('| Declaration | Group in this driver | Group in the stylesheet | Agrees |');
  md.push('|---|---|---|---|');
  for (const g of groupValidation) {
    md.push(
      `| \`${g.file}:${g.line}\` | {${g.declared.join(', ')}} | {${(g.found ?? []).join(', ')}} | ${g.ok ? 'yes' : '**NO**'} |`,
    );
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
  writeFileSync(join(REPORT_DIR, 'driven-report-keyword-sweep.md'), md.join('\n'), 'utf8');

  console.log(`\n==== KEYWORD SWEEP RUN: ${total - failed}/${total} checks passed, ${errored} step error(s) ====`);
  console.log(`     sandbox: ${sandbox.root}`);
  console.log('     report: driven-report-keyword-sweep.md / .json');
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
