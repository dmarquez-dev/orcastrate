/**
 * The driven hand-run. Sections B–F of TESTPLAN.md, executed against a real
 * Electron window in a sandboxed home.
 *
 * Every step is independent enough that one failure does not abort the run.
 * Steps that could not be staged are recorded as such, never as passes.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { buildSandbox, writeSettings, BASELINE_SETTINGS } from './sandbox.mjs';
import {
  launch, openPanel, loadUserScope, createPod, rescanBeachcomber, precedes,
  step, check, note, stepError, shot, writeReport, repoRoot,
} from './lib.mjs';

const SANDBOX_ROOT = 'C:\\oc-sandbox';
const realSettings = join(homedir(), '.claude', 'settings.json');
const realBefore = existsSync(realSettings) ? readFileSync(realSettings, 'utf8') : null;

const sandbox = buildSandbox(SANDBOX_ROOT);
writeSettings(sandbox, BASELINE_SETTINGS);

const readSettings = () => readFileSync(sandbox.settingsPath, 'utf8');
const backups = () =>
  readdirSync(sandbox.claude).filter((n) => n.startsWith('settings.json.') && n.endsWith('.bak'));

let app, win;

try {
  ({ app, win } = await launch(sandbox));

  // ===================================================================== B
  await openPanel(win, 'helm');

  step('B2', 'The baseline document loads into the form');
  try {
    await loadUserScope(win);
    check('Model is the fixture value', (await win.getByTestId('helm-model').inputValue()) === 'claude-opus-5');
    const path = (await win.getByTestId('helm-scope-path').innerText()).trim();
    check('File row shows the sandbox settings path', path.includes(sandbox.claude), path);
    // These render as <input value=...>, which innerText never contains.
    const values = await win.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="helm-panel"] input')).map((i) => i.value));
    check('allow rules rendered', values.includes('Bash(npm run test:*)'), values.join(' | ').slice(0, 120));
    check('deny rule rendered', values.includes('Bash(rm -rf:*)'));
    check('env var rendered', values.includes('OC_HANDRUN'));
    await shot(win, 'B2-baseline-loaded');
  } catch (e) { stepError(e); }

  step('B3', 'A save writes the file and takes a backup  [NEW capability]');
  try {
    const before = readSettings();
    check('fixture marker present before save', before.includes('"baseline"'));
    // Edit the first env VALUE field.
    const envValue = win.getByTestId('helm-env-list').getByLabel('Value').first();
    await envValue.fill('wrote-once');
    await win.getByTestId('helm-save').click();
    await win.waitForTimeout(2000);

    const after = readSettings();
    check('settings.json now holds the new value', after.includes('wrote-once'), '');
    check('settings.json is still valid JSON', (() => { try { JSON.parse(after); return true; } catch { return false; } })());
    check('trailing newline preserved', after.endsWith('\n'));

    const b = backups();
    check('exactly one backup exists', b.length === 1, b.join(', '));
    if (b.length) {
      const backupBody = readFileSync(join(sandbox.claude, b[0]), 'utf8');
      check('the backup holds the PRE-save content', backupBody.includes('baseline'));
    }
    const panel = await win.getByTestId('helm-panel').innerText();
    check('a Saved banner is shown', panel.includes('Saved'));
    check('the backup path is surfaced to the user', panel.includes('Backup'));
    await shot(win, 'B3-saved');
  } catch (e) { stepError(e); }

  step('B4', 'A second save takes a second, distinct backup  [C2]');
  try {
    const envValue = win.getByTestId('helm-env-list').getByLabel('Value').first();
    await envValue.fill('wrote-twice');
    await win.getByTestId('helm-save').click();
    await win.waitForTimeout(2000);

    const b = backups();
    check('two backups now exist', b.length === 2, b.join(', '));
    check('their names are distinct', new Set(b).size === b.length);
    const bodies = b.map((n) => readFileSync(join(sandbox.claude, n), 'utf8'));
    check('their contents are distinct', new Set(bodies).size === bodies.length);
    check('one backup still holds the original baseline', bodies.some((x) => x.includes('baseline')));
    check('the other holds wrote-once', bodies.some((x) => x.includes('wrote-once')));
    check('live file holds wrote-twice', readSettings().includes('wrote-twice'));
    note('Same-millisecond collision is not reachable by hand; the unit suite covers it with an injected clock.');
    await shot(win, 'B4-second-save');
  } catch (e) { stepError(e); }

  step('B6', 'Invalid hooks JSON blocks the save');
  try {
    const before = readSettings();
    await win.getByTestId('helm-hooks-json').fill('{ "PreToolUse": [ ');
    await win.waitForTimeout(400);
    const saveDisabled = await win.getByTestId('helm-save').isDisabled();
    await win.getByTestId('helm-save').click({ timeout: 3000 }).catch(() => {});
    await win.waitForTimeout(1200);
    const panel = await win.getByTestId('helm-panel').innerText();
    check('the hooks problem is reported on screen', /hooks/i.test(panel) && /JSON/i.test(panel));
    check('settings.json on disk is UNCHANGED', readSettings() === before);
    note(`Save control disabled: ${saveDisabled}`);
    await shot(win, 'B6-invalid-hooks');
    // Put the hooks pane back to something valid for later steps.
    await win.getByTestId('helm-hooks-json').fill('{}');
    await win.waitForTimeout(300);
  } catch (e) { stepError(e); }

  step('B7', 'crossSessionInbound=hold saves, with a warning not an error');
  try {
    await win.getByTestId('helm-cross-session:hold').check().catch(async () => {
      await win.getByTestId('helm-cross-session:hold').click();
    });
    await win.waitForTimeout(300);
    const caveatVisible = await win.getByTestId('helm-cross-session-caveat').count();
    check('the hold caveat is shown beside the choice', caveatVisible > 0);
    await win.getByTestId('helm-save').click();
    await win.waitForTimeout(2000);
    const panel = await win.getByTestId('helm-panel').innerText();
    check('the save SUCCEEDED (warnings heading, not error)', panel.includes('Saved with warnings') || panel.includes('Saved'));
    check('the warning names the observed CLI build', panel.includes('2.1.235'));
    check('hold reached the file', readSettings().includes('"hold"'));
    note('Installed CLI is 2.1.277; the message names 2.1.235, the build the value set was read from.');
    await shot(win, 'B7-hold-warning');
  } catch (e) { stepError(e); }

  step('B8', 'An unparseable file makes the panel read-only');
  try {
    writeSettings(sandbox, '{ "model": "x", ');            // malformed
    await win.getByTestId('helm-reload').click();
    await win.waitForTimeout(1800);
    let panel = await win.getByTestId('helm-panel').innerText();
    check('read-only notice shown for malformed JSON', panel.includes('could not be read as JSON'));
    check('Save is disabled', await win.getByTestId('helm-save').isDisabled());
    check('Model field is read-only', await win.getByTestId('helm-model').isDisabled());
    await shot(win, 'B8a-malformed');

    writeSettings(sandbox, '[1, 2, 3]');                   // parses, but not an object
    await win.getByTestId('helm-reload').click();
    await win.waitForTimeout(1800);
    panel = await win.getByTestId('helm-panel').innerText();
    check('read-only notice shown for a non-object', panel.includes('could not be read as JSON'));
    check('the cause names "must be a JSON object"', panel.includes('JSON object'));
    await shot(win, 'B8b-not-an-object');

    writeSettings(sandbox, BASELINE_SETTINGS);
    await win.getByTestId('helm-reload').click();
    await win.waitForTimeout(3000);
    const stillReadOnly = await win.getByTestId('helm-read-only').count();
    const saveDisabledAfter = await win.getByTestId('helm-save').isDisabled();
    const modelDisabledAfter = await win.getByTestId('helm-model').isDisabled();
    check('the read-only notice is gone', stillReadOnly === 0, `readOnlyNodes=${stillReadOnly}`);
    check('fields are editable again', modelDisabledAfter === false, `modelDisabled=${modelDisabledAfter}`);
    // Save is also disabled when the draft is pristine, so "disabled right
    // after a reload" is NOT evidence of a stuck read-only state. Make an edit
    // and see whether it becomes enabled — that is the real recovery test.
    await win.getByTestId('helm-model').fill('recovery-probe');
    await win.waitForTimeout(600);
    const saveAfterEdit = await win.getByTestId('helm-save').isDisabled();
    check('recovers after the file is fixed (Save enables once edited)', saveAfterEdit === false,
      `pristine=${saveDisabledAfter} afterEdit=${saveAfterEdit}`);
    note('Save disabled on a pristine draft is correct behaviour, not a stuck read-only state.');
  } catch (e) { stepError(e); }

  // ===================================================================== C
  step('C1', 'Closing with a dirty draft raises the panel-owned confirmation  [C1]');
  try {
    await win.getByTestId('helm-model').fill('dirty-draft-model');
    await win.waitForTimeout(400);
    await win.getByTestId('panel-bar-close').click();
    await win.waitForTimeout(800);
    const confirmCount = await win.getByTestId('helm-close-confirm').count();
    check('the confirmation appeared', confirmCount > 0);
    if (confirmCount) {
      const text = await win.getByTestId('helm-close-confirm').innerText();
      check('it is headed "You have unsaved changes"', text.includes('You have unsaved changes'));
      check('it states nothing was written', text.includes('Nothing has been written'));
      await shot(win, 'C1-close-confirm');
      await win.getByTestId('helm-close-confirm-keep').click();
      await win.waitForTimeout(600);
      check('Keep editing left the panel open', (await win.getByTestId('helm-panel').count()) > 0);
      check('the edit survived', (await win.getByTestId('helm-model').inputValue()) === 'dirty-draft-model');
    }
  } catch (e) { stepError(e); }

  step('C2', 'Switching panels with a dirty draft raises the same guard  [C1]');
  try {
    await win.getByTestId('panel-bar-open:beachcomber').click();
    await win.waitForTimeout(800);
    const confirmCount = await win.getByTestId('helm-close-confirm').count();
    check('the confirmation appeared on panel SWITCH too', confirmCount > 0);
    await shot(win, 'C2-switch-confirm');
    if (confirmCount) {
      await win.getByTestId('helm-close-confirm-discard').click();
      await win.waitForTimeout(1200);
      check('discarding moved us to Beachcomber', (await win.getByTestId('beachcomber-panel').count()) > 0);
    }
  } catch (e) { stepError(e); }

  step('C3', 'A failed reload KEEPS the draft  [C1 — the data-loss fix]');
  try {
    await openPanel(win, 'helm');
    await loadUserScope(win);
    await win.getByTestId('helm-model').fill('keep-me-through-failure');
    await win.waitForTimeout(400);

    // Make the read fail for real: replace the file with a directory (EISDIR).
    rmSync(sandbox.settingsPath, { force: true });
    mkdirSync(sandbox.settingsPath, { recursive: true });

    await win.getByTestId('helm-reload').click();
    await win.waitForTimeout(2000);

    const errCount = await win.getByTestId('helm-error').count();
    check('the failure was reported', errCount > 0);
    const model = await win.getByTestId('helm-model').inputValue().catch(() => '<gone>');
    check('THE DRAFT SURVIVED the failed reload', model === 'keep-me-through-failure', `model="${model}"`);
    check('the field is still editable', !(await win.getByTestId('helm-model').isDisabled()));
    await shot(win, 'C3-failed-reload-keeps-draft');

    rmSync(sandbox.settingsPath, { recursive: true, force: true });
    writeSettings(sandbox, BASELINE_SETTINGS);
  } catch (e) { stepError(e); }

  step('C4', 'An external write raises the stale notice  [C2 watcher]');
  try {
    await win.getByTestId('helm-reload').click();
    await win.waitForTimeout(1500);
    writeSettings(sandbox, { ...BASELINE_SETTINGS, env: { OC_HANDRUN: 'EXTERNAL-EDIT' } });
    // fs.watch latency is platform-dependent; poll rather than sleep a fixed span.
    let staleCount = 0;
    for (let i = 0; i < 20; i++) {
      staleCount = await win.getByTestId('helm-stale').count();
      if (staleCount > 0) break;
      await win.waitForTimeout(500);
    }
    const panel = await win.getByTestId('helm-panel').innerText();
    check('the stale notice appeared', staleCount > 0 || panel.includes('changed on disk'),
      `staleNodes=${staleCount}`);
    if (staleCount === 0) {
      note('DIAGNOSED: HelmService.watch() is never called by the application. No helmWatch IPC channel exists, load()/save() do not arm it, and the only callers are tests. The watcher cannot fire, so this notice is unreachable in the shipped app. See FINDINGS.md.');
    }
    if (staleCount) check('it explains saving re-reads first', (await win.getByTestId('helm-stale').innerText()).includes('heads-up'));
    await shot(win, 'C4-stale-notice');
  } catch (e) { stepError(e); }

  step('C5', 'A conflicting save is refused and the comparison is reachable  [C1]');
  try {
    await win.getByTestId('helm-reload').click();
    await win.waitForTimeout(1500);
    await win.getByTestId('helm-model').fill('my-conflicting-edit');
    await win.waitForTimeout(300);
    // Someone else writes between our load and our save.
    writeSettings(sandbox, { ...BASELINE_SETTINGS, model: 'written-by-someone-else' });
    await win.waitForTimeout(1500);

    const before = readSettings();
    await win.getByTestId('helm-save').click();
    await win.waitForTimeout(2200);

    const conflictCount = await win.getByTestId('helm-conflict').count();
    check('the save was refused with a conflict', conflictCount > 0);
    check('NOTHING was written to disk', readSettings() === before);
    if (conflictCount) {
      const text = await win.getByTestId('helm-conflict').innerText();
      check('headed "Nothing was written"', text.includes('Nothing was written'));
      check('advice says comparing never discards', text.includes('it never discards'));
      check('the Compare control is ON the conflict banner', (await win.getByTestId('helm-compare').count()) > 0);
    }
    check('the draft survived the conflict', (await win.getByTestId('helm-model').inputValue()) === 'my-conflicting-edit');
    await shot(win, 'C5a-conflict');

    await win.getByTestId('helm-compare').click();
    await win.waitForTimeout(2500);
    const tableCount = await win.getByTestId('helm-comparison-table').count();
    check('the side-by-side rendered', tableCount > 0);
    if (tableCount) {
      const t = await win.getByTestId('helm-comparison').innerText();
      // `.comparisonHead` is text-transform: uppercase, and innerText returns
      // RENDERED text, so compare case-insensitively.
      const ci = t.toLowerCase();
      check('column headings are On disk now / Your edit', ci.includes('on disk now') && ci.includes('your edit'));
      check('it shows the disk value', t.includes('written-by-someone-else'));
      check('it shows my edit', t.includes('my-conflicting-edit'));
      check('rows are marked Differs/Unchanged', ci.includes('differs') || ci.includes('unchanged'));
    }
    check('comparing did NOT discard the draft', (await win.getByTestId('helm-model').inputValue()) === 'my-conflicting-edit');
    await shot(win, 'C5b-comparison');
  } catch (e) { stepError(e); }

  // ===================================================================== D
  step('D2', 'The comparison empty state names no unreachable control  [C2 defect]');
  try {
    writeSettings(sandbox, BASELINE_SETTINGS);
    await win.getByTestId('helm-reload').click();
    await win.waitForTimeout(1800);
    await win.getByTestId('helm-model').fill('draft-without-conflict');
    await win.waitForTimeout(500);

    const emptyCount = await win.getByTestId('helm-comparison-empty').count();
    check('the empty state is on screen', emptyCount > 0);
    if (emptyCount) {
      const text = (await win.getByTestId('helm-comparison-empty').innerText()).trim();
      check('it does NOT instruct the user to press Compare', !/compare with the file on disk/i.test(text), text.slice(0, 80));
      check('it keeps the reassurance', text.includes('nothing you have typed is touched'));
    }
    const compareOnScreen = await win.getByTestId('helm-compare').count();
    check('and indeed NO Compare control is rendered right now', compareOnScreen === 0, `count=${compareOnScreen}`);
    note('This is the pairing that made the old copy wrong: surface present, control absent.');
    await shot(win, 'D2-empty-state');
  } catch (e) { stepError(e); }

  step('D1', 'A later unrelated failure goes to the banner, not the comparison  [C2 defect]');
  try {
    // 1. reach a conflict, 2. make compare fail, 3. cause an unrelated failure.
    await win.getByTestId('helm-reload').click();
    await win.waitForTimeout(1500);
    await win.getByTestId('helm-model').fill('edit-for-d1');
    await win.waitForTimeout(300);
    writeSettings(sandbox, { ...BASELINE_SETTINGS, model: 'external-for-d1' });
    await win.waitForTimeout(1500);
    await win.getByTestId('helm-save').click();
    await win.waitForTimeout(2000);

    if ((await win.getByTestId('helm-compare').count()) === 0) {
      note('Could not reach a conflict banner; D1 NOT EXERCISED.');
    } else {
      // Make the compare fetch fail (EISDIR again).
      rmSync(sandbox.settingsPath, { force: true });
      mkdirSync(sandbox.settingsPath, { recursive: true });
      await win.getByTestId('helm-compare').click();
      await win.waitForTimeout(2200);

      const compErr = await win.getByTestId('helm-comparison-error').count();
      check('the failed COMPARE renders inside the comparison surface', compErr > 0);
      await shot(win, 'D1a-compare-failed');

      // Now an unrelated failure: a save, still against the directory.
      await win.getByTestId('helm-model').fill('unrelated-failure-trigger').catch(() => {});
      await win.waitForTimeout(300);
      await win.getByTestId('helm-save').click();
      await win.waitForTimeout(2200);

      const bannerCount = await win.getByTestId('helm-error').count();
      const compErrAfter = await win.getByTestId('helm-comparison-error').count();
      check('the later failure reached the error BANNER', bannerCount > 0, `banner=${bannerCount}`);
      check('it did NOT land in the comparison surface', compErrAfter === 0, `comparisonError=${compErrAfter}`);

      if (bannerCount) {
        const msg = (await win.getByTestId('helm-error').innerText()).trim();
        const whole = await win.getByTestId('helm-panel').innerText();
        // The banner opens with a decorative glyph ("!") and a heading, so the
        // first line measures nothing. Take the longest line — the sentence.
        const firstLine =
          msg
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 12)
            .sort((a, b) => b.length - a.length)[0] ?? '';
        const occurrences = firstLine ? whole.split(firstLine).length - 1 : 0;
        check('the message appears exactly once on the panel', occurrences === 1, `occurrences=${occurrences}`);
        if (occurrences !== 1) {
          const where = await win.evaluate((needle) => {
            const hits = [];
            for (const el of Array.from(document.querySelectorAll('[data-testid]'))) {
              if (el.textContent.includes(needle)) hits.push(el.getAttribute('data-testid'));
            }
            return hits;
          }, firstLine);
          note(`message text: ${firstLine.slice(0, 120)}`);
          note(`containers holding it: ${where.join(', ')}`);
        }
      }
      await shot(win, 'D1b-later-failure-in-banner');

      rmSync(sandbox.settingsPath, { recursive: true, force: true });
      writeSettings(sandbox, BASELINE_SETTINGS);
    }
  } catch (e) { stepError(e); }

  // ===================================================================== E
  step('E1', 'Beachcomber scans and lists all four roots');
  try {
    await win.getByTestId('helm-reload').click().catch(() => {});
    await win.waitForTimeout(800);
    await win.getByTestId('panel-bar-open:beachcomber').click();
    await win.waitForTimeout(600);
    // A dirty draft may raise the guard; discard it to move on.
    if ((await win.getByTestId('helm-close-confirm').count()) > 0) {
      await win.getByTestId('helm-close-confirm-discard').click();
    }
    await win.waitForSelector('[data-testid="beachcomber-panel"]', { timeout: 15000 });
    await win.waitForTimeout(2500);

    for (const key of ['projects', 'shellSnapshots', 'fileHistory', 'pasteCache']) {
      check(`group rendered: ${key}`, (await win.getByTestId(`beachcomber-group:${key}`).count()) > 0);
    }
    const panel = await win.getByTestId('beachcomber-panel').innerText();
    for (const name of [sandbox.encodedBlocked, 'oc-test-recorded', 'oc-test-orphan', 'oc-test-decoy']) {
      check(`entry listed: ${name}`, panel.includes(name));
    }
    await shot(win, 'E1-scan');
  } catch (e) { stepError(e); }

  step('E2', 'The unverified notice precedes the path it qualifies  [C2 / T5]');
  try {
    const rowId = await win.evaluate((encoded) => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="beachcomber-row:"]'));
      const row = rows.find((r) => r.textContent.includes(encoded));
      return row ? row.getAttribute('data-testid') : null;
    }, sandbox.encodedBlocked);
    check('found the row for the encoded entry', rowId !== null, String(rowId));

    if (rowId) {
      const order = await win.evaluate((id) => {
        const row = document.querySelector(`[data-testid="${CSS.escape(id)}"]`);
        if (!row) return null;
        const notice = row.querySelector('[data-testid="beachcomber-row-unverified"]');
        if (!notice) return { notice: false };
        const all = Array.from(row.querySelectorAll('*'));
        const noticeAt = all.indexOf(notice);
        const pathEl = all.find((el) => el !== notice && !notice.contains(el) &&
          el.children.length === 0 && /^[A-Za-z]:\\/.test(el.textContent.trim()));
        return {
          notice: true,
          noticeAt,
          pathAt: pathEl ? all.indexOf(pathEl) : -1,
          pathText: pathEl ? pathEl.textContent.trim() : null,
          noticeText: notice.textContent.trim(),
        };
      }, rowId);

      check('the row carries the unverified notice', order?.notice === true);
      if (order?.notice) {
        check('the notice says "the path below is a guess"', order.noticeText.includes('the path below is a guess'));
        check('THE NOTICE COMES BEFORE THE PATH in document order', order.pathAt > order.noticeAt,
          `notice@${order.noticeAt} path@${order.pathAt}`);
        check('the path shown is the LOSSY DECODE, not the real cwd',
          order.pathText === sandbox.decodedGuess, String(order.pathText));
        note(`rendered path = ${order.pathText}`);
        note(`real Pod cwd  = ${sandbox.blockedRepo}`);
      }
    }
    await shot(win, 'E2-notice-order');
  } catch (e) { stepError(e); }

  step('E3', 'The orphan marker appears only on a recorded path');
  try {
    const flags = await win.evaluate((encoded) => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="beachcomber-row:"]'));
      const find = (needle) => rows.find((r) => r.textContent.includes(needle));
      const orphanRow = find('oc-test-orphan');
      const guessRow = find(encoded);
      return {
        orphanHasMarker: Boolean(orphanRow?.querySelector('[data-testid="beachcomber-row-orphan"]')),
        guessHasMarker: Boolean(guessRow?.querySelector('[data-testid="beachcomber-row-orphan"]')),
      };
    }, sandbox.encodedBlocked);
    check('the recorded-but-missing entry IS marked orphan', flags.orphanHasMarker);
    check('the GUESSED entry is NOT marked orphan', !flags.guessHasMarker);
    note('A guess is never called missing — that invariant is why the notice has a second sentence.');
  } catch (e) { stepError(e); }

  step('E4', 'A Pod blocks the entry whose path was only a guess  [C2 — the crown jewel]');
  try {
    const pod = await createPod(win, 'blocked-repo pod', sandbox.blockedRepo);
    // The preload bridge returns IpcResult<Pod> = { ok, value }, not the Pod.
    check('Pod created at the real cwd', pod?.ok === true && Boolean(pod?.value?.id),
      `ok=${pod?.ok} id=${pod?.value?.id ?? '-'} cwd=${sandbox.blockedRepo}`);
    note('createPod spawns nothing — it validates the cwd and writes a store record.');

    await rescanBeachcomber(win);

    const state = await win.evaluate((encoded) => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="beachcomber-row:"]'));
      const groups = Array.from(document.querySelectorAll('[data-testid^="beachcomber-group:"]'));
      const projects = groups.find((g) => g.getAttribute('data-testid') === 'beachcomber-group:projects');
      const row = rows.find((r) => r.textContent.includes(encoded) && projects?.contains(r));
      if (!row) return { found: false };
      const box = row.querySelector('input[type="checkbox"]');
      return {
        found: true,
        blocked: Boolean(row.querySelector('[data-testid="beachcomber-row-blocked"]')),
        disabled: box ? box.disabled : null,
        ariaDisabled: row.getAttribute('aria-disabled'),
        text: row.textContent.replace(/\s+/g, ' ').trim().slice(0, 260),
      };
    }, sandbox.encodedBlocked);

    check('the projects row was found', state.found === true);
    check('⭐ THE ROW IS BLOCKED', state.blocked === true);
    check('its checkbox is genuinely disabled', state.disabled === true, `disabled=${state.disabled}`);
    check('the row announces itself disabled', state.ariaDisabled === 'true', `aria-disabled=${state.ariaDisabled}`);
    if (state.text) note(`row text: ${state.text}`);
    note('Pre-C2 this row would NOT have blocked: its displayPath is a wrong guess that does not equal the Pod cwd.');
    await shot(win, 'E4-pod-blocking');
  } catch (e) { stepError(e); }

  step('E5', 'The same name under a NON-projects root is not blocked  [C2 R4]');
  try {
    const state = await win.evaluate((encoded) => {
      const out = {};
      for (const key of ['shellSnapshots', 'fileHistory', 'pasteCache']) {
        const group = document.querySelector(`[data-testid="beachcomber-group:${key}"]`);
        const rows = Array.from(document.querySelectorAll('[data-testid^="beachcomber-row:"]'));
        const row = rows.find((r) => r.textContent.includes(encoded) && group?.contains(r));
        const box = row?.querySelector('input[type="checkbox"]');
        out[key] = row ? { blocked: Boolean(row.querySelector('[data-testid="beachcomber-row-blocked"]')), disabled: box ? box.disabled : null } : null;
      }
      return out;
    }, sandbox.encodedBlocked);

    for (const key of ['shellSnapshots', 'fileHistory', 'pasteCache']) {
      const s = state[key];
      check(`${key}: the identically-named entry is NOT blocked`, s !== null && s.blocked === false, JSON.stringify(s));
      if (s) check(`${key}: and it remains selectable`, s.disabled === false, `disabled=${s.disabled}`);
    }
    note('Gated on root === projects AND pathSource === decoded-name. This proves the first half is live.');
  } catch (e) { stepError(e); }

  step('E6', 'A recorded entry still blocks the old way  [C2 union, not replacement]');
  try {
    const pod = await createPod(win, 'plain-repo pod', sandbox.plainRepo);
    check('second Pod created', pod?.ok === true && Boolean(pod?.value?.id), `ok=${pod?.ok}`);
    await rescanBeachcomber(win);
    const s = await win.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="beachcomber-row:"]'));
      const row = rows.find((r) => r.textContent.includes('oc-test-recorded'));
      const box = row?.querySelector('input[type="checkbox"]');
      return row ? { blocked: Boolean(row.querySelector('[data-testid="beachcomber-row-blocked"]')), disabled: box ? box.disabled : null } : null;
    });
    check('the recorded entry is blocked by its recorded cwd', s?.blocked === true, JSON.stringify(s));
    note('Nothing blocked before C2 may become unblocked; the new comparison is a union.');
    await shot(win, 'E6-recorded-blocked');
  } catch (e) { stepError(e); }

  step('E7', 'Preview, then cancel, removes nothing  [NEW capability]');
  try {
    const target = join(sandbox.roots.pasteCache, 'oc-test-decoy');
    check('the decoy exists before preview', existsSync(target));

    const picked = await win.evaluate(() => {
      const group = document.querySelector('[data-testid="beachcomber-group:pasteCache"]');
      const rows = Array.from(document.querySelectorAll('[data-testid^="beachcomber-row:"]'));
      const row = rows.find((r) => r.textContent.includes('oc-test-decoy') && group?.contains(r));
      const box = row?.querySelector('input[type="checkbox"]');
      if (!box || box.disabled) return false;
      box.click();
      return true;
    });
    check('selected the paste-cache decoy', picked === true);
    await win.waitForTimeout(600);

    await win.getByTestId('beachcomber-preview-button').click();
    await win.waitForTimeout(2000);
    const dlg = await win.getByTestId('beachcomber-preview-dialog').count();
    check('the preview dialog opened', dlg > 0);
    if (dlg) {
      const t = await win.getByTestId('beachcomber-preview-dialog').innerText();
      check('headed "Move these to the recycle bin?"', t.includes('Move these to the recycle bin?'));
      check('states nothing is removed until confirmed', t.includes('Nothing is removed until you confirm'));
      await shot(win, 'E7-preview');
      await win.getByTestId('beachcomber-preview-cancel').click();
      await win.waitForTimeout(1200);
    }
    check('CANCEL removed nothing from disk', existsSync(target));
  } catch (e) { stepError(e); }

  step('E8', 'Confirming moves it to the recycle bin  [NEW capability — destructive]');
  try {
    const target = join(sandbox.roots.pasteCache, 'oc-test-decoy');
    check('target present before confirm', existsSync(target));

    await win.getByTestId('beachcomber-preview-button').click();
    await win.waitForTimeout(2000);
    if ((await win.getByTestId('beachcomber-preview-dialog').count()) === 0) {
      note('Preview dialog did not reopen; E8 NOT EXERCISED.');
    } else {
      await win.getByTestId('beachcomber-preview-confirm').click();
      await win.waitForTimeout(4000);
      check('the directory is GONE from disk', !existsSync(target), `exists=${existsSync(target)}`);
      const res = await win.getByTestId('beachcomber-result').count();
      check('a result summary is shown', res > 0);
      if (res) {
        const t = await win.getByTestId('beachcomber-result').innerText();
        check('headed "Last cleanup"', t.includes('Last cleanup'));
        note(`result: ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      note('Removal is shell.trashItem — the OS recycle bin, recoverable. Only a sandbox fixture was moved.');
      await shot(win, 'E8-trashed');
    }
  } catch (e) { stepError(e); }

  // ===================================================================== F
  step('F2', 'Re-clicking the open panel\'s own button is a no-op, and raises NO dialog  [C1]');
  try {
    await openPanel(win, 'helm');
    await loadUserScope(win);
    await win.getByTestId('helm-model').fill('dirty-for-f2');
    await win.waitForTimeout(400);
    await win.getByTestId('panel-bar-open:helm').click();
    await win.waitForTimeout(1000);
    check('the panel is STILL open', (await win.getByTestId('helm-panel').count()) > 0);
    check('NO confirmation dialog was raised', (await win.getByTestId('helm-close-confirm').count()) === 0);
    check('the draft is untouched', (await win.getByTestId('helm-model').inputValue()) === 'dirty-for-f2');
    note('Compelled by the frozen contract; the cost is that three close routes became two.');
  } catch (e) { stepError(e); }

  step('F5', 'aria-pressed on a button that cannot un-press  [C1 known wart]');
  try {
    const attrs = await win.evaluate(() => {
      const el = document.querySelector('[data-testid="panel-bar-open:helm"]');
      const other = document.querySelector('[data-testid="panel-bar-open:beachcomber"]');
      return { helm: el?.getAttribute('aria-pressed'), beachcomber: other?.getAttribute('aria-pressed') };
    });
    check('the open panel reports aria-pressed=true', attrs.helm === 'true', `helm=${attrs.helm}`);
    check('the closed panel reports aria-pressed=false', attrs.beachcomber === 'false', `beachcomber=${attrs.beachcomber}`);
    note('Truthful as a state indicator, but F2 shows the control cannot un-press itself. aria-current is the alternative.');
  } catch (e) { stepError(e); }

  step('F3/F4', 'The remaining close routes still work');
  try {
    if ((await win.getByTestId('helm-close-confirm').count()) === 0) {
      await win.getByTestId('panel-bar-close').click();
      await win.waitForTimeout(700);
      if ((await win.getByTestId('helm-close-confirm').count()) > 0) {
        await win.getByTestId('helm-close-confirm-discard').click();
        await win.waitForTimeout(800);
      }
    }
    check('F3: the strip close button closed the panel', (await win.getByTestId('helm-panel').count()) === 0);

    await openPanel(win, 'beachcomber');
    await win.waitForTimeout(1200);
    await win.keyboard.press('Escape');
    await win.waitForTimeout(900);
    check('F4: Escape closed the panel', (await win.getByTestId('beachcomber-panel').count()) === 0);
    await shot(win, 'F-closed');
  } catch (e) { stepError(e); }
} catch (fatal) {
  console.error('\nFATAL:', fatal);
  step('FATAL', 'run aborted');
  stepError(fatal);
} finally {
  if (app) await app.close().catch(() => {});
}

// ---------------------------------------------------------------- safety
step('SAFETY', 'The real home was never touched');
const realAfter = existsSync(realSettings) ? readFileSync(realSettings, 'utf8') : null;
check('real ~/.claude/settings.json is byte-identical', realAfter === realBefore);
check('no stray backup appeared beside the real settings',
  !readdirSync(join(homedir(), '.claude')).some((n) => n.startsWith('settings.json.') && n.endsWith('.bak')));

const { total, failed, errored } = writeReport({
  generatedAt: new Date().toISOString(),
  build: '3b57255',
  electron: JSON.parse(readFileSync(join(repoRoot, 'node_modules/electron/package.json'), 'utf8')).version,
  playwright: JSON.parse(readFileSync(join(repoRoot, 'node_modules/playwright/package.json'), 'utf8')).version,
  sandbox: SANDBOX_ROOT,
});

console.log(`\n=====================================================`);
console.log(`  ${total - failed}/${total} checks passed · ${errored} step(s) errored`);
console.log(`  report: driven-report.md / driven-report.json`);
console.log(`=====================================================`);
process.exit(failed === 0 && errored === 0 ? 0 : 1);
