import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';

import { EVENT_CHANNELS } from '../shared/contracts/ipc';
import type { HelmChangedPush } from '../shared/contracts/helm';
import type {
  PodDirectory,
  PodDirectoryProvider,
  TrashItem,
} from '../shared/contracts/panel-host';

import { createBeachcomberService } from './beachcomber';
import { createHelmService } from './helm';
import { registerIpcHandlers } from './ipc';
import { createPodRunner } from './pod';
import { createPodSessionRemover, fileExists } from './pod-session';
import { createPushes, PodManager, ROUTING_MODE } from './pod-manager';
import { openEventStore } from './store';
import { createMainWindow } from './window';

/**
 * Application bootstrap. Deliberately thin: window creation lives in
 * `./window`, and Pod / lane / store / IPC-handler wiring belongs in its own
 * modules, not here.
 *
 * What this file adds beyond starting the window is only the WIRING: it opens
 * the store, builds the one PodManager, constructs the Beachcomber and Helm
 * services, and installs the IPC handlers. Every behaviour behind those
 * handlers lives in `./pod-manager`, `./beachcomber`, `./helm` and `./ipc`.
 * No scanning, parsing or file-writing logic belongs here.
 *
 * This is also the ONLY module that hands out the application's dangerous
 * capabilities. `shell.trashItem` is supplied here as a `TrashItem` and
 * nowhere else; the Pod list is projected here into `PodDirectory` rows and
 * nowhere else. Both panel services import neither `electron` nor
 * `./pod-manager`, which is what keeps them exercisable against a temp tree.
 */

/**
 * `~/.claude`. Configuration read ONCE at startup into a typed value, per the
 * backend discipline — not re-resolved per request inside a service.
 */
const CLAUDE_HOME: string = join(homedir(), '.claude');

/**
 * The application's single deletion capability. Electron's `shell.trashItem`
 * moves a path to the OS recycle bin, which is recoverable. It is constructed
 * ONCE and handed to exactly two consumers — Beachcomber and the Pod-session
 * remover — and to nothing else. It rejects on platform failure, and that
 * rejection is deliberately NOT translated here: both consumers report the
 * platform's own message verbatim (see `contracts/panel-host.ts`).
 */
const trashItem: TrashItem = (absolutePath: string): Promise<void> =>
  shell.trashItem(absolutePath);

/**
 * Proves at startup that the `better-sqlite3` native addon loads inside the
 * Electron main process without a rebuild step. better-sqlite3 v13 ships
 * Node-API prebuilds, so the same binary serves Node and Electron.
 *
 * This opens an in-memory handle only — it is a load check, not the
 * application's data store.
 */
function logSqliteVersion(): void {
  const probe = new Database(':memory:');
  try {
    const row = probe.prepare('select sqlite_version() as version').get() as {
      version: string;
    };
    console.log(
      `[orcastrate] better-sqlite3 loaded in main; SQLite version ${row.version}`,
    );
  } finally {
    probe.close();
  }
}

/**
 * Broadcasts a push to every live window. Windows that are gone or mid-teardown
 * are skipped rather than thrown on — a push must never be able to crash main.
 */
function sendToRenderers(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    const contents = window.webContents;
    if (contents.isDestroyed()) continue;
    contents.send(channel, payload);
  }
}

/**
 * Opens the OS directory chooser. This is the ONLY source of a new filesystem
 * path in the application — the renderer never supplies one, and a
 * cancelled dialog is a normal `{ path: null }` answer, not a failure.
 */
async function pickDirectory(): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = {
    title: 'Choose a working directory for this Pod',
    properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
  };
  const result =
    parent !== undefined && !parent.isDestroyed()
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);

  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
}

app.whenReady().then(
  () => {
    logSqliteVersion();

    const store = openEventStore(join(app.getPath('userData'), 'orcastrate.db'));
    store.migrate();

    const manager = new PodManager({
      store,
      createRunner: createPodRunner,
      push: createPushes(sendToRenderers),
      routingMode: ROUTING_MODE,
    });

    // No runner survives a process restart, so any Pod or lane the store still
    // records as live is stale. Swept here: after `store.migrate()`, whose
    // migration 3 is what admits the `'closed'` this writes, and before
    // `createMainWindow()`, so the renderer's first `pod:list` cannot observe
    // an unreconciled row. The behaviour lives in `./pod-manager`; this file
    // takes no logic.
    manager.reconcileStartup();

    /**
     * Every Pod Orcastrate knows about, projected to exactly the three fields
     * the panel boundary declares. The persistence-shaped `Pod` row — status,
     * ccSessionId, envOverrides, tabOrder — does not cross into the services.
     *
     * This is deliberately every KNOWN Pod, not every OPEN one. `status` now
     * DOES distinguish open from closed — `'idle'` means a live runner between
     * turns, and `'closed'` means no runner at all — and this provider
     * deliberately ignores that distinction: blocking a superset is the safe
     * reading for a cleanup boundary, because a Pod that is merely closed still
     * owns its working directory and its transcript (Gate 2 decision, recorded
     * on `PodDirectoryProvider`).
     */
    const pods: PodDirectoryProvider = (): readonly PodDirectory[] =>
      manager.listPods().map((pod) => ({
        podId: pod.id,
        title: pod.title,
        cwd: pod.cwd,
      }));

    const beachcomber = createBeachcomberService({
      claudeHome: CLAUDE_HOME,
      pods,
      trashItem,
      now: () => new Date(),
      newId: () => randomUUID(),
    });

    const helm = createHelmService({
      claudeHome: CLAUDE_HOME,
      pods,
      now: () => new Date(),
      // Reuses the existing broadcast, so the destroyed-window guard above
      // still applies and a Helm push cannot crash main.
      emitChanged: (push: HelmChangedPush) => {
        sendToRenderers(EVENT_CHANNELS.helmChanged, push);
      },
      // TRUE HERE AND NOWHERE ELSE. Every Helm safety test runs with this
      // false, so a working watcher can never be what makes one pass.
      watchEnabled: true,
    });

    /**
     * The Pod-session port, built HERE and only here — this is the one module
     * that holds both `CLAUDE_HOME` and `trashItem`. Note which `trashItem`:
     * THE SAME CONSTANT Beachcomber is given a few lines above. No second
     * deletion capability is created, and none exists to create.
     */
    const deletePodSession = createPodSessionRemover({
      claudeHome: CLAUDE_HOME,
      trashItem,
      fileExists,
    });

    registerIpcHandlers({
      ipcMain,
      manager,
      pickDirectory,
      beachcomber,
      helm,
      deletePodSession,
    });

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });

    /**
     * Quit is held open exactly once, long enough to stop every live PodRunner
     * and close the database. Without this a quit would orphan the CLI child
     * processes the runners own.
     */
    let shuttingDown = false;
    app.on('before-quit', (event) => {
      if (shuttingDown) return;
      shuttingDown = true;
      event.preventDefault();
      void manager
        .disposeAll()
        .catch((err: unknown) => {
          console.error('[orcastrate] failed to stop Pods on quit', err);
        })
        .finally(() => {
          // Releases the Helm `fs.watch` handle so none outlives the app. Runs
          // between stopping the runners and closing the store, leaving the
          // existing ordering intact; a failure here must not skip the close.
          try {
            helm.dispose();
          } catch (err) {
            console.error('[orcastrate] failed to dispose Helm on quit', err);
          }
          try {
            store.close();
          } catch (err) {
            console.error('[orcastrate] failed to close the store on quit', err);
          }
          app.quit();
        });
    });
  },
  (error: unknown) => {
    console.error('[orcastrate] failed to start', error);
    app.quit();
  },
)
  // The rejection arm above only sees a `whenReady()` failure. A throw from
  // inside the fulfilled arm — opening the store, migrating it, or
  // `registerIpcHandlers`, which throws deliberately when a contract channel is
  // left unhandled — would otherwise become an unhandled rejection with no log
  // and a window that never gets its IPC surface.
  .catch((error: unknown) => {
    console.error('[orcastrate] failed to start', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
