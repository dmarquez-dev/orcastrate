/**
 * The side-by-side the frozen `HELM_CONFLICT_CODE` docblock has promised since
 * 2026-08-19: the file's current contents beside the edit that has not been
 * written.
 *
 * PRESENTATION ONLY. Four props in, no hook, no store, no bridge — it renders
 * in a test with no provider at all, which is the whole reason the pairing
 * lives in `comparison.ts` and the fetching lives in `compare()`.
 *
 * ALL FOUR STATES ARE HERE, per the frontend discipline: loading (`comparing`),
 * error (the verbatim message from the failed read), empty (nothing has been
 * fetched, or the last fetch failed and cleared `incoming`), and the table.
 * They are mutually exclusive and are checked in that order — a fetch that is
 * in flight is not also empty, whatever the last one left behind.
 *
 * COLOUR IS NEVER THE ONLY CARRIER: every row says "Differs" or "Unchanged" in
 * words, so the row's emphasis is a second signal rather than the only one.
 */

import type { JSX } from 'react';

import type { HelmDocument } from '@shared/contracts/helm';
import type { HelmDraft } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { comparisonRows } from './comparison';
import { cx } from './cx';
import { HELM_SAFETY_TEST_IDS, comparisonCellId } from './test-ids';
import styles from './Helm.module.css';

const HEADING_ID = 'helm-comparison-heading';

export interface HelmComparisonProps {
  /** The freshest on-disk document, or `null` when there is no comparison. */
  incoming: HelmDocument | null;
  /** The pending edit. `null` before a scope is chosen. */
  draft: HelmDraft | null;
  /** True while a `compare()` is in flight. */
  comparing: boolean;
  /** The verbatim message from a failed comparison, or `null`. */
  error: string | null;
}

export function HelmComparison({
  incoming,
  draft,
  comparing,
  error,
}: HelmComparisonProps): JSX.Element {
  return (
    <section
      aria-labelledby={HEADING_ID}
      className={styles.comparison}
      data-testid={HELM_SAFETY_TEST_IDS.comparison}
    >
      <h3 className={styles.comparisonHeading} id={HEADING_ID}>
        {COPY.comparisonHeading}
      </h3>
      <ComparisonBody comparing={comparing} draft={draft} error={error} incoming={incoming} />
    </section>
  );
}

function ComparisonBody({
  incoming,
  draft,
  comparing,
  error,
}: HelmComparisonProps): JSX.Element {
  if (comparing) {
    return (
      <p
        className={styles.status}
        data-testid={HELM_SAFETY_TEST_IDS.comparisonLoading}
        role="status"
      >
        {COPY.comparisonLoading}
      </p>
    );
  }

  if (error !== null) {
    // Verbatim, `white-space: pre-wrap`, exactly as the other Helm surfaces
    // print what main wrote. The heading says what failed; the message says
    // why, in the operating system's own words.
    return (
      <p
        className={cx(styles.noticeText, styles.comparisonError)}
        data-testid={HELM_SAFETY_TEST_IDS.comparisonError}
        role="alert"
      >
        {error}
      </p>
    );
  }

  if (incoming === null || draft === null) {
    return (
      <p className={styles.empty} data-testid={HELM_SAFETY_TEST_IDS.comparisonEmpty}>
        {COPY.comparisonEmpty}
      </p>
    );
  }

  return (
    <table className={styles.comparisonTable} data-testid={HELM_SAFETY_TEST_IDS.comparisonTable}>
      <thead>
        <tr>
          <th className={styles.comparisonHead} scope="col">
            {COPY.comparisonFieldColumn}
          </th>
          <th className={styles.comparisonHead} scope="col">
            {COPY.comparisonDiskColumn}
          </th>
          <th className={styles.comparisonHead} scope="col">
            {COPY.comparisonDraftColumn}
          </th>
        </tr>
      </thead>
      <tbody>
        {comparisonRows(incoming, draft).map((row) => (
          <tr className={cx(styles.comparisonRow, row.changed && styles.comparisonChanged)} key={row.field}>
            <th className={styles.comparisonRowHead} scope="row">
              <span className={styles.comparisonLabel}>{row.label}</span>
              <span className={styles.comparisonVerdict}>
                {row.changed ? COPY.comparisonDiffers : COPY.comparisonSame}
              </span>
            </th>
            <td
              className={styles.comparisonCell}
              data-testid={comparisonCellId(HELM_SAFETY_TEST_IDS.comparisonDisk, row.field)}
            >
              {row.disk}
            </td>
            <td
              className={styles.comparisonCell}
              data-testid={comparisonCellId(HELM_SAFETY_TEST_IDS.comparisonDraft, row.field)}
            >
              {row.edit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
