/**
 * Does Helm's file watcher fire in a real Electron window?
 *
 * Unit coverage drives `fs.watch` through a fixed turn count; the backlog flags
 * that as platform-dependent and never verified for real. This subscribes to
 * the actual push channel from the renderer and watches an external write land.
 */
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { buildSandbox, writeSettings, BASELINE_SETTINGS } from './sandbox.mjs';
import { launch, openPanel, loadUserScope } from './lib.mjs';

const sandbox = buildSandbox('C:\\oc-sandbox');
writeSettings(sandbox, BASELINE_SETTINGS);

const { app, win } = await launch(sandbox);
try {
  await openPanel(win, 'helm');
  await loadUserScope(win);
  await win.waitForTimeout(1500);

  // Record every helmChanged push the renderer receives.
  await win.evaluate(() => {
    window.__pushes = [];
    window.orcastrate.on.helmChanged((p) => window.__pushes.push({ ...p, at: Date.now() }));
  });

  const scopeId = await win.evaluate(() => {
    const sel = document.querySelector('[data-testid="helm-scope-select"]');
    return sel ? sel.value : null;
  });
  console.log('selected scopeId :', scopeId);
  console.log('watching file    :', sandbox.settingsPath);

  // An unambiguous external write.
  writeFileSync(
    sandbox.settingsPath,
    JSON.stringify({ ...BASELINE_SETTINGS, env: { OC_HANDRUN: 'EXTERNAL-PROBE' } }, null, 2) + '\n',
    'utf8',
  );
  console.log('external write done, polling 15s...\n');

  let pushes = [];
  let staleAt = null;
  for (let i = 0; i < 30; i++) {
    await win.waitForTimeout(500);
    pushes = await win.evaluate(() => window.__pushes ?? []);
    const stale = await win.getByTestId('helm-stale').count();
    if (stale > 0 && staleAt === null) staleAt = (i + 1) * 500;
    if (pushes.length && staleAt !== null) break;
  }

  console.log('pushes received  :', pushes.length, JSON.stringify(pushes).slice(0, 220));
  console.log('stale notice at  :', staleAt === null ? 'NEVER within 15s' : `${staleAt}ms`);

  // Second attempt: does a further write fire it?
  if (!pushes.length) {
    console.log('\nretrying with a second write and a longer settle...');
    await win.waitForTimeout(2000);
    writeFileSync(sandbox.settingsPath, JSON.stringify({ model: 'second-probe' }, null, 2) + '\n', 'utf8');
    await win.waitForTimeout(8000);
    pushes = await win.evaluate(() => window.__pushes ?? []);
    const stale = await win.getByTestId('helm-stale').count();
    console.log('pushes after 2nd :', pushes.length);
    console.log('stale after 2nd  :', stale > 0 ? 'YES' : 'no');
  }

  const panel = await win.getByTestId('helm-panel').innerText();
  console.log('\npanel mentions "changed on disk":', panel.includes('changed on disk'));
} finally {
  await app.close();
}
