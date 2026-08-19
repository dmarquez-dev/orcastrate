/**
 * The renderer's ONLY capability surface.
 *
 * The window runs with `contextIsolation: true`, `nodeIntegration: false` and
 * `sandbox: true` (design spec 3). `ipcRenderer` itself is never exposed —
 * only the `OrcastrateApi` object built in `./api`, whose channel list is
 * fixed by `src/shared/contracts/ipc.ts`.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { createOrcastrateApi, type PreloadIpc } from './api';

const transport: PreloadIpc = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  removeListener: (channel, listener) =>
    ipcRenderer.removeListener(channel, listener),
};

contextBridge.exposeInMainWorld('orcastrate', createOrcastrateApi(transport));
