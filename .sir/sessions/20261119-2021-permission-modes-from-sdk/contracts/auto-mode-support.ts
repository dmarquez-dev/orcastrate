// frozen: 20261119-2021-permission-modes-from-sdk, Gate 2
//
// CONTRACT — the cached auto-mode flag, between T2 (main process -> renderer
// store, owner of every source home below) and T3 (the New Pod dialog and its
// tests). Declarations only; the product imports the source homes.

// ---------------------------------------------------------------------------
// What the value means
// ---------------------------------------------------------------------------

/**
 * `true`  — the most recent Pod that produced a DEFINED answer said its model
 *           supports auto mode.
 * `false` — that Pod said its model does not.
 * `null`  — the renderer has received no push since its workspace store
 *           started. (Main pushes only on change, so after a renderer reload
 *           this holds until main's cached value next changes.)
 *
 * Main derives a Pod's answer from two SDK values of that Pod's session: the
 * `ModelInfo[]` its `Query.supportedModels()` returns (the initialize
 * handshake's `models`) and the `model` string of the latest `system`/`init`
 * message it emitted. The matching entries are the object entries whose
 * `value` or `resolvedModel` strictly equals that model string; the answer is
 * `true` if any matching entry has `supportsAutoMode === true`, else `false` if
 * any has `supportsAutoMode === false`, else undefined. A Pod with no defined
 * answer leaves the cached value as it was. A cached value outlives the Pod
 * that produced it; it lasts for the main process's lifetime.
 *
 * The cache is delivered by a main -> renderer push (T2-internal: its channel,
 * payload and preload member are not part of this contract). Main pushes only
 * when the cached value changes, and never pushes `null`.
 */
export type AutoModeSupport = boolean | null;

// ---------------------------------------------------------------------------
// The hook T3 reads. Source home: declared in
// src/renderer/src/contracts/renderer-state.ts, implemented in
// src/renderer/src/state/workspace-provider.tsx, exported from
// src/renderer/src/state/index.ts (all T2).
// ---------------------------------------------------------------------------

/**
 * The latest pushed value; `null` before the first push. Must be called under
 * `WorkspaceProvider`, like every other hook in renderer-state.ts, and throws
 * the same error they throw outside it. Never fetches: reading the hook
 * issues no IPC call.
 *
 * Adds NO field to `WorkspaceStore` (the key-set test in
 * src/renderer/src/state/panel-provider.test.tsx pins its keys).
 */
export declare function useAutoModeSupport(): AutoModeSupport;

// ---------------------------------------------------------------------------
// The test seam T3's tests drive. Source home:
// src/renderer/src/test-utils/stub-api.ts (T2).
// ---------------------------------------------------------------------------

/**
 * `stubOrcastrateApi()` delivers a push to the workspace store exactly as the
 * preload bridge would, by the stub's existing per-channel `emit` mechanism,
 * under the key `autoModeSupport` with payload `{ supported: boolean }`.
 * A stub that receives no emit delivers no push, so a test that emits nothing
 * observes `useAutoModeSupport() === null`.
 */
export interface StubAutoModeSupportEmit {
  autoModeSupport(payload: { supported: boolean }): void;
}
