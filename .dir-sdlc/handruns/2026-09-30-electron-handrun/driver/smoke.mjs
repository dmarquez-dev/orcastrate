/**
 * Proof of concept, and the one check everything else depends on.
 *
 *   1. Playwright can launch and attach to this Electron app.
 *   2. `USERPROFILE` redirection really moves the app's `CLAUDE_HOME` — proved
 *      from the path the UI itself renders, not from the env we set.
 *   3. The real `~/.claude` is untouched.
 *
 * NOTE ON PROBING THE HOME. `app.getPath('home')` is NOT the right question:
 * Electron resolves it through the Windows shell API and returns the real
 * profile even when `USERPROFILE` is redirected. The app uses `os.homedir()`,
 * which DOES read the env var. Verified directly:
 *     USERPROFILE=C:\oc-sandbox\home node -e "console.log(os.homedir())"
 *       -> C:\oc-sandbox\home
 * So this script asserts on `process.env.USERPROFILE` as seen by main, and —
 * the claim that actually matters — on the absolute settings path Helm renders.
 */
import { _electron as electron } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

import { buildSandbox, writeSettings, BASELINE_SETTINGS } from './sandbox.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
// Short root, deliberately: the Pod-blocking fixture's directory name is the
// ENCODING of its cwd, so a deep sandbox path would produce a ~120-character
// directory name and risk Windows MAX_PATH. Teardown removes the whole tree.
const sandboxRoot = 'C:\\oc-sandbox';
const shots = join(here, '..', 'screenshots');

const realClaude = join(homedir(), '.claude');
const realSettings = join(realClaude, 'settings.json');
const realBefore = existsSync(realSettings) ? readFileSync(realSettings, 'utf8') : null;

console.log('=== smoke: can we drive this app at all? ===\n');

const sandbox = buildSandbox(sandboxRoot);
writeSettings(sandbox, BASELINE_SETTINGS);

console.log('sandbox .claude :', sandbox.claude);
console.log('encoded fixture :', sandbox.encodedBlocked);
console.log('its lossy decode:', sandbox.decodedGuess);
console.log('real Pod cwd    :', sandbox.blockedRepo);
console.log(
  'guess != real   :',
  sandbox.decodedGuess !== sandbox.blockedRepo ? 'YES (test is meaningful)' : 'NO (vacuous!)',
);

const app = await electron.launch({
  args: [join(repoRoot, 'out', 'main', 'index.js')],
  cwd: repoRoot,
  env: sandbox.env,
});

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

try {
  const seen = await app.evaluate(async ({ app: electronApp }) => ({
    envUserProfile: process.env.USERPROFILE,
    userData: electronApp.getPath('userData'),
    shellHome: electronApp.getPath('home'),
  }));

  console.log('\n--- as seen from inside the main process ---');
  console.log('process.env.USERPROFILE :', seen.envUserProfile);
  console.log('app.getPath(userData)   :', seen.userData);
  console.log('app.getPath(home)       :', seen.shellHome, '  <- shell API, not env');
  console.log('');

  check('main sees the sandbox USERPROFILE', seen.envUserProfile === sandbox.home, seen.envUserProfile);
  check('userData moved into the sandbox', seen.userData.startsWith(sandbox.root), seen.userData);

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('[data-testid="panel-bar"]', { timeout: 20000 });
  check('window opened and renderer mounted', true, await win.title());

  await win.screenshot({ path: join(shots, 'smoke-01-launch.png') });

  // Ids are `base:suffix` via `testId()` in shell/contract-runtime.ts.
  await win.getByTestId('panel-bar-open:helm').click();
  await win.waitForSelector('[data-testid="helm-panel"]', { timeout: 10000 });
  await win.screenshot({ path: join(shots, 'smoke-02-helm-unchosen.png') });

  const unchosen = await win.getByTestId('helm-panel').innerText();
  check('unchosen state tells the user to choose', unchosen.includes('Choose a settings file above to start editing.'));

  // THE END-TO-END PROOF. This path originates in main's CLAUDE_HOME, crosses
  // IPC through the scope table, and lands in the DOM.
  await win.getByTestId('helm-scope-select').selectOption({ label: 'All projects — This machine' });
  await win.waitForTimeout(1200);

  const scopePath = await win.getByTestId('helm-scope-path').innerText();
  console.log('\nHelm renders File =', scopePath.trim());

  check('Helm shows the SANDBOX settings path', scopePath.includes(sandbox.claude), scopePath.trim());
  check('Helm does NOT show the real home', !scopePath.includes(realClaude));

  const model = await win.getByTestId('helm-model').inputValue();
  check('baseline fixture loaded into the form', model === 'claude-opus-5', `model="${model}"`);

  await win.screenshot({ path: join(shots, 'smoke-03-helm-loaded.png'), fullPage: true });

  // Beachcomber: do the fixtures show up, and is the crown-jewel row present?
  await win.getByTestId('panel-bar-open:beachcomber').click();
  await win.waitForSelector('[data-testid="beachcomber-panel"]', { timeout: 15000 });
  await win.waitForTimeout(2500);
  const bc = await win.getByTestId('beachcomber-panel').innerText();

  check('Beachcomber lists the encoded fixture', bc.includes(sandbox.encodedBlocked));
  check('Beachcomber lists oc-test-recorded', bc.includes('oc-test-recorded'));
  check('Beachcomber lists oc-test-orphan', bc.includes('oc-test-orphan'));
  check('the unverified notice is present somewhere', bc.includes('is a guess'));

  await win.screenshot({ path: join(shots, 'smoke-04-beachcomber.png'), fullPage: true });
  console.log('\nscreenshots written to screenshots/');
} finally {
  await app.close();
}

const realAfter = existsSync(realSettings) ? readFileSync(realSettings, 'utf8') : null;
check('real ~/.claude/settings.json byte-identical', realAfter === realBefore);

console.log(`\n=== ${failures === 0 ? 'SMOKE PASSED' : `SMOKE FAILED (${failures} failures)`} ===`);
process.exit(failures === 0 ? 0 : 1);
