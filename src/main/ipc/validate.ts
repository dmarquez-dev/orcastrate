/**
 * Renderer input validation (acceptance criterion 4).
 *
 * NOTHING that arrives over `ipcMain.handle` is trusted. The renderer is
 * sandboxed, but a compromised renderer still speaks the bridge, so every
 * argument is re-checked in main before it reaches the store, the router or a
 * child process. A rejected argument becomes `INVALID_ARGUMENT`; it never
 * becomes an exception the renderer has to guess at.
 *
 * These validators check SHAPE only. Facts that need the world — does this cwd
 * exist, does this Pod id resolve to a row — belong to PodManager, which
 * answers them with `CWD_MISSING` / `NOT_FOUND`.
 */

import type { PermissionMode } from '../../shared/contracts/events';
import type {
  BeachcomberPreviewRequest,
  BeachcomberTrashRequest,
} from '../../shared/contracts/beachcomber';
import type {
  HelmManagedFields,
  HelmRevision,
  HelmSaveRequest,
  HelmScopeId,
} from '../../shared/contracts/helm';
import { CROSS_SESSION_INBOUND_VALUES } from '../../shared/contracts/helm';
import type {
  CreatePodRequest,
  DeletePodRequest,
  PermissionRespondRequest,
  ReadEventsRequest,
  UpdatePodRequest,
} from '../../shared/contracts/ipc';
import { isAllowedPermissionMode } from '../pod';

import { invalidArgument } from './errors';

/** Contract: `ReadEventsRequest.limit` is "clamped to 5000 by main". */
export const MAX_READ_LIMIT = 5000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw invalidArgument(`${what} must be an object`);
  }
  return value;
}

export function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidArgument(`${what} must be a non-empty string`);
  }
  return value;
}

/** Text may legitimately contain whitespace-only? No — an empty turn is a bug. */
export function requireText(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidArgument(`${what} must be a non-empty string`);
  }
  return value;
}

export function requirePodId(value: unknown): string {
  return requireString(value, 'podId');
}

export function requirePermissionMode(value: unknown): PermissionMode {
  if (!isAllowedPermissionMode(value)) {
    throw invalidArgument(
      `permissionMode must be one of default, acceptEdits, plan, bypassPermissions (received ${JSON.stringify(value)})`,
    );
  }
  return value;
}

function optionalEnvOverrides(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const record = requireObject(value, 'envOverrides');
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string') {
      throw invalidArgument(`envOverrides.${key} must be a string`);
    }
    out[key] = entry;
  }
  return out;
}

/**
 * `cwd` is checked for SHAPE here and for EXISTENCE in PodManager. The contract
 * says the renderer never types one — it comes back from
 * `dialog:pickDirectory` — but main cannot prove provenance, so it proves the
 * only thing that matters instead: that the path resolves to a real directory
 * (PodManager, `CWD_MISSING`). A relative path is refused outright; every path
 * the picker returns is absolute.
 */
export function requireCreatePodRequest(value: unknown): CreatePodRequest {
  const raw = requireObject(value, 'CreatePodRequest');
  const cwd = requireString(raw['cwd'], 'cwd');
  if (!isAbsolutePath(cwd)) {
    throw invalidArgument('cwd must be an absolute path obtained from dialog.pickDirectory');
  }
  const req: CreatePodRequest = {
    title: requireString(raw['title'], 'title'),
    cwd,
    permissionMode: requirePermissionMode(raw['permissionMode']),
  };
  const env = optionalEnvOverrides(raw['envOverrides']);
  if (env !== undefined) req.envOverrides = env;
  return req;
}

/**
 * Absolute on either platform: a POSIX root, or a Windows drive/UNC root. Done
 * without `node:path` so the check does not change meaning with the host OS —
 * a path picked on one machine must not be judged relative on another.
 */
export function isAbsolutePath(value: string): boolean {
  return /^\//.test(value) || /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

export function requireUpdatePodRequest(value: unknown): UpdatePodRequest {
  const raw = requireObject(value, 'UpdatePodRequest');
  const req: UpdatePodRequest = { podId: requirePodId(raw['podId']) };

  if (raw['title'] !== undefined) req.title = requireString(raw['title'], 'title');
  if (raw['tabOrder'] !== undefined) {
    const order = raw['tabOrder'];
    if (typeof order !== 'number' || !Number.isInteger(order) || order < 0) {
      throw invalidArgument('tabOrder must be a non-negative integer');
    }
    req.tabOrder = order;
  }
  if (raw['permissionMode'] !== undefined) {
    req.permissionMode = requirePermissionMode(raw['permissionMode']);
  }
  const env = optionalEnvOverrides(raw['envOverrides']);
  if (env !== undefined) req.envOverrides = env;

  // `cwd` is deliberately absent from UpdatePodRequest (spec 4.2: immutable
  // after creation). Refusing it loudly beats ignoring it silently.
  if (raw['cwd'] !== undefined) {
    throw invalidArgument('cwd is immutable after creation and cannot be updated');
  }
  return req;
}

/**
 * `deleteSession` is REQUIRED and must be a real boolean.
 *
 * Not defaulted, and the string `'true'` is refused rather than coerced. This
 * one field decides whether a file leaves the user's disk, so "the caller
 * probably meant yes" is not an inference this boundary is allowed to make —
 * an absent or mistyped field is a renderer bug, and answering
 * INVALID_ARGUMENT surfaces it instead of quietly binning something.
 */
export function requireDeletePodRequest(value: unknown): DeletePodRequest {
  const raw = requireObject(value, 'DeletePodRequest');
  const deleteSession = raw['deleteSession'];
  if (typeof deleteSession !== 'boolean') {
    throw invalidArgument(
      `deleteSession must be a boolean (received ${JSON.stringify(deleteSession)})`,
    );
  }
  return { podId: requirePodId(raw['podId']), deleteSession };
}

export function requireReadEventsRequest(value: unknown): ReadEventsRequest {
  const raw = requireObject(value, 'ReadEventsRequest');
  const req: ReadEventsRequest = { podId: requirePodId(raw['podId']) };

  if (raw['laneId'] !== undefined) req.laneId = requireString(raw['laneId'], 'laneId');
  if (raw['afterSeq'] !== undefined) {
    const after = raw['afterSeq'];
    if (typeof after !== 'number' || !Number.isInteger(after) || after < 0) {
      throw invalidArgument('afterSeq must be a non-negative integer');
    }
    req.afterSeq = after;
  }
  if (raw['limit'] !== undefined) {
    const limit = raw['limit'];
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
      throw invalidArgument('limit must be a positive integer');
    }
    req.limit = Math.min(limit, MAX_READ_LIMIT);
  }
  return req;
}

/**
 * The `deny` branch is the one that matters: a denial with no reason is
 * refused with INVALID_ARGUMENT rather than defaulted to an empty string. The
 * contract types `reason` as required on deny, the model is shown it verbatim,
 * and `toPermissionResult` in the pod module throws on an empty one — so
 * accepting it here would only move the failure somewhere less legible.
 */
export function requirePermissionRespondRequest(value: unknown): PermissionRespondRequest {
  const raw = requireObject(value, 'PermissionRespondRequest');
  const decision = raw['decision'];
  if (decision !== 'allow' && decision !== 'allow_always' && decision !== 'deny') {
    throw invalidArgument(
      `decision must be one of allow, allow_always, deny (received ${JSON.stringify(decision)})`,
    );
  }

  const req: PermissionRespondRequest = {
    podId: requirePodId(raw['podId']),
    requestId: requireString(raw['requestId'], 'requestId'),
    decision,
  };

  if (decision === 'deny') {
    req.reason = requireString(raw['reason'], 'reason (required when decision is "deny")');
  } else if (raw['reason'] !== undefined) {
    req.reason = requireString(raw['reason'], 'reason');
  }
  return req;
}

// ---------------------------------------------------------------------------
// Beachcomber and Helm
//
// SHAPE ONLY, and that is the point. NOTHING below resolves, joins, normalizes
// or stats a path — there is no `node:path` and no `node:fs` in this module,
// and the ipc source scan asserts it. An id is checked for being a non-empty
// string and nothing more: whether it names anything is a question only the
// service that MINTED it can answer, and it answers with NOT_FOUND.
//
// Every returned object is REBUILT from the fields the contract declares, so a
// path-shaped extra key the renderer bolted on cannot ride through to a
// service. That is what makes `preview`/`trash` accept `{ scanId, ids }` and
// nothing else, and `load`/`save` accept a scopeId-keyed payload and nothing
// else.
// ---------------------------------------------------------------------------

/**
 * A trash of every `~/.claude/projects` entry on a busy machine is a few
 * hundred rows; 500 is comfortably past any real selection and well short of
 * a payload that could wedge main. A larger request is a bug or an attack, and
 * either way the answer is the same.
 */
export const MAX_BEACHCOMBER_IDS = 500;

/** `scanId` + ids. Shared by `preview` and `trash`, which take the same shape. */
function requireEntryIdRequest(
  value: unknown,
  what: string,
): { scanId: string; ids: string[] } {
  const raw = requireObject(value, what);
  const scanId = requireString(raw['scanId'], 'scanId');

  const ids = raw['ids'];
  if (!Array.isArray(ids)) {
    throw invalidArgument('ids must be an array of entry ids');
  }
  if (ids.length > MAX_BEACHCOMBER_IDS) {
    throw invalidArgument(
      `ids may name at most ${MAX_BEACHCOMBER_IDS} entries (received ${ids.length})`,
    );
  }
  const out: string[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    out.push(requireString(ids[index], `ids[${index}]`));
  }
  return { scanId, ids: out };
}

export function requireBeachcomberPreviewRequest(value: unknown): BeachcomberPreviewRequest {
  return requireEntryIdRequest(value, 'BeachcomberPreviewRequest');
}

export function requireBeachcomberTrashRequest(value: unknown): BeachcomberTrashRequest {
  return requireEntryIdRequest(value, 'BeachcomberTrashRequest');
}

/**
 * A scope id is a KEY the renderer picked out of `listScopes()`. Shape-checked
 * here; resolved to a settings file by `HelmService` alone, which answers
 * NOT_FOUND for one it did not mint.
 */
export function requireHelmScopeId(value: unknown): HelmScopeId {
  return requireString(value, 'scopeId');
}

/** `null` is a legitimate revision: "the file did not exist when I loaded it". */
function requireHelmRevision(value: unknown): HelmRevision | null {
  if (value === null || value === undefined) return null;
  const raw = requireObject(value, 'revision');
  const sizeBytes = raw['sizeBytes'];
  const mtimeMs = raw['mtimeMs'];
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw invalidArgument('revision.sizeBytes must be a non-negative number');
  }
  if (typeof mtimeMs !== 'number' || !Number.isFinite(mtimeMs)) {
    throw invalidArgument('revision.mtimeMs must be a number');
  }
  return { sha256: requireString(raw['sha256'], 'revision.sha256'), sizeBytes, mtimeMs };
}

function requireStringArray(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) {
    throw invalidArgument(`${what} must be an array of strings`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw invalidArgument(`${what}[${index}] must be a string`);
    }
    return entry;
  });
}

function requireStringRecord(value: unknown, what: string): Record<string, string> {
  const raw = requireObject(value, what);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (typeof entry !== 'string') {
      throw invalidArgument(`${what}.${key} must be a string`);
    }
    out[key] = entry;
  }
  return out;
}

/**
 * `null` and `''`/`[]`/`{}` collapse to "the key is absent" per the contract,
 * so an absent-key file round-trips without Helm inventing keys.
 *
 * `crossSessionInbound: 'hold'` is ACCEPTED here. It is unverified against CLI
 * 2.1.235, and the contract's answer to that is a validation WARNING the user
 * sees — not a refusal at the transport boundary, which would make Helm less
 * capable than a text editor.
 */
function requireHelmManagedFields(value: unknown): HelmManagedFields {
  const raw = requireObject(value, 'managed');

  const model = raw['model'];
  if (model !== null && model !== undefined && typeof model !== 'string') {
    throw invalidArgument('managed.model must be a string or null');
  }

  const inbound = raw['crossSessionInbound'];
  if (
    inbound !== null &&
    inbound !== undefined &&
    !(CROSS_SESSION_INBOUND_VALUES as readonly unknown[]).includes(inbound)
  ) {
    throw invalidArgument(
      `managed.crossSessionInbound must be one of ${CROSS_SESSION_INBOUND_VALUES.join(', ')} or null (received ${JSON.stringify(inbound)})`,
    );
  }

  return {
    model: typeof model === 'string' ? model : null,
    permissionsAllow: requireStringArray(raw['permissionsAllow'], 'managed.permissionsAllow'),
    permissionsDeny: requireStringArray(raw['permissionsDeny'], 'managed.permissionsDeny'),
    env: requireStringRecord(raw['env'], 'managed.env'),
    crossSessionInbound: (inbound ?? null) as HelmManagedFields['crossSessionInbound'],
  };
}

/**
 * Note what is NOT checked: whether `hooksJson` parses. That is a `validate`
 * concern the service reports as a `HelmValidationIssue` the form can render
 * against the field, not an INVALID_ARGUMENT that tells the user nothing about
 * where the brace went missing.
 */
export function requireHelmSaveRequest(value: unknown): HelmSaveRequest {
  const raw = requireObject(value, 'HelmSaveRequest');
  const hooksJson = raw['hooksJson'];
  if (typeof hooksJson !== 'string') {
    throw invalidArgument('hooksJson must be a string (empty when the key is absent)');
  }
  return {
    scopeId: requireHelmScopeId(raw['scopeId']),
    revision: requireHelmRevision(raw['revision']),
    managed: requireHelmManagedFields(raw['managed']),
    unmanaged: requireObject(raw['unmanaged'], 'unmanaged'),
    hooksJson,
  };
}
