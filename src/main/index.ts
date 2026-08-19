import Database from 'better-sqlite3';
import { BrowserWindow, app } from 'electron';
import { createMainWindow } from './window';

/**
 * Application bootstrap. Deliberately thin: window creation lives in
 * `./window`, and Pod / lane / store / IPC-handler wiring belongs in its own
 * modules, not here.
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

app.whenReady().then(
  () => {
    logSqliteVersion();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  },
  (error: unknown) => {
    console.error('[orcastrate] failed to start', error);
    app.quit();
  },
);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
