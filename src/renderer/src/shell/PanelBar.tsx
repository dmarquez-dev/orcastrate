import { useEffect, useId, useRef, type JSX, type KeyboardEvent } from 'react';

import {
  PANEL_DESCRIPTIONS,
  PANEL_LABELS,
  PANEL_TEST_IDS,
  type PanelBarProps,
  type PanelKey,
} from '../contracts/renderer-panels';
import a11y from './a11y.module.css';
import styles from './PanelBar.module.css';
import { testId } from './contract-runtime';

/**
 * The panel strip (frozen `renderer-panels.ts`, `PanelBarProps`).
 *
 * A presentation component: it takes `open` and two callbacks and knows where
 * none of them came from. Which panel is open is `App.tsx` local state and
 * lives nowhere else — a copy here would be a second owner of one fact.
 *
 * ONE BUTTON PER `PanelKey`, DERIVED RATHER THAN LISTED. The order comes from
 * `PANEL_LABELS`' own declaration order, so a third panel added to the frozen
 * map gets a button without anyone remembering to edit a parallel array here.
 *
 * COPY IS THE CONTRACT'S, VERBATIM. The label is the button's accessible name;
 * the description is a screen-reader-only sentence referenced by
 * `aria-describedby` (and repeated as the `title` tooltip), because a 32px
 * strip has no room for a sentence but a user has every right to hear one
 * before opening a panel that deletes files.
 *
 * OPEN STATE IS NOT CARRIED BY COLOUR. `aria-pressed` says it, and
 * `PanelBar.module.css` paints from that attribute.
 *
 * FOCUS RETURNS HERE ON CLOSE. Whatever closed the panel — this strip's close
 * button, the Escape key inside the region — `open` becomes null, and the
 * effect below puts focus back on the button that opened it. Focus after an
 * action that changes what is on screen has to land somewhere predictable, and
 * the trigger is the one place the user can reason about.
 */
export function PanelBar({ open, onOpen, onClose }: PanelBarProps): JSX.Element {
  const keys = Object.keys(PANEL_LABELS) as PanelKey[];
  const descriptionId = useId();

  const buttons = useRef(new Map<PanelKey, HTMLButtonElement | null>());
  const previouslyOpen = useRef<PanelKey | null>(open);

  useEffect(() => {
    const previous = previouslyOpen.current;
    previouslyOpen.current = open;
    if (open !== null || previous === null) return;
    buttons.current.get(previous)?.focus();
  }, [open]);

  // Escape closes from the strip too. The region handles the same key, but
  // focus can legitimately be back on a strip button — tabbing out of the
  // panel — and the key should not go dead there.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape' || open === null) return;
    event.preventDefault();
    onClose();
  }

  return (
    <div
      aria-label="Panels"
      className={styles.panelBar}
      data-testid={PANEL_TEST_IDS.panelBar}
      onKeyDown={handleKeyDown}
      role="group"
    >
      {keys.map((key) => (
        <span key={key}>
          <button
            aria-describedby={`${descriptionId}-${key}`}
            aria-pressed={open === key}
            className={styles.button}
            data-testid={testId(PANEL_TEST_IDS.panelBarOpen, key)}
            onClick={() => {
              if (open === key) {
                onClose();
                return;
              }
              onOpen(key);
            }}
            ref={(node) => {
              buttons.current.set(key, node);
            }}
            title={PANEL_DESCRIPTIONS[key]}
            type="button"
          >
            {PANEL_LABELS[key]}
          </button>
          <span className={a11y.srOnly} id={`${descriptionId}-${key}`}>
            {PANEL_DESCRIPTIONS[key]}
          </span>
        </span>
      ))}

      <span className={styles.spacer} />

      {open === null ? null : (
        <button
          className={`${styles.button} ${styles.close}`}
          data-testid={PANEL_TEST_IDS.panelBarClose}
          onClick={onClose}
          type="button"
        >
          {`Close ${PANEL_LABELS[open]}`}
        </button>
      )}
    </div>
  );
}
