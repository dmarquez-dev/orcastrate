/**
 * Every sentence the Beachcomber panel says, in one place.
 *
 * WHY A FILE. The two sentences a user could act on wrongly — the unverified
 * path notice and the blocked reason — are NOT here: they come from the frozen
 * contract (`UNVERIFIED_PATH_NOTICE`) and from the state layer
 * (`BeachcomberRowVm.blockedReason`) respectively, because two sources of that
 * copy would drift apart. What is here is the panel's own chrome, collected so
 * that the component files read as structure and so a reviewer can audit the
 * wording without reading JSX.
 *
 * The same rule applies to `heading` and `displayPath`: both are read off
 * `BeachcomberGroupVm` and neither is duplicated below.
 */

export const COPY = {
  loading: 'Scanning Claude Code’s on-disk state…',
  empty: 'Nothing to clear. This scan found no files in Claude Code’s on-disk state.',
  rescan: 'Rescan',
  rescanning: 'Scanning…',
  clearSelection: 'Clear selection',
  previewButton: 'Preview what will be removed',
  previewPending: 'Preparing preview…',
  nothingSelected: 'Nothing selected.',
  previewHeading: 'Move these to the recycle bin?',
  previewLead:
    'Everything listed here will be moved to the recycle bin. Nothing is removed until you confirm.',
  previewConfirm: 'Move to recycle bin',
  previewConfirming: 'Moving…',
  previewCancel: 'Cancel',
  previewRefusedHeading: 'Not included',
  previewSampleHeading: 'Includes',
  previewEmpty: 'None of the selected items can be moved.',
  previewStale: 'This directory changed since the scan and may no longer be there.',
  resultHeading: 'Last cleanup',
  resultFailuresHeading: 'Could not be moved',
  resultRefusedHeading: 'Not attempted',
  orphanMarker: 'Working directory no longer exists',
  blockedHeading: 'Cannot be selected',
  unverifiedHeading: 'Path not verified',
} as const;

/**
 * Test ids for elements the frozen `PANEL_TEST_IDS` does not name. Exactly the
 * rule `LANE_ROW_SELECT_TEST_ID` follows: the contract lists the ids that CROSS
 * a task boundary, and these three do not — they exist so this directory's own
 * tests can distinguish the three states criterion 10 requires be
 * distinguishable, without matching on a sentence.
 */
export const BEACHCOMBER_LOCAL_TEST_IDS = {
  loading: 'beachcomber-loading',
  empty: 'beachcomber-empty',
  selectionSummary: 'beachcomber-selection-summary',
  clearSelection: 'beachcomber-clear-selection',
  previewTotals: 'beachcomber-preview-totals',
  resultSummary: 'beachcomber-result-summary',
} as const;
