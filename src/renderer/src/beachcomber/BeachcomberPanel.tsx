import { useId, useRef, type JSX } from 'react';

import { PANEL_TEST_IDS, type BeachcomberPanelProps } from '../contracts/renderer-panels';
import { BeachcomberError } from './BeachcomberError';
import { BeachcomberGroup } from './BeachcomberGroup';
import { BeachcomberHeader } from './BeachcomberHeader';
import { BeachcomberPreviewDialog } from './BeachcomberPreviewDialog';
import { BeachcomberResult } from './BeachcomberResult';
import { BeachcomberStatus } from './BeachcomberStatus';
import { BeachcomberToolbar } from './BeachcomberToolbar';
import styles from './Beachcomber.module.css';

/**
 * The Beachcomber panel (design section 6).
 *
 * THIS FILE ARRANGES AND NOTHING ELSE. It renders no sentence of its own: every
 * word on screen belongs to one of the seven components below or to a view
 * model the state layer derived. It also FETCHES NOTHING — it states what it
 * needs through `BeachcomberPanelProps` and the scan is issued by the hook's
 * mount, never by a render.
 *
 * THERE IS NO PATH FROM A ROW TO A DELETION. `actions.trashPreviewed` is passed
 * to exactly one child, the preview dialog, and that dialog only exists while
 * `view.preview` is non-null. Grep this directory for `trashPreviewed`: it
 * appears here, once, and in the dialog's confirm handler.
 */
export function BeachcomberPanel({ view, actions }: BeachcomberPanelProps): JSX.Element {
  const headingId = useId();
  // The focus destination of last resort. Confirming the preview disables the
  // button that opened it, and focus must land somewhere the user can see.
  const panelRef = useRef<HTMLElement>(null);

  const scanning = view.phase === 'loading';

  return (
    <section
      aria-labelledby={headingId}
      className={styles.panel}
      data-testid={PANEL_TEST_IDS.beachcomberPanel}
      ref={panelRef}
      tabIndex={-1}
    >
      <BeachcomberHeader headingId={headingId} />

      <BeachcomberToolbar
        onClearSelection={actions.clearSelection}
        onRequestPreview={() => {
          void actions.requestPreview();
        }}
        onRescan={() => {
          void actions.rescan();
        }}
        previewing={view.previewing}
        scanning={scanning}
        selectedBytes={view.selectedBytes}
        selectedCount={view.selectedIds.length}
        trashing={view.trashing}
      />

      <BeachcomberError actionError={view.actionError} error={view.error} />
      <BeachcomberStatus groupCount={view.value.length} phase={view.phase} />

      {view.lastResult === null ? null : <BeachcomberResult result={view.lastResult} />}

      <div className={styles.groups}>
        {view.value.map((group) => (
          <BeachcomberGroup
            group={group}
            key={group.root}
            onToggleGroup={actions.toggleGroup}
            onToggleRow={actions.toggle}
          />
        ))}
      </div>

      {view.preview === null ? null : (
        <BeachcomberPreviewDialog
          fallbackFocusRef={panelRef}
          onCancel={actions.dismissPreview}
          onConfirm={() => {
            void actions.trashPreviewed();
          }}
          preview={view.preview}
          trashing={view.trashing}
        />
      )}
    </section>
  );
}
