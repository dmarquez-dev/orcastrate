/**
 * C3 verification run — the three things sub-session C3 changed, driven in the
 * real Electron window.
 *
 * C3 shipped: two additions-only theme tokens (`--oc-weight-semibold`,
 * `--oc-overlay-scrim`), nineteen converted call sites, and `PanelBar` moved
 * from `aria-pressed` to `aria-current`. Every one of those was confirmed by
 * grep, by a two-sided hygiene census and by a green 2240-test suite — and none
 * of it was ever rendered. This script renders it.
 *
 * Three checks here cannot be done in jsdom, and they are the reason this run
 * exists:
 *
 *   1. DOES THE SCRIM ACTUALLY COMPOSITE? `background: var(--oc-overlay-scrim)`
 *      resolving to a `color-mix()` with alpha proves the declaration, not the
 *      pixels. The discriminator used here is decoder-free: with the dialog open,
 *      screenshot two equal-sized regions of scrim that have DIFFERENT content
 *      behind them. An opaque scrim renders both as the same flat colour, so the
 *      two PNGs are byte-identical. A translucent one lets the differing content
 *      through, so they differ. That distinguishes veiling from hiding by
 *      observation rather than by reading back the CSS we just wrote.
 *   2. DOES THE RENAMED ATTRIBUTE STILL PAINT? The `aria-pressed` ->
 *      `aria-current` swap touched the component AND the stylesheet's
 *      `.button[aria-current='true']` selector. If only the component had
 *      changed, every renderer test would still pass and the open panel would
 *      silently lose its highlight. Comparing computed backgrounds of the open
 *      and closed buttons catches exactly that.
 *   3. DO THE HEADINGS COMPUTE TO 600? A bare `600` and
 *      `var(--oc-weight-semibold)` are indistinguishable in a passing unit test.
 *      In the window, a token that failed to resolve computes to the inherited
 *      weight instead, which is observable.
 *
 * Run `npm run build` first; this launches `out/main/index.js`.
 */
import { rmSync, renameSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  launch,
  openPanel,
  createPod,
  step,
  check,
  note,
  stepError,
  shot,
  writeReport,
  results,
  repoRoot,
  shotsDir,
} from './lib.mjs';
import { buildSandbox, writeSettings, BASELINE_SETTINGS } from './sandbox.mjs';

const SANDBOX_ROOT = 'C:\\oc-sandbox';

/** Parses `rgb(r, g, b)` / `rgba(r, g, b, a)` / `color(srgb r g b / a)`. */
function parseColor(css) {
  if (typeof css !== 'string') return null;
  const srgb = css.match(
    /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/i,
  );
  if (srgb) {
    return {
      r: Math.round(Number(srgb[1]) * 255),
      g: Math.round(Number(srgb[2]) * 255),
      b: Math.round(Number(srgb[3]) * 255),
      a: srgb[4] === undefined ? 1 : Number(srgb[4]),
    };
  }
  const rgb = css.match(/rgba?\(([^)]+)\)/i);
  if (!rgb) return null;
  const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

/** The computed style of an element located by test id. */
function computedOf(win, testid, props) {
  return win.evaluate(
    ({ testid, props }) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = {};
      for (const p of props) out[p] = cs.getPropertyValue(p);
      return out;
    },
    { testid, props },
  );
}

/** The computed style of a dialog's SCRIM — its parent element. The scrims
 *  carry no test id, and the parent relationship is stable against the class
 *  name hashing CSS Modules applies in a production build. */
function scrimOf(win, dialogTestid, props) {
  return win.evaluate(
    ({ dialogTestid, props }) => {
      const dialog = document.querySelector(`[data-testid="${dialogTestid}"]`);
      const el = dialog?.parentElement ?? null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = { className: String(el.className) };
      for (const p of props) out[p] = cs.getPropertyValue(p);
      const r = el.getBoundingClientRect();
      out.rect = { x: r.x, y: r.y, width: r.width, height: r.height };
      const dr = dialog.getBoundingClientRect();
      out.dialogRect = { x: dr.x, y: dr.y, width: dr.width, height: dr.height };
      return out;
    },
    { dialogTestid, props },
  );
}

/**
 * The compositing test. Two equal-sized clips of scrim with different content
 * behind them: byte-identical PNGs mean the scrim painted over both with one
 * flat colour (opaque); differing PNGs mean content showed through.
 *
 * Clips are taken to the LEFT of the dialog box, which is centred — the left
 * edge of the window there holds the lane rail and the pod bar, so the two
 * vertical positions genuinely differ underneath.
 */
async function compositingProbe(win, name, dialogRect) {
  const size = 24;
  const x = Math.max(2, Math.round(dialogRect.x / 2) - size);
  const hi = { x, y: 48, width: size, height: size };
  const lo = { x, y: 220, width: size, height: size };
  const a = await win.screenshot({ clip: hi });
  const b = await win.screenshot({ clip: lo });
  const identical = Buffer.compare(a, b) === 0;
  return { identical, hi, lo, bytes: [a.length, b.length] };
}

async function main() {
  rmSync(join(shotsDir, 'c3'), { recursive: true, force: true });
  const sandbox = buildSandbox(SANDBOX_ROOT);
  writeSettings(sandbox, BASELINE_SETTINGS);

  const { app, win } = await launch(sandbox);
  await win.setViewportSize?.({ width: 1280, height: 860 }).catch(() => {});

  const tokens = await win.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      semibold: cs.getPropertyValue('--oc-weight-semibold').trim(),
      overlay: cs.getPropertyValue('--oc-overlay-scrim').trim(),
      bgApp: cs.getPropertyValue('--oc-bg-app').trim(),
      weightBold: cs.getPropertyValue('--oc-weight-bold').trim(),
      weightRegular: cs.getPropertyValue('--oc-weight-regular').trim(),
    };
  });

  // ---------------------------------------------------------------- C3-1
  try {
    step('C3-1', 'Both new tokens resolve on :root in the real window');
    check('--oc-weight-semibold resolves to 600', tokens.semibold === '600', tokens.semibold);
    check('--oc-overlay-scrim is defined', tokens.overlay.length > 0, tokens.overlay);
    check(
      '--oc-overlay-scrim derives from --oc-bg-app rather than a literal',
      /var\(\s*--oc-bg-app\s*\)/.test(tokens.overlay) || /color-mix/i.test(tokens.overlay),
      tokens.overlay,
    );
    check(
      'the pre-existing weight ramp is untouched (additions-only)',
      tokens.weightRegular === '400' && tokens.weightBold === '700',
      `regular=${tokens.weightRegular} bold=${tokens.weightBold}`,
    );
    note(`--oc-bg-app = ${tokens.bgApp}`);
  } catch (e) {
    stepError(e);
  }

  // ---------------------------------------------------------------- C3-2
  // EmptyWorkspace is on screen before any Pod exists.
  try {
    step('C3-2', 'Live-DOM weight census — converted selectors at 600, ramp respected');
    // CSS Modules keeps the semantic name in production (`_heading_1g64o_65`),
    // so the converted selectors are still findable in the built bundle.
    const census = await win.evaluate(() => {
      const CONVERTED = [
        'heading', 'railHeading', 'agentType', 'subject',
        'bypassWarning', 'paneTitle', 'dispatchCount', 'dispatchAgentType',
      ];
      const hits = [];
      const weights = new Set();
      for (const el of document.querySelectorAll('*')) {
        const w = getComputedStyle(el).fontWeight;
        weights.add(w);
        const cls = typeof el.className === 'string' ? el.className : '';
        for (const name of CONVERTED) {
          if (new RegExp('(^|\\s|_)' + name + '_').test(cls)) {
            hits.push({ name, cls, weight: w, text: (el.innerText || '').slice(0, 34) });
            break;
          }
        }
      }
      return { hits, weights: [...weights].sort() };
    });

    note(`distinct computed font-weights in the live DOM: ${census.weights.join(', ')}`);
    check(
      'at least one C3-converted selector is on screen to judge',
      census.hits.length > 0,
      `${census.hits.length} element(s): ${[...new Set(census.hits.map((h) => h.name))].join(', ')}`,
    );
    const wrong = census.hits.filter((h) => h.weight !== '600');
    check(
      'every rendered C3-converted selector computes font-weight 600',
      wrong.length === 0,
      wrong.length ? wrong.map((h) => `${h.name}=${h.weight}`).join(' ') : `all ${census.hits.length} at 600`,
    );
    // A token that failed to resolve would compute to the inherited weight, so
    // an off-ramp value anywhere is the observable symptom of a broken token.
    const offRamp = census.weights.filter((w) => !['400', '500', '600', '700'].includes(w));
    check(
      'no element computes a weight outside the 400/500/600/700 ramp',
      offRamp.length === 0,
      offRamp.length ? `off-ramp: ${offRamp.join(', ')}` : 'ramp respected',
    );
    await shot(win, 'c3/01-empty-workspace');
  } catch (e) {
    stepError(e);
  }

  // ---------------------------------------------------------------- C3-3
  // NewPodDialog: heading, and the bypass warning that also took the token.
  try {
    step('C3-3', 'NewPodDialog — scrim veils, heading and bypass warning at 600');
    await win.getByTestId('new-pod-button').click();
    await win.waitForSelector('[data-testid="new-pod-dialog"]', { timeout: 10000 });

    const scrim = await scrimOf(win, 'new-pod-dialog', ['background-color', 'position', 'inset']);
    const col = parseColor(scrim?.['background-color']);
    check('scrim found as the dialog parent', scrim !== null, scrim?.className ?? '');
    check('scrim is position:fixed full-window', scrim?.position === 'fixed', `${scrim?.position} inset=${scrim?.inset}`);
    check(
      'scrim background has alpha strictly between 0 and 1',
      col !== null && col.a > 0 && col.a < 1,
      scrim?.['background-color'],
    );

    const probe = await compositingProbe(win, 'newpod', scrim.dialogRect);
    check(
      'COMPOSITING: two scrim regions with different content behind them differ',
      probe.identical === false,
      probe.identical
        ? 'byte-identical -> the scrim painted flat over both (opaque)'
        : `differ (${probe.bytes[0]}B vs ${probe.bytes[1]}B) -> content shows through`,
    );

    const weights = await win.evaluate(() => {
      const dlg = document.querySelector('[data-testid="new-pod-dialog"]');
      const out = {};
      const h = dlg?.querySelector('h1,h2,h3,[class*="heading"]');
      if (h) out.heading = { text: (h.innerText || '').slice(0, 40), weight: getComputedStyle(h).fontWeight };
      const w = document.querySelector('[data-testid="new-pod-bypass-warning"]');
      if (w) out.warning = { text: (w.innerText || '').slice(0, 40), weight: getComputedStyle(w).fontWeight };
      return out;
    });
    if (weights.heading) {
      check('dialog heading computes 600', weights.heading.weight === '600', `"${weights.heading.text}" -> ${weights.heading.weight}`);
    } else {
      note('dialog heading not located by selector; skipped');
    }
    if (weights.warning) {
      check('bypass warning computes 600', weights.warning.weight === '600', `-> ${weights.warning.weight}`);
    } else {
      note('bypass warning not rendered in default permission mode; not asserted');
    }

    await shot(win, 'c3/02-newpod-dialog-veiled');

    // THE INSTRUMENT VALIDATION, run here rather than at the end. If the
    // compositing probe cannot tell an opaque surface from a translucent one,
    // every COMPOSITING check in this run is worthless — so it is validated on
    // the first dialog that opens, before any stateful step can block it. The
    // first attempt at this run put it last and a modal scrim from an earlier
    // step swallowed the click, leaving four compositing PASSes unvalidated.
    await win.evaluate(() => {
      const dlg = document.querySelector('[data-testid="new-pod-dialog"]');
      const el = dlg?.parentElement;
      if (el) el.style.background = getComputedStyle(document.documentElement).getPropertyValue('--oc-bg-app');
    });
    await win.waitForTimeout(300);
    const forced = await compositingProbe(win, 'control-opaque', scrim.dialogRect);
    check(
      'CONTROL: forced OPAQUE, the same two regions become byte-identical',
      forced.identical === true,
      forced.identical
        ? 'identical -> the probe DOES detect opacity, so every COMPOSITING check here is meaningful'
        : `still differ (${forced.bytes[0]}B vs ${forced.bytes[1]}B) -> PROBE INVALID, discard the compositing results`,
    );
    await shot(win, 'c3/02b-control-forced-opaque');
    await win.evaluate(() => {
      const dlg = document.querySelector('[data-testid="new-pod-dialog"]');
      const el = dlg?.parentElement;
      if (el) el.style.background = '';
    });

    // NewPodDialog's Cancel button carries no test id, so Escape is the handle.
    await win.keyboard.press('Escape');
    await win.waitForTimeout(400);
  } catch (e) {
    stepError(e);
  }

  // ---------------------------------------------------------------- C3-4
  // DeletePodDialog needs a Pod. createPod spawns nothing.
  try {
    step('C3-4', 'DeletePodDialog — scrim veils, heading and subject at 600');
    // `createPod` validates the cwd, so it must be a real directory.
    // `buildSandbox` creates `repos\plain-repo`; the `.claude\projects\*` dirs
    // are session records, not working directories, and fail with CWD_MISSING.
    const made = await createPod(win, 'oc-c3-pod', SANDBOX_ROOT + '\\repos\\plain-repo');
    note(`createPod -> ${JSON.stringify(made).slice(0, 120)}`);
    check('createPod succeeded', made?.ok === true, JSON.stringify(made?.error ?? '').slice(0, 80));

    // `createPod` through the preload bridge writes the store without pushing
    // to the renderer, so the pod bar does not learn about it. The earlier
    // harness never hit this because Beachcomber's Pod blocking reads
    // `listPods()` in the MAIN process. A reload re-fetches the list from the
    // sandbox sqlite store, which is where the Pod now lives.
    await win.reload();
    await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 30000 });
    await win.waitForTimeout(1500);

    const opened = await win.evaluate(() => {
      const tabs = [...document.querySelectorAll('[data-testid^="pod-tab:"]')];
      return tabs.length;
    });
    check('a Pod tab is rendered after createPod', opened > 0, `${opened} tab(s)`);

    const closeBtn = await win.evaluate(() => {
      const el = document.querySelector('[data-testid^="pod-tab-delete:"]');
      return el ? el.getAttribute('data-testid') : null;
    });
    if (closeBtn) {
      await win.getByTestId(closeBtn).click();
      await win.waitForSelector('[data-testid="delete-pod-dialog"]', { timeout: 10000 });

      const scrim = await scrimOf(win, 'delete-pod-dialog', ['background-color', 'position']);
      const col = parseColor(scrim?.['background-color']);
      check(
        'scrim background has alpha strictly between 0 and 1',
        col !== null && col.a > 0 && col.a < 1,
        scrim?.['background-color'],
      );
      const probe = await compositingProbe(win, 'deletepod', scrim.dialogRect);
      check(
        'COMPOSITING: scrim regions over different content differ',
        probe.identical === false,
        probe.identical ? 'byte-identical -> opaque' : `differ (${probe.bytes[0]}B vs ${probe.bytes[1]}B)`,
      );

      const w = await win.evaluate(() => {
        const dlg = document.querySelector('[data-testid="delete-pod-dialog"]');
        const h = dlg?.querySelector('h1,h2,h3,[class*="heading"]');
        const s = document.querySelector('[data-testid="delete-pod-session"]');
        return {
          heading: h ? { text: (h.innerText || '').slice(0, 40), weight: getComputedStyle(h).fontWeight } : null,
          subject: s ? { text: (s.innerText || '').slice(0, 40), weight: getComputedStyle(s).fontWeight } : null,
        };
      });
      if (w.heading) check('delete heading computes 600', w.heading.weight === '600', `"${w.heading.text}" -> ${w.heading.weight}`);
      if (w.subject) check('delete subject computes 600', w.subject.weight === '600', `-> ${w.subject.weight}`);

      await shot(win, 'c3/03-deletepod-dialog-veiled');
      await win.getByTestId('delete-pod-cancel').click().catch(() => {});
      await win.waitForTimeout(400);
    } else {
      check('a delete control is reachable on the Pod tab', false, 'no pod-tab-delete testid found');
    }
  } catch (e) {
    stepError(e);
  }

  // ---------------------------------------------------------------- C3-5
  try {
    step('C3-5', 'PanelBar: aria-current carries open state AND still paints it');
    await openPanel(win, 'helm');

    const aria = await win.evaluate(() => {
      const btns = [...document.querySelectorAll('[data-testid^="panel-bar-open:"]')];
      return btns.map((b) => ({
        key: (b.getAttribute('data-testid') || '').split(':')[1],
        current: b.getAttribute('aria-current'),
        pressed: b.getAttribute('aria-pressed'),
        bg: getComputedStyle(b).backgroundColor,
        borderColor: getComputedStyle(b).borderColor,
      }));
    });
    note(`panel buttons: ${JSON.stringify(aria)}`);

    const open = aria.filter((b) => b.current === 'true');
    check('exactly one panel button reports aria-current="true"', open.length === 1, `${open.length}`);
    check('the open one is helm', open[0]?.key === 'helm', open[0]?.key ?? 'none');
    check(
      'NO panel button carries aria-pressed any more',
      aria.every((b) => b.pressed === null),
      aria.map((b) => `${b.key}=${b.pressed}`).join(' '),
    );

    const closed = aria.filter((b) => b.current !== 'true');
    check('the closed buttons are distinguishable from the open one', closed.length > 0, `${closed.length} closed`);
    check(
      'PAINT: the open button renders a different background than a closed one',
      closed.length > 0 && open.length === 1 && open[0].bg !== closed[0].bg,
      `open=${open[0]?.bg} closed=${closed[0]?.bg}`,
    );
    note(
      'That paint check is the one jsdom cannot make: the attribute rename also ' +
        'had to move the stylesheet selector, and had it not, every renderer test ' +
        'would still pass while the open panel lost its highlight.',
    );
    await shot(win, 'c3/04-panelbar-aria-current');
  } catch (e) {
    stepError(e);
  }

  // ---------------------------------------------------------------- C3-6
  try {
    step('C3-6', 'Helm close-confirmation scrim veils the window');
    // A dirty draft is what makes the close confirmation appear.
    await win
      .getByTestId('helm-scope-select')
      .selectOption({ label: 'All projects — This machine' })
      .catch(() => {});
    await win.waitForTimeout(1500);
    const model = win.getByTestId('helm-model');
    await model.fill('claude-sonnet-5').catch(() => {});
    await win.waitForTimeout(400);
    await win.getByTestId('panel-bar-close').click().catch(() => {});
    const appeared = await win
      .waitForSelector('[data-testid="helm-close-confirm"]', { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check('the close confirmation appeared on a dirty draft', appeared, appeared ? '' : 'not shown');

    if (appeared) {
      const scrim = await scrimOf(win, 'helm-close-confirm', ['background-color', 'position']);
      const col = parseColor(scrim?.['background-color']);
      check(
        'confirmScrim background has alpha strictly between 0 and 1',
        col !== null && col.a > 0 && col.a < 1,
        scrim?.['background-color'],
      );
      const probe = await compositingProbe(win, 'helmconfirm', scrim.dialogRect);
      check(
        'COMPOSITING: confirmScrim lets differing content through',
        probe.identical === false,
        probe.identical ? 'byte-identical -> opaque' : `differ (${probe.bytes[0]}B vs ${probe.bytes[1]}B)`,
      );
      await shot(win, 'c3/05-helm-close-confirm-veiled');
      // DISCARD, not keep. "Keep" preserves the dirty draft AND the open panel,
      // so the close guard re-fires on every later panel switch and its own
      // full-window scrim then blocks every subsequent click. That is correct
      // app behaviour and it broke two later steps on the first attempt.
      await win.getByTestId('helm-close-confirm-discard').click().catch(() => {});
      await win.waitForTimeout(800);
      const stillGuarded = await win
        .waitForSelector('[data-testid="helm-close-confirm"]', { timeout: 1500, state: 'detached' })
        .then(() => false)
        .catch(() => true);
      check('the draft was discarded, so nothing blocks later steps', stillGuarded === false, stillGuarded ? 'confirm still on screen' : 'cleared');
    }
  } catch (e) {
    stepError(e);
  }

  // ---------------------------------------------------------------- C3-7
  try {
    step('C3-7', 'Beachcomber preview scrim veils the window');
    await openPanel(win, 'beachcomber');
    await win.getByTestId('beachcomber-rescan').click().catch(() => {});
    await win.waitForTimeout(2500);
    // The preview button is ONE toolbar control, `disabled` until a row is
    // selected — not a per-row button. Select a row first or it is unclickable.
    const selected = await win.evaluate(() => {
      const box = document.querySelector('[data-testid^="beachcomber-row-select"]');
      if (!box) return null;
      box.click();
      return box.getAttribute('data-testid');
    });
    check('a Beachcomber row could be selected', selected !== null, selected ?? 'no row-select control found');
    await win.waitForTimeout(600);
    const row = await win.evaluate(() => {
      const el = document.querySelector('[data-testid="beachcomber-preview-button"]');
      return el && !el.disabled ? 'beachcomber-preview-button' : null;
    });
    if (!row) {
      note('preview button absent or still disabled; the preview scrim was not exercised');
      check('the preview button is enabled after selecting a row', false, 'disabled or missing');
    } else {
      await win.getByTestId(row).click();
      await win.waitForSelector('[data-testid="beachcomber-preview-dialog"]', { timeout: 10000 });
      const scrim = await scrimOf(win, 'beachcomber-preview-dialog', ['background-color', 'position']);
      const col = parseColor(scrim?.['background-color']);
      check(
        'preview scrim background has alpha strictly between 0 and 1',
        col !== null && col.a > 0 && col.a < 1,
        scrim?.['background-color'],
      );
      const probe = await compositingProbe(win, 'preview', scrim.dialogRect);
      check(
        'COMPOSITING: preview scrim lets differing content through',
        probe.identical === false,
        probe.identical ? 'byte-identical -> opaque' : `differ (${probe.bytes[0]}B vs ${probe.bytes[1]}B)`,
      );
      await shot(win, 'c3/06-beachcomber-preview-veiled');
      await win.getByTestId('beachcomber-preview-cancel').click().catch(() => {});
    }
  } catch (e) {
    stepError(e);
  }

  // ---------------------------------------------------------------- C3-8
  // The negative control for the whole compositing method. If this probe cannot
  // tell an OPAQUE surface from a translucent one, every result above is void.
  try {
    step('C3-8', 'Positive control: the compositing probe can detect an opaque scrim');
    await win.getByTestId('new-pod-button').click();
    await win.waitForSelector('[data-testid="new-pod-dialog"]', { timeout: 10000 });
    const scrim = await scrimOf(win, 'new-pod-dialog', ['background-color']);

    const translucent = await compositingProbe(win, 'control-translucent', scrim.dialogRect);
    check(
      'with the shipped token, the two regions DIFFER',
      translucent.identical === false,
      translucent.identical ? 'identical' : 'differ',
    );

    // Force the scrim opaque in-page and re-probe the identical regions.
    await win.evaluate(() => {
      const dlg = document.querySelector('[data-testid="new-pod-dialog"]');
      const el = dlg?.parentElement;
      if (el) el.style.background = getComputedStyle(document.documentElement).getPropertyValue('--oc-bg-app');
    });
    await win.waitForTimeout(300);
    const opaque = await compositingProbe(win, 'control-opaque', scrim.dialogRect);
    check(
      'forced OPAQUE, the same two regions become byte-identical',
      opaque.identical === true,
      opaque.identical
        ? 'identical -> the probe does detect opacity, so the checks above are meaningful'
        : `still differ (${opaque.bytes[0]}B vs ${opaque.bytes[1]}B) -> PROBE IS NOT A VALID INSTRUMENT`,
    );
    await shot(win, 'c3/07-control-forced-opaque');
    await win.evaluate(() => {
      const dlg = document.querySelector('[data-testid="new-pod-dialog"]');
      const el = dlg?.parentElement;
      if (el) el.style.background = '';
    });
  } catch (e) {
    stepError(e);
  }

  await app.close().catch(() => {});

  // `writeReport` hardcodes `driven-report.*`, which belongs to the 2026-10-07
  // full run. Preserve that committed artifact: stash it, let writeReport run,
  // then move this run's output to its own name and put the original back. The
  // first pass of this script silently overwrote it.
  const reportDir = join(shotsDir, '..');
  const keep = [];
  for (const ext of ['json', 'md']) {
    const live = join(reportDir, `driven-report.${ext}`);
    const bak = join(reportDir, `.driven-report.${ext}.prec3`);
    if (existsSync(live)) {
      copyFileSync(live, bak);
      keep.push({ live, bak, ext });
    }
  }

  const { total, failed, errored } = writeReport({
    generatedAt: new Date().toISOString(),
    build: 'out/main/index.js',
    electron: process.versions.electron ?? 'via playwright _electron',
    playwright: 'local devDependency',
    scope: 'C3 verification — overlay scrim, semibold token, aria-current',
  });

  for (const { live, bak, ext } of keep) {
    renameSync(live, join(reportDir, `driven-report-c3.${ext}`));
    renameSync(bak, live);
  }

  console.log(`\n==== C3 RUN: ${total - failed}/${total} checks passed, ${errored} step error(s) ====`);
  console.log('     report: driven-report-c3.md / .json  (the 2026-10-07 report is left intact)');
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
