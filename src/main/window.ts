import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';

/**
 * Creates the single application window.
 *
 * Security posture is fixed by design spec section 3 and is NOT configurable:
 * `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The
 * renderer reaches main only through the preload bridge in `src/preload`.
 *
 * This module is bootstrap only. Pod, lane, store, and IPC-handler code lives
 * in its own modules and must not be added here.
 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Orcastrate',
    backgroundColor: '#0f1720',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  // Never navigate the app window itself; external links open in the OS browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl !== undefined && devServerUrl !== '') {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}
