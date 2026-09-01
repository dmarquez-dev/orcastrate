/**
 * The test ids this session's UI adds, and WHY THEY ARE NOT IN
 * `PANEL_TEST_IDS`.
 *
 * `PANEL_TEST_IDS` lives in `renderer-panels.ts`, which froze at Gate 2. The
 * amendment this session landed there adds `compare()`, `incoming`,
 * `comparing` and the close-guard trio and nothing else; adding ids to it now
 * would be editing a frozen contract, which is an escalation rather than an
 * edit. The seam `PANEL_TEST_IDS` exists to serve — a test suite written
 * without having seen the markup — is not in play here either: the suites that
 * drive this markup are in this directory, beside it.
 *
 * SUFFIXED IDS follow the same rule as `PANEL_TEST_IDS`: `base:suffix`, built
 * by `comparisonCellId` below rather than by template literals scattered
 * through the components.
 *
 * NOTE FOR `no-paths.test.ts`: every literal here is scanned for a path
 * separator, so none of these may ever contain one. Hyphens and colons only.
 */

export const HELM_SAFETY_TEST_IDS = {
  /** The affordance on the conflict banner that reaches `actions.compare()`. */
  compare: 'helm-compare',

  /** The comparison surface as a whole. */
  comparison: 'helm-comparison',
  comparisonLoading: 'helm-comparison-loading',
  comparisonError: 'helm-comparison-error',
  comparisonEmpty: 'helm-comparison-empty',
  comparisonTable: 'helm-comparison-table',
  /** `helm-comparison-disk:model`. */
  comparisonDisk: 'helm-comparison-disk',
  /** `helm-comparison-draft:model`. */
  comparisonDraft: 'helm-comparison-draft',

  /** The close confirmation the panel owns. The shell renders none. */
  closeConfirm: 'helm-close-confirm',
  closeConfirmKeep: 'helm-close-confirm-keep',
  closeConfirmDiscard: 'helm-close-confirm-discard',
} as const;

export function comparisonCellId(base: string, field: string): string {
  return `${base}:${field}`;
}
