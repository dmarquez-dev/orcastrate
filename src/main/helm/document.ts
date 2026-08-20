/**
 * Settings JSON <-> `HelmDocument`.
 *
 * ROUND-TRIP IS THE CONTRACT (design section 9). A load followed by a save with
 * an untouched draft must leave the file deep-equal under `JSON.parse`. Helm
 * manages five keys and must not invent, reorder-into-meaning, drop or
 * "normalize" anything else.
 *
 * THE PARTLY-MANAGED KEYS. Three of the five are not managed WHOLE:
 *
 *   - `permissions` — Helm edits `allow` and `deny`. A real settings file also
 *     carries `defaultMode`, `ask`, `additionalDirectories` and whatever a
 *     later CLI adds.
 *   - `env` — `HelmManagedFields.env` is `Record<string, string>`; a
 *     hand-written file may hold a number or a null.
 *   - `crossSessionInbound` / `model` — a value outside the managed type (a
 *     future CLI's fourth policy, an object-valued `model`) must survive.
 *
 * Dropping those residues would make Helm a data-loss tool for exactly the
 * hand-edited files it exists to serve, so each one is carried in `unmanaged`
 * under its own key and merged back on serialize. `unmanaged` is therefore
 * "everything Helm is not editing", which is what the renderer echoes back
 * untouched — it never reads inside it either way.
 */

import type {
  CrossSessionInbound,
  HelmManagedFields,
} from '../../shared/contracts/helm';
import { CROSS_SESSION_INBOUND_VALUES } from '../../shared/contracts/helm';

/** The five top-level keys Helm edits. Everything else is `unmanaged` verbatim. */
export const MANAGED_KEYS = ['model', 'permissions', 'env', 'crossSessionInbound', 'hooks'] as const;

/**
 * A FRESH empty draft on every call. Never a shared constant: it is handed
 * outward on the absent-file and unparseable-file paths, where a caller
 * mutating it would corrupt the next load.
 */
export function emptyManaged(): HelmManagedFields {
  return {
    model: null,
    permissionsAllow: [],
    permissionsDeny: [],
    env: {},
    crossSessionInbound: null,
  };
}

export interface ParsedSettings {
  managed: HelmManagedFields;
  unmanaged: Record<string, unknown>;
  hooksJson: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === 'string') ? [...(value as string[])] : null;
}

function isCrossSessionInbound(value: unknown): value is CrossSessionInbound {
  return (
    typeof value === 'string' &&
    (CROSS_SESSION_INBOUND_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Splits a parsed settings object into the form fields and everything else.
 *
 * `null`, `[]` and `{}` all mean THE KEY IS ABSENT here, which is what lets an
 * absent-key file round-trip without Helm writing keys the user never asked
 * for (frozen contract, `HelmManagedFields`).
 */
export function parseSettings(root: Record<string, unknown>): ParsedSettings {
  const managed = emptyManaged();
  const unmanaged: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(root)) {
    if (!(MANAGED_KEYS as readonly string[]).includes(key)) unmanaged[key] = value;
  }

  // model ------------------------------------------------------------------
  if ('model' in root) {
    const raw = root['model'];
    if (typeof raw === 'string') managed.model = raw;
    else unmanaged['model'] = raw;
  }

  // permissions ------------------------------------------------------------
  if ('permissions' in root) {
    const raw = root['permissions'];
    if (isPlainObject(raw)) {
      const residue: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (key === 'allow') {
          const parsed = stringArray(value);
          if (parsed) managed.permissionsAllow = parsed;
          else residue['allow'] = value;
        } else if (key === 'deny') {
          const parsed = stringArray(value);
          if (parsed) managed.permissionsDeny = parsed;
          else residue['deny'] = value;
        } else {
          residue[key] = value;
        }
      }
      if (Object.keys(residue).length > 0) unmanaged['permissions'] = residue;
    } else {
      unmanaged['permissions'] = raw;
    }
  }

  // env --------------------------------------------------------------------
  if ('env' in root) {
    const raw = root['env'];
    if (isPlainObject(raw)) {
      const residue: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') managed.env[key] = value;
        else residue[key] = value;
      }
      if (Object.keys(residue).length > 0) unmanaged['env'] = residue;
    } else {
      unmanaged['env'] = raw;
    }
  }

  // crossSessionInbound ----------------------------------------------------
  if ('crossSessionInbound' in root) {
    const raw = root['crossSessionInbound'];
    if (isCrossSessionInbound(raw)) managed.crossSessionInbound = raw;
    else unmanaged['crossSessionInbound'] = raw;
  }

  // hooks ------------------------------------------------------------------
  const hooksJson = 'hooks' in root ? JSON.stringify(root['hooks'], null, 2) : '';

  return { managed, unmanaged, hooksJson };
}

export interface SerializeInput {
  managed: HelmManagedFields;
  unmanaged: Record<string, unknown>;
  hooksJson: string;
}

/**
 * Rebuilds the settings object. The inverse of `parseSettings` for every input
 * `parseSettings` produced, which is what criterion 4 measures.
 *
 * A managed field that is empty writes NO KEY. An unmanaged residue under the
 * same key is merged back beneath the managed value, so a `permissions` block
 * keeps its `defaultMode` while Helm rewrites its `allow` list.
 */
export function serializeSettings(input: SerializeInput): string {
  const { managed, unmanaged, hooksJson } = input;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(unmanaged)) {
    if ((MANAGED_KEYS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }

  // model
  if (managed.model !== null) out['model'] = managed.model;
  else if ('model' in unmanaged) out['model'] = unmanaged['model'];

  // permissions
  const permissionResidue = isPlainObject(unmanaged['permissions'])
    ? { ...(unmanaged['permissions'] as Record<string, unknown>) }
    : undefined;
  if (permissionResidue === undefined && 'permissions' in unmanaged) {
    // A non-object `permissions` the user hand-wrote. Preserved verbatim; Helm
    // has nothing to merge into it.
    out['permissions'] = unmanaged['permissions'];
  } else {
    const permissions: Record<string, unknown> = permissionResidue ?? {};
    if (managed.permissionsAllow.length > 0) permissions['allow'] = [...managed.permissionsAllow];
    if (managed.permissionsDeny.length > 0) permissions['deny'] = [...managed.permissionsDeny];
    if (Object.keys(permissions).length > 0) out['permissions'] = permissions;
  }

  // env
  const envResidue = isPlainObject(unmanaged['env'])
    ? { ...(unmanaged['env'] as Record<string, unknown>) }
    : undefined;
  if (envResidue === undefined && 'env' in unmanaged) {
    out['env'] = unmanaged['env'];
  } else {
    const env: Record<string, unknown> = { ...(envResidue ?? {}), ...managed.env };
    if (Object.keys(env).length > 0) out['env'] = env;
  }

  // crossSessionInbound
  if (managed.crossSessionInbound !== null) out['crossSessionInbound'] = managed.crossSessionInbound;
  else if ('crossSessionInbound' in unmanaged) out['crossSessionInbound'] = unmanaged['crossSessionInbound'];

  // hooks — a RAW value, parsed but never restructured. Helm adds no key to it.
  if (hooksJson.trim() !== '') out['hooks'] = JSON.parse(hooksJson) as unknown;

  return `${JSON.stringify(out, null, 2)}\n`;
}
