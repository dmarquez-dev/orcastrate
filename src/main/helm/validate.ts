/**
 * Validation, and the line between BLOCKING and ADVISORY.
 *
 * `error` blocks the save. `warning` does not.
 *
 * THE `hold` DECISION (spec assumption table, approved at Gate 2). The key
 * `crossSessionInbound` is real: it appears in CLI 2.1.235's binary alongside a
 * `peer_inbound_gate`, and `accept` and `refuse` were both observed as values.
 * `hold` was NOT observed — it is named by the design and implied by a "not
 * parking a late peer message" log line, and nothing more. So it validates as a
 * WARNING that says exactly that, and the save proceeds. Refusing it outright
 * would make Helm less capable than the text editor the user can already open
 * the same file in, on the strength of a guess about a value that is probably
 * fine.
 *
 * A value outside the three IS an error: that is not an unverified guess, it is
 * a value the CLI has no branch for.
 */

import type {
  HelmSaveRequest,
  HelmValidation,
  HelmValidationIssue,
} from '../../shared/contracts/helm';
import {
  CROSS_SESSION_INBOUND_CONFIRMED,
  CROSS_SESSION_INBOUND_VALUES,
} from '../../shared/contracts/helm';

/** The CLI build the confirmed value set was read out of. Named in the warning. */
export const OBSERVED_CLI_VERSION = '2.1.235';

export const HOLD_WARNING_MESSAGE =
  `'hold' was not confirmed as an accepted value in CLI ${OBSERVED_CLI_VERSION} — ` +
  `only '${CROSS_SESSION_INBOUND_CONFIRMED.join("' and '")}' were observed in that build. ` +
  'Saving it is allowed; the CLI may ignore it.';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pure: it inspects the REQUEST only and never touches a disk. Everything that
 * depends on the file's current state — a conflict, an unparseable target — is
 * decided in `save`, where the file has just been re-read.
 */
export function validateSaveRequest(req: HelmSaveRequest): HelmValidation {
  const issues: HelmValidationIssue[] = [];
  const { managed } = req;

  // hooksJson — a validated RAW JSON pane, never a builder.
  if (req.hooksJson.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(req.hooksJson);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        issues.push({
          field: 'hooksJson',
          severity: 'error',
          message: 'hooks must be a JSON object.',
        });
      }
    } catch (err) {
      issues.push({
        field: 'hooksJson',
        severity: 'error',
        // The parser's own message names the offset, which is the only part
        // that helps someone fix the text in front of them.
        message: `hooks is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // env — every value must be a string; the CLI passes them to the child process.
  if (!isPlainObject(managed.env)) {
    issues.push({ field: 'env', severity: 'error', message: 'env must be an object.' });
  } else {
    for (const [key, value] of Object.entries(managed.env)) {
      if (typeof value !== 'string') {
        issues.push({
          field: 'env',
          severity: 'error',
          message: `env.${key} must be a string, but it is ${value === null ? 'null' : typeof value}.`,
        });
      }
    }
  }

  // model
  if (managed.model !== null && typeof managed.model !== 'string') {
    issues.push({ field: 'model', severity: 'error', message: 'model must be a string.' });
  }

  // permissions
  for (const [field, list] of [
    ['permissionsAllow', managed.permissionsAllow],
    ['permissionsDeny', managed.permissionsDeny],
  ] as const) {
    if (!Array.isArray(list)) {
      issues.push({ field, severity: 'error', message: `${field} must be an array of rule strings.` });
      continue;
    }
    if (list.some((rule) => typeof rule !== 'string')) {
      issues.push({ field, severity: 'error', message: `${field} must contain only rule strings.` });
    }
  }

  // crossSessionInbound
  const inbound = managed.crossSessionInbound;
  if (inbound !== null) {
    if (!(CROSS_SESSION_INBOUND_VALUES as readonly string[]).includes(inbound as string)) {
      issues.push({
        field: 'crossSessionInbound',
        severity: 'error',
        message:
          `crossSessionInbound must be one of ${CROSS_SESSION_INBOUND_VALUES.join(', ')}, ` +
          `but it is ${JSON.stringify(inbound)}.`,
      });
    } else if (!CROSS_SESSION_INBOUND_CONFIRMED.includes(inbound)) {
      issues.push({
        field: 'crossSessionInbound',
        severity: 'warning',
        message: HOLD_WARNING_MESSAGE,
      });
    }
  }

  return { issues };
}

export function blockingIssues(validation: HelmValidation): HelmValidationIssue[] {
  return validation.issues.filter((issue) => issue.severity === 'error');
}

export function warningIssues(validation: HelmValidation): HelmValidationIssue[] {
  return validation.issues.filter((issue) => issue.severity === 'warning');
}
