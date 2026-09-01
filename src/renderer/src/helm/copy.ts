/**
 * Every sentence Helm puts on screen, in one place.
 *
 * Two reasons it is not inlined in the components. First, the components stay
 * short enough to read without scrolling (criterion 14). Second, the no-paths
 * source scan in `no-paths.test.ts` reads every string literal in this
 * directory and fails on a path separator in any of them: keeping the copy
 * together makes that rule reviewable by eye as well as by test.
 *
 * `CROSS_SESSION_HOLD_CAVEAT` is NOT re-typed here. It is the frozen
 * contract's constant and is rendered verbatim from the import.
 */

import type { HelmScopeKind } from '@shared/contracts/helm';
import type { CrossSessionInbound } from '@shared/contracts/helm';

/**
 * Two Pod scopes carry the SAME `label` — the Pod's title — because one is
 * `settings.json` and the other `settings.local.json`. Listing them by label
 * alone would put two identical options in the picker, so each option reads
 * "label — kind". The label still leads, which is what criterion 2 asks for;
 * the qualifier is what makes the list usable.
 */
export const SCOPE_KIND_LABELS: Readonly<Record<HelmScopeKind, string>> = {
  user: 'This machine',
  project: 'Shared with the project',
  projectLocal: 'Local overrides, not committed',
};

export function scopeOptionText(label: string, kind: HelmScopeKind): string {
  return `${label} — ${SCOPE_KIND_LABELS[kind]}`;
}

export const CROSS_SESSION_LABELS: Readonly<Record<CrossSessionInbound, string>> = {
  accept: 'Accept',
  hold: 'Hold',
  refuse: 'Refuse',
};

export const CROSS_SESSION_HINTS: Readonly<Record<CrossSessionInbound, string>> = {
  accept: 'Deliver messages from another Claude Code session.',
  hold: 'Park a message from another session until you look at it.',
  refuse: 'Reject messages from another Claude Code session.',
};

export const COPY = {
  panelLabel: 'Helm settings',

  scopeLegend: 'Settings file',
  scopeSelectLabel: 'Which settings',
  scopePlaceholder: 'Choose which settings to edit',
  scopePathLabel: 'File',
  scopeAbsent: 'This file does not exist yet. Saving creates it.',
  scopeOnlyUser:
    'There are no Pods yet, so the only settings available are the ones for this machine.',
  scopeNone: 'Orcastrate found no settings files to edit.',
  /**
   * Two sentences rather than one reused twice: the same string in two places
   * makes `getByText` ambiguous for anyone testing this panel from outside,
   * and the two slots are saying different things anyway — one is the value of
   * the File row, the other is what to do next.
   */
  scopePathUnchosen: 'No file chosen yet.',
  scopeUnchosen: 'Choose a settings file above to start editing.',

  loadingScopes: 'Loading the list of settings files…',
  loadingDocument: 'Loading the settings file…',

  formLegend: 'Settings',
  modelLabel: 'Model',
  modelHint: 'Leave blank to use the default model.',

  allowLegend: 'Permissions to allow',
  allowItemLabel: 'Allow rule',
  allowAdd: 'Add an allow rule',
  allowEmpty: 'No allow rules.',

  denyLegend: 'Permissions to deny',
  denyItemLabel: 'Deny rule',
  denyAdd: 'Add a deny rule',
  denyEmpty: 'No deny rules.',

  envLegend: 'Environment variables',
  envNameLabel: 'Variable name',
  envValueLabel: 'Value',
  envAdd: 'Add an environment variable',
  envEmpty: 'No environment variables.',
  envAddBlocked: 'Name the empty variable before adding another.',
  envDuplicate: 'That variable name is already listed.',

  removeRow: 'Remove',

  crossSessionLegend: 'Messages from another Claude Code session',
  crossSessionUnset: 'Leave unset',
  crossSessionUnsetHint: 'Remove the key so Claude Code uses its own default.',

  hooksLegend: 'Hooks',
  hooksLabel: 'Hooks, as JSON',
  hooksHint:
    'Hooks are edited as raw JSON, not as a form. A partial builder would misrepresent what hooks can express.',

  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard changes',
  reload: 'Reload from disk',

  errorHeading: 'Something went wrong',
  conflictHeading: 'Nothing was written',
  conflictLead: 'The file changed since Helm loaded it, so nothing was written to',
  /** Unreachable today — a conflict always has a scope — but a whole sentence. */
  conflictUnnamedFile: 'the settings file that was open',
  /**
   * AMENDED by session 2026-08-31-orcastrate-helm-draft-safety. The old
   * sentence pointed at Reload alone — the one action documented as discarding
   * the draft — so a user following the banner's own advice lost the edits the
   * banner had just told them were safe. It now names the comparison first and
   * keeps Reload as the explicit discard-my-edit path, which is exactly the
   * split the amended `HELM_CONFLICT_CODE` docblock describes.
   */
  conflictAdvice:
    'Your edits are still here and still editable. Compare with the file on disk to see the current contents beside them — comparing fetches, it never discards. Reload from disk does take the current contents, and drops your edits to do it. Either way, a second save is the override, and you make it after seeing what you would replace.',
  staleHeading: 'This file changed on disk',
  staleBody:
    'Something else wrote to this file after Helm loaded it. Saving still re-reads and compares first, so this is a heads-up, not a block. Reload from disk to see the current contents.',
  savedHeading: 'Saved',
  backupLabel: 'Backup',
  warningsHeading: 'Saved with warnings',
  readOnlyHeading: 'This file could not be read as JSON',
  readOnlyBody:
    'Helm will not overwrite a file it could not read, so every field below is read-only and Save is off. Fix the file by hand, then reload from disk.',
  issuesHeading: 'Other problems',
  severityError: 'Error',
  severityWarning: 'Warning',

  // --- the comparison (session 2026-08-31-orcastrate-helm-draft-safety) ----

  compare: 'Compare with the file on disk',
  comparing: 'Comparing…',
  comparisonHeading: 'The file on disk, beside your edit',
  /**
   * The two column headings. They are DIFFERENT WORDS from anything else on
   * the panel on purpose: "Saved"/"Draft" would collide with the save banner
   * and with the word the close confirmation uses, and a `getByText` that
   * matched two places is a test that cannot say which one it read.
   */
  comparisonDiskColumn: 'On disk now',
  comparisonDraftColumn: 'Your edit',
  comparisonFieldColumn: 'Setting',
  comparisonLoading: 'Reading the current contents…',
  comparisonEmpty:
    'No comparison yet. Compare with the file on disk to fetch its current contents beside your edit — nothing you have typed is touched.',
  /** A field the file does not set at all, as against one it sets to nothing. */
  comparisonAbsent: 'Not set',
  comparisonEmptyList: 'None',
  comparisonSame: 'Unchanged',
  comparisonDiffers: 'Differs',

  // --- the close confirmation ---------------------------------------------

  closeConfirmHeading: 'You have unsaved changes',
  closeConfirmBody:
    'Closing Helm now throws away every edit you have not saved. Nothing has been written to the settings file.',
  closeConfirmKeep: 'Keep editing',
  closeConfirmDiscard: 'Discard changes and close',
} as const;

/** The label beside each row of the comparison, in the order the form uses. */
export const COMPARISON_FIELD_LABELS: Readonly<Record<string, string>> = {
  model: 'Model',
  permissionsAllow: 'Permissions to allow',
  permissionsDeny: 'Permissions to deny',
  env: 'Environment variables',
  crossSessionInbound: 'Messages from another session',
  hooksJson: 'Hooks, as JSON',
};
