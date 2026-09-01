/**
 * The side-by-side, as data.
 *
 * `helm.ts`'s `HELM_CONFLICT_CODE` docblock has promised since it froze that a
 * conflict "shows the current contents beside the pending edit". `incoming` is
 * the current contents and `draft` is the pending edit; this module is the
 * pairing, kept out of the component so it can be read and tested without a
 * DOM.
 *
 * WHY THE VALUES ARE FORMATTED HERE rather than in the markup: the two halves
 * of a row must be formatted by the SAME function, or "Differs" would report a
 * difference in the formatting instead of a difference in the file. One
 * function, applied twice, is what makes `changed` mean what it says.
 *
 * NOTHING HERE READS A PATH. The scope's `displayPath` is the picker's
 * business; a row here is a managed field or the hooks text.
 */

import type { HelmDocument, HelmManagedFields } from '@shared/contracts/helm';
import type { HelmDraft } from '../contracts/renderer-panels';

import { COMPARISON_FIELD_LABELS, COPY, CROSS_SESSION_LABELS } from './copy';

export interface ComparisonRow {
  /** Matches the `HelmValidationIssue.field` name for the same setting. */
  field: string;
  label: string;
  /** The value in `incoming`, formatted. */
  disk: string;
  /** The value in `draft`, formatted the same way. */
  edit: string;
  /** `disk !== edit`. Derived, never stored. */
  changed: boolean;
}

const LIST_SEPARATOR = ', ';

function formatList(values: readonly string[]): string {
  return values.length === 0 ? COPY.comparisonEmptyList : values.join(LIST_SEPARATOR);
}

function formatEnv(env: Readonly<Record<string, string>>): string {
  const names = Object.keys(env).sort();
  if (names.length === 0) return COPY.comparisonEmptyList;
  return names.map((name) => `${name}=${env[name] ?? ''}`).join(LIST_SEPARATOR);
}

function formatManaged(managed: HelmManagedFields, field: string): string {
  switch (field) {
    case 'model':
      return managed.model ?? COPY.comparisonAbsent;
    case 'permissionsAllow':
      return formatList(managed.permissionsAllow);
    case 'permissionsDeny':
      return formatList(managed.permissionsDeny);
    case 'env':
      return formatEnv(managed.env);
    case 'crossSessionInbound':
      return managed.crossSessionInbound === null
        ? COPY.comparisonAbsent
        : CROSS_SESSION_LABELS[managed.crossSessionInbound];
    default:
      return COPY.comparisonAbsent;
  }
}

function formatHooks(hooksJson: string): string {
  return hooksJson.trim() === '' ? COPY.comparisonAbsent : hooksJson;
}

/** The managed fields, in the order the form presents them. */
export const COMPARISON_FIELDS = [
  'model',
  'permissionsAllow',
  'permissionsDeny',
  'env',
  'crossSessionInbound',
  'hooksJson',
] as const;

export function comparisonRows(incoming: HelmDocument, draft: HelmDraft): ComparisonRow[] {
  return COMPARISON_FIELDS.map((field) => {
    const disk =
      field === 'hooksJson'
        ? formatHooks(incoming.hooksJson)
        : formatManaged(incoming.managed, field);
    const edit =
      field === 'hooksJson' ? formatHooks(draft.hooksJson) : formatManaged(draft.managed, field);

    return {
      field,
      label: COMPARISON_FIELD_LABELS[field] ?? field,
      disk,
      edit,
      changed: disk !== edit,
    };
  });
}
