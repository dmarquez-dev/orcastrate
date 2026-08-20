/**
 * Partitioning `HelmValidationIssue[]` for display.
 *
 * WHY THIS EXISTS AT ALL. `HelmValidationIssue.field` is typed `string`, and
 * the doc comment at `helm.ts:208` lists five names it is EXPECTED to hold —
 * but the state layer already emits two more (`parseError`, and
 * `permissionsDeny` for the deny list). A panel that rendered only the five
 * documented names would let a `parseError` issue set `blocked: true` with no
 * visible cause, which is the worst failure a form can have: a dead Save
 * button and nothing to read.
 *
 * So this module is deliberately CLOSED over what it renders inline and OPEN
 * over what it does not: anything whose field is not placed beside a control
 * falls through to a catch-all list, whatever the field is called.
 */

import type { HelmValidationIssue } from '@shared/contracts/helm';

/** The fields that have a control of their own to sit beside. */
export const INLINE_ISSUE_FIELDS = [
  'model',
  'permissionsAllow',
  'permissionsDeny',
  'env',
  'crossSessionInbound',
  'hooksJson',
] as const;

export type InlineIssueField = (typeof INLINE_ISSUE_FIELDS)[number];

/** The field the read-only banner already renders, from `document.parseError`. */
export const PARSE_ERROR_FIELD = 'parseError';

export function issuesFor(
  issues: readonly HelmValidationIssue[],
  field: InlineIssueField,
): HelmValidationIssue[] {
  return issues.filter((issue) => issue.field === field);
}

/**
 * Everything `issuesFor` will never be asked for. `readOnly` is true when the
 * read-only banner is on screen showing `document.parseError`, which is the
 * same sentence a `parseError` issue carries — so it is excluded then, and
 * only then.
 */
export function unplacedIssues(
  issues: readonly HelmValidationIssue[],
  readOnly: boolean,
): HelmValidationIssue[] {
  const placed = new Set<string>(INLINE_ISSUE_FIELDS);
  if (readOnly) placed.add(PARSE_ERROR_FIELD);
  return issues.filter((issue) => !placed.has(issue.field));
}
