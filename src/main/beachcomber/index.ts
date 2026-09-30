/**
 * Public surface of the Beachcomber module. The app bootstrap and the IPC
 * handlers import from here, never from the files beneath it.
 */

export { createBeachcomberService } from './service';
export { decodeDirectoryName, normalizeForCompare, podBlockerFor, samePath } from './paths';
export type { PodBlockingSubject } from './paths';
export { readFirstCwd, sessionFileNames, CHUNK_BYTES, MAX_SCAN_BYTES } from './session-record';
export type { FirstCwdResult } from './session-record';
export { measureTree, sampleFileNames } from './walk';
export type { TreeMeasurement } from './walk';
