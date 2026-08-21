import { useCallback, useId, useState, type ReactNode } from 'react';

import styles from './Transcript.module.css';

/**
 * THE DISCLOSURE (`contracts/transcript-turns.ts` section 3). The ways to get
 * "collapsed and expandable" wrong are all silent, so each of them is closed
 * here rather than left to a convention:
 *
 *  - a REAL `<button type="button">`. Not a `<div onClick>`, and not a
 *    `<summary>` inside a `<details>` — `<details>` cannot be driven by the
 *    `aria-expanded` assertions the contract requires and its open state is
 *    not a React-owned value;
 *  - `aria-expanded` reflects the state truthfully in BOTH directions;
 *  - the ACCESSIBLE NAME states the action and the size, and it is an
 *    `aria-label` so `getByRole('button', { name })` — strictly stronger than a
 *    test id, because it fails when the name regresses — is what a suite
 *    selects by;
 *  - `aria-controls` points at a region that is REMOVED FROM THE DOM while
 *    collapsed, not merely visually hidden, so the attribute and the page
 *    agree;
 *  - the chevron is `aria-hidden`: it is decoration, and the NAME carries the
 *    state;
 *  - focus stays on the control across a toggle. A control that moves focus on
 *    expand loses the reader's place.
 *
 * PER-EVENT STATE, HELD HERE. Which rows a reader has opened is client
 * interaction state; lifting it to the pane would make one reader's expansion
 * follow the lane into the other pane. Holding it inside the memoised
 * `TranscriptEventItem` does not defeat `memo` — only a callback or an object
 * created in the PANE and passed down per item would, and nothing new is.
 *
 * `renderBody` IS A FUNCTION, NOT A `ReactNode`. A node would force the caller
 * to evaluate `preview(content)` on every render whether or not the region is
 * open, which for a multi-megabyte tool result is the whole cost the collapse
 * exists to avoid.
 */
export interface ToolDisclosureProps {
  /** The accessible name while collapsed, e.g. `Show tool result (312 chars)`. */
  showLabel: string;
  /** The accessible name while expanded, e.g. `Hide tool result (312 chars)`. */
  hideLabel: string;
  /** Visible text on the control. The chevron is added here, decoratively. */
  summary: ReactNode;
  /**
   * `true` for a `tool_result` whose `isError` is set — same argument that
   * exempts `error` and `malformed` from the noise filter: a failure the user
   * must know to go looking for is a silent drop in every way that matters to
   * them.
   */
  expandedInitially?: boolean;
  /** The `└` marker that makes a result READ as attached to the call above it. */
  attached?: boolean;
  /** Extra class on the revealed region — `styles.failed` for an error result. */
  bodyClassName?: string;
  renderBody: () => ReactNode;
}

export function ToolDisclosure({
  showLabel,
  hideLabel,
  summary,
  expandedInitially = false,
  attached = false,
  bodyClassName,
  renderBody,
}: ToolDisclosureProps) {
  const [expanded, setExpanded] = useState(expandedInitially);
  const regionId = useId();
  const toggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  const label = expanded ? hideLabel : showLabel;

  return (
    <>
      <div className={styles.toolRow}>
        {attached ? (
          <span className={styles.attachGlyph} aria-hidden="true">
            └
          </span>
        ) : null}
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={expanded}
          aria-controls={regionId}
          aria-label={label}
          title={label}
          onClick={toggle}
        >
          <span className={styles.disclosureSummary}>{summary}</span>
          <span className={styles.chevron} aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        </button>
      </div>
      {expanded ? (
        <pre
          className={
            bodyClassName === undefined
              ? styles.eventCode
              : `${styles.eventCode} ${bodyClassName}`
          }
          id={regionId}
        >
          {renderBody()}
        </pre>
      ) : null}
    </>
  );
}
