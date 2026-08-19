/**
 * Public surface of the IPC module. The app bootstrap imports from here, never
 * from the files beneath it.
 */

export { registerIpcHandlers } from './handlers';
export type { IpcHandlerDeps, IpcMainLike } from './handlers';
export { fail, ok, toIpcError, IpcFailure, IPC_ERROR_CODES } from './errors';
export { MAX_READ_LIMIT, isAbsolutePath } from './validate';
