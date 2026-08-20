/**
 * The form's ARRANGEMENT: exactly the design's five fields, in order, each one
 * handed the slice of the draft it edits and a callback that returns a whole
 * `HelmManagedFields`. It renders no control of its own.
 *
 * `disabled` is one flag for the whole form because there is exactly one
 * reason to disable it — `parseError`, where Helm must never offer to overwrite
 * a file it could not read. Nothing else here turns a field off.
 */

import type { JSX } from 'react';

import type { HelmManagedFields, HelmValidationIssue } from '@shared/contracts/helm';
import type { HelmDraft } from '../contracts/renderer-panels';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { CrossSessionInboundField } from './CrossSessionInboundField';
import { EnvEditor } from './EnvEditor';
import { HooksPane } from './HooksPane';
import { issuesFor } from './issues';
import { ModelField } from './ModelField';
import styles from './Helm.module.css';
import { StringListEditor } from './StringListEditor';

export interface HelmSettingsFormProps {
  draft: HelmDraft;
  disabled: boolean;
  issues: readonly HelmValidationIssue[];
  onManaged(next: HelmManagedFields): void;
  onHooks(next: string): void;
}

export function HelmSettingsForm({
  draft,
  disabled,
  issues,
  onManaged,
  onHooks,
}: HelmSettingsFormProps): JSX.Element {
  const managed = draft.managed;

  return (
    <>
      <fieldset className={styles.section} disabled={disabled}>
        <legend className={styles.legend}>{COPY.formLegend}</legend>
        <ModelField
          disabled={disabled}
          issues={issuesFor(issues, 'model')}
          onChange={(model) => {
            onManaged({ ...managed, model });
          }}
          value={managed.model}
        />
      </fieldset>

      <StringListEditor
        addLabel={COPY.allowAdd}
        addTestId={PANEL_TEST_IDS.helmAllowAdd}
        disabled={disabled}
        domId="helm-allow"
        emptyLabel={COPY.allowEmpty}
        issues={issuesFor(issues, 'permissionsAllow')}
        itemLabel={COPY.allowItemLabel}
        legend={COPY.allowLegend}
        listTestId={PANEL_TEST_IDS.helmAllowList}
        onChange={(permissionsAllow) => {
          onManaged({ ...managed, permissionsAllow });
        }}
        values={managed.permissionsAllow}
      />

      <StringListEditor
        addLabel={COPY.denyAdd}
        addTestId={PANEL_TEST_IDS.helmDenyAdd}
        disabled={disabled}
        domId="helm-deny"
        emptyLabel={COPY.denyEmpty}
        issues={issuesFor(issues, 'permissionsDeny')}
        itemLabel={COPY.denyItemLabel}
        legend={COPY.denyLegend}
        listTestId={PANEL_TEST_IDS.helmDenyList}
        onChange={(permissionsDeny) => {
          onManaged({ ...managed, permissionsDeny });
        }}
        values={managed.permissionsDeny}
      />

      <EnvEditor
        disabled={disabled}
        env={managed.env}
        issues={issuesFor(issues, 'env')}
        onChange={(env) => {
          onManaged({ ...managed, env });
        }}
      />

      <CrossSessionInboundField
        disabled={disabled}
        issues={issuesFor(issues, 'crossSessionInbound')}
        onChange={(crossSessionInbound) => {
          onManaged({ ...managed, crossSessionInbound });
        }}
        value={managed.crossSessionInbound}
      />

      <HooksPane
        disabled={disabled}
        issues={issuesFor(issues, 'hooksJson')}
        onChange={onHooks}
        value={draft.hooksJson}
      />
    </>
  );
}
