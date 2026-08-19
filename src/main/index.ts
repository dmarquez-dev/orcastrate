import { join } from 'node:path';

import Database from 'better-sqlite3';
import { BrowserWindow, app, dialog, ipcMain } from 'electron';

import { registerIpcHandlers } from './ipc';
import { createPodRunner } from './pod';
import { createPushes, PodManager, ROUTING_MODE } from './pod-manager';
import { openEventStore } from './store';
import { createMainWindow } from './window';

/**
 * Application bootstrap. Deliberately thin: window creation lives in
 * `./window`, and Pod / lane / store / IPC-handler wiring belongs in its own
 * modules, not here.
 *
 * What this file adds beyond starting the window is only the WIRING: it opens
 * the store, builds the one PodManager, and installs the IPC handlers. Every
 * behaviour behind those handlers lives in `./pod-manager` and `./ipc`.
 */

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
 * Opens the OS directory chooser. Criterion 5: this is the ONLY source of a new
 * filesystem path in the application — the renderer never supplies one, and a
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

    registerIpcHandlers({ ipcMain, manager, pickDirectory });

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
