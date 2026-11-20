// frozen: 20261119-2021-permission-modes-from-sdk, Gate 2
//
// CONTRACT — the permission-mode catalogue, between T1 (which owns every file
// named below) and T3 (which reads it in the New Pod dialog).
//
// Declarations only. Each declaration's SOURCE HOME is named beside it; the
// product imports the source home, never this file.

// ---------------------------------------------------------------------------
// The union. Source home: src/shared/contracts/events.ts (T1).
// ---------------------------------------------------------------------------

/**
 * DERIVED from the SDK, not written by hand: the source home declares it as an
 * alias of `PermissionMode` exported by `@anthropic-ai/claude-agent-sdk`
 * (0.3.235 declares six members: 'default' | 'acceptEdits' |
 * 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'). The import is type-only.
 *
 * Every runtime list of modes in the product must be EXACT over this union in
 * both directions, enforced at build time (`npm run typecheck`):
 *   - a list member that is not a union member fails the build (`satisfies`);
 *   - a union member missing from the list fails the build (a `never`
 *     assertion routed through a generic constraint, the `_AssertNever`
 *     spelling `src/main/store/schema.ts` already uses — NOT an empty-array
 *     assignment, which is vacuous).
 * The lists this applies to: `ALLOWED_PERMISSION_MODES`
 * (src/main/pod/options.ts), `PERMISSION_MODES` and the schema-head list of
 * the newest pods-rebuilding migration (src/main/store/schema.ts), and the
 * `EVERY_PERMISSION_MODE` record in
 * src/renderer/src/__tests__/wording.e2e.test.tsx, which is what makes
 * `PERMISSION_MODE_OPTIONS` exhaustive.
 *
 * 'manual' (accepted by CLI 2.1.235, absent from the SDK union) is NOT a
 * member and stays rejected at every layer: runtime guard, IPC validator and
 * SQLite CHECK.
 */
export type PermissionMode = import('@anthropic-ai/claude-agent-sdk').PermissionMode;

// ---------------------------------------------------------------------------
// The runtime allow-list. Source home: src/main/pod/options.ts (T1).
// ---------------------------------------------------------------------------

/**
 * Exactly these six, in this order. `isAllowedPermissionMode` and
 * `assertAllowedPermissionMode` read it; `assertAllowedPermissionMode` still
 * throws a bare `RangeError` whose message starts `unsupported permissionMode`
 * and lists this array joined by ', '.
 */
export declare const ALLOWED_PERMISSION_MODES: readonly [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
  'dontAsk',
  'auto',
];

/**
 * Source home: src/main/ipc/validate.ts (T1). Throws the module's existing
 * INVALID_ARGUMENT failure for any value `isAllowedPermissionMode` rejects. The
 * message is built from `ALLOWED_PERMISSION_MODES`, never a hand-written list:
 *   `permissionMode must be one of ${ALLOWED_PERMISSION_MODES.join(', ')} (received ${JSON.stringify(value)})`
 */
export declare function requirePermissionMode(value: unknown): PermissionMode;

// ---------------------------------------------------------------------------
// The dialog's options. Source home: src/renderer/src/contracts/renderer-view.ts (T1).
// ---------------------------------------------------------------------------

/** Unchanged shape. */
export interface PermissionModeOption {
  mode: PermissionMode;
  label: string;
  summary: string;
  /** Requires an explicit confirmation step before the Pod is created. */
  danger: boolean;
}

/**
 * Display order, exactly: default, acceptEdits, plan, dontAsk, auto,
 * bypassPermissions. The four existing entries keep their label, summary and
 * danger values byte-for-byte; `bypassPermissions` is the ONLY entry with
 * `danger: true`. The two new entries are exactly `DONT_ASK_OPTION` and
 * `AUTO_OPTION` below.
 *
 * The array is typed `readonly PermissionModeOption[]` as today. T3 identifies
 * the auto option by `mode === 'auto'`; nothing else about the array is
 * special-cased.
 */
export declare const PERMISSION_MODE_OPTIONS: readonly PermissionModeOption[];

export declare const DONT_ASK_OPTION: {
  readonly mode: 'dontAsk';
  readonly label: 'Deny unless pre-approved';
  readonly summary: 'Tools your settings do not already allow are denied without asking.';
  readonly danger: false;
};

export declare const AUTO_OPTION: {
  readonly mode: 'auto';
  readonly label: 'Auto mode';
  readonly summary: 'A model classifier approves or denies each permission prompt instead of asking.';
  readonly danger: false;
};
