// frozen: 20261106-2050-helm-warning-plumbing, Gate 2
//
// The narrowed Helm validation and save-result shapes. Declarations only.
//
// SOURCE HOME: `src/shared/contracts/helm.ts`, owned by T1. Every consumer
// imports these names from there (`@shared/contracts/helm` in the renderer,
// a relative path in main and tests). Nothing re-declares them.
//
// Operation: `HelmService.save(req: HelmSaveRequest): Promise<HelmSaveResult>`
// (implemented in `src/main/helm/helm-service.ts`, T1), reached by the renderer
// as `window.api.helm.save` over the existing `helmSave` invoke channel and
// consumed by the Helm save action in `src/renderer/src/state/panel-store.ts`
// (T2), whose `lastSave` the Helm panel renders.
//
// Error cases (UNCHANGED by this session, restated so no implementer guesses):
//   - Any issue in `validateSaveRequest(req).issues` -> rejects with
//     `IpcFailure` code `INVALID_ARGUMENT`; message names the file and says it
//     was not written, followed by every issue message. Nothing is written.
//   - Revision mismatch -> rejects with `HELM_CONFLICT_CODE` (`CONFLICT`).
//   - Unparseable file on disk -> rejects with `INVALID_ARGUMENT`.
//   - Disk failure -> the existing `asIoFailure` translation.
// There is no success-with-issues outcome: a resolved `save` means the
// request carried zero validation issues.

import type { HelmDocument } from '../../../../src/shared/contracts/helm';

/** One member. Kept as a named type so every producer's `severity: 'error'` stays valid. */
export type HelmValidationSeverity = 'error';

export interface HelmValidationIssue {
  /** Unchanged: stays `string`, never narrowed. */
  field: string;
  severity: HelmValidationSeverity;
  message: string;
}

/** Every issue blocks the save. */
export interface HelmValidation {
  issues: HelmValidationIssue[];
}

/** Exactly these two keys. No `warnings`. */
export interface HelmSaveResult {
  document: HelmDocument;
  backupDisplayPath: string;
}
