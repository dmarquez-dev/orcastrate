/**
 * `requirePermissionMode`, the IPC validator for a renderer-supplied mode.
 *
 * It accepts exactly the SDK's six modes and rejects `manual` — a mode the CLI
 * accepts but the SDK's `PermissionMode` union does not declare — with an
 * INVALID_ARGUMENT whose message lists the allow-list rather than a
 * hand-written copy of it.
 */

import { describe, expect, it } from 'vitest';

import { IpcFailure } from '../../../src/main/ipc/failure';
import { requirePermissionMode } from '../../../src/main/ipc/validate';

const SIX_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk', 'auto'] as const;

describe('requirePermissionMode', () => {
  it('returns its argument unchanged for each of the six SDK modes', () => {
    for (const mode of SIX_MODES) {
      expect(requirePermissionMode(mode)).toBe(mode);
    }
  });

  it('throws INVALID_ARGUMENT for manual, listing all six modes in the message', () => {
    let caught: unknown;
    try {
      requirePermissionMode('manual');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IpcFailure);
    expect((caught as IpcFailure).code).toBe('INVALID_ARGUMENT');
    expect((caught as IpcFailure).message).toBe(
      'permissionMode must be one of default, acceptEdits, plan, bypassPermissions, dontAsk, auto (received "manual")',
    );
  });
});
