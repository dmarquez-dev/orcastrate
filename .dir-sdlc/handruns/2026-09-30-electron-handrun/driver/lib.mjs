/** Shared harness: launching, asserting, screenshotting, reporting. */
import { _electron as electron } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..', '..', '..', '..');
export const shotsDir = join(here, '..', 'screenshots');
export const reportDir = join(here, '..');
mkdirSync(shotsDir, { recursive: true });

export const results = [];
let currentStep = null;

/** Opens a step. Every assertion until the next `step()` belongs to it. */
export function step(id, title) {
  currentStep = { id, title, checks: [], notes: [], shots: [], error: null };
  results.push(currentStep);
  console.log(`\n--- ${id}  ${title}`);
  return currentStep;
}

export function check(label, ok, detail = '') {
  const entry = { label, ok: Boolean(ok), detail: String(detail ?? '') };
  (currentStep?.checks ?? []).push(entry);
  console.log(`    ${entry.ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  return entry.ok;
}

export function note(text) {
  currentStep?.notes.push(text);
  console.log(`    note: ${text}`);
}

export function stepError(err) {
  const msg = String(err?.message ?? err).split('\n')[0];
  if (currentStep) currentStep.error = msg;
  console.log(`    ERROR  ${msg}`);
}

export async function shot(win, name) {
  const file = join(shotsDir, `${name}.png`);
  await win.screenshot({ path: file, fullPage: true }).catch(() => {});
  currentStep?.shots.push(`screenshots/${name}.png`);
  return file;
}

export async function launch(sandbox) {
  const app = await electron.launch({
    args: [join(repoRoot, 'out', 'main', 'index.js')],
    cwd: repoRoot,
    env: sandbox.env,
    timeout: 60000,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 30000 });
  return { app, win };
}

/** Opens a panel by key, waiting for its region to mount. */
export async function openPanel(win, key) {
  await win.getByTestId(`panel-bar-open:${key}`).click();
  await win.waitForSelector(`[data-testid="${key}-panel"]`, { timeout: 15000 });
}

/** Chooses the user scope and waits for the document to load. */
export async function loadUserScope(win) {
  await win.getByTestId('helm-scope-select').selectOption({ label: 'All projects — This machine' });
  await win.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="helm-model"]');
      return el !== null && !el.disabled;
    },
    undefined,
    { timeout: 15000 },
  );
}

/** Creates a Pod through the preload bridge, bypassing the native picker.
 *  `createPod` spawns nothing — it validates the cwd and writes a store record
 *  — which is why Pod-dependent behaviour is reachable without a `claude`
 *  process. */
export async function createPod(win, title, cwd) {
  return win.evaluate(
    async ({ title, cwd }) =>
      window.orcastrate.pods.create({ title, cwd, permissionMode: 'default' }),
    { title, cwd },
  );
}

export async function rescanBeachcomber(win) {
  await win.getByTestId('beachcomber-rescan').click();
  await win.waitForTimeout(2500);
}

/** Document-order test: does `a` come before `b` in the rendered DOM? */
export async function precedes(win, selectorA, selectorB) {
  return win.evaluate(
    ({ a, b }) => {
      const x = document.querySelector(a);
      const y = document.querySelector(b);
      if (!x || !y) return null;
      return Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    },
    { a: selectorA, b: selectorB },
  );
}

export function writeReport(meta) {
  const total = results.reduce((n, s) => n + s.checks.length, 0);
  const failed = results.reduce((n, s) => n + s.checks.filter((c) => !c.ok).length, 0);
  const errored = results.filter((s) => s.error).length;

  writeFileSync(
    join(reportDir, 'driven-report.json'),
    JSON.stringify({ meta, results, total, failed, errored }, null, 2),
    'utf8',
  );

  const md = [];
  md.push('# Driven hand-run — results', '');
  md.push(`Generated ${meta.generatedAt}`);
  md.push(`Build \`${meta.build}\` · Electron ${meta.electron} · Playwright ${meta.playwright}`);
  md.push('');
  md.push(`**${total - failed}/${total} checks passed.** ${errored} step(s) errored.`);
  md.push('');
  md.push('| Step | Title | Checks | Verdict |');
  md.push('|---|---|---|---|');
  for (const s of results) {
    const bad = s.checks.filter((c) => !c.ok).length;
    const verdict = s.error ? 'ERROR' : bad === 0 ? (s.checks.length ? 'PASS' : 'n/a') : `FAIL (${bad})`;
    md.push(`| ${s.id} | ${s.title} | ${s.checks.length} | ${verdict} |`);
  }
  md.push('');
  for (const s of results) {
    const bad = s.checks.filter((c) => !c.ok);
    if (!bad.length && !s.error && !s.notes.length) continue;
    md.push(`## ${s.id} — ${s.title}`, '');
    if (s.error) md.push(`**Step errored:** \`${s.error}\``, '');
    for (const c of bad) md.push(`- **FAIL** ${c.label}${c.detail ? ` — \`${c.detail}\`` : ''}`);
    for (const n of s.notes) md.push(`- note: ${n}`);
    if (s.shots.length) md.push('', ...s.shots.map((p) => `  - \`${p}\``));
    md.push('');
  }
  writeFileSync(join(reportDir, 'driven-report.md'), md.join('\n'), 'utf8');

  return { total, failed, errored };
}
