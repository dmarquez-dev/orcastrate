/**
 * Save, Discard, Reload. Presentation only: three booleans in, three callbacks
 * out.
 *
 * SAVE IS OFF FOR EXACTLY THREE REASONS and they are independent, which is why
 * `saveDisabledReasons` is exported and unit-tested rather than inlined into
 * the JSX:
 *
 *   - `blocked` — an issue of severity `error`, including the `parseError` that
 *     makes the whole form read-only.
 *   - `saving`  — a save is in flight.
 *   - not `dirty` — there is nothing to write.
 *
 * A STALE BANNER IS NOT ONE OF THEM. The authoritative guard is the service's
 * re-read-and-compare at save time; a banner that also disabled Save would
 * imply the banner was the guard, and `fs.watch` misses events. So stale warns
 * and Save stays live.
 *
 * RELOAD IS ALWAYS ON SCREEN, and is the single affordance both the stale
 * banner and the conflict banner point at. One button rather than one per
 * banner, so the `helmReload` test id names exactly one element however many
 * banners are up.
 */

import type { JSX } from 'react';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { cx } from './cx';
import styles from './Helm.module.css';

export interface SaveState {
  blocked: boolean;
  saving: boolean;
  dirty: boolean;
}

/** The reasons Save is off, in the order a user would hit them. */
export function saveDisabledReasons(state: SaveState): string[] {
  const reasons: string[] = [];
  if (state.blocked) reasons.push('blocked');
  if (state.saving) reasons.push('saving');
  if (!state.dirty) reasons.push('clean');
  return reasons;
}

export interface HelmActionBarProps extends SaveState {
  /** False before a scope is chosen: there is nothing to re-read. */
  canReload: boolean;
  onSave(): void;
  onDiscard(): void;
  onReload(): void;
}

export function HelmActionBar({
  blocked,
  saving,
  dirty,
  canReload,
  onSave,
  onDiscard,
  onReload,
}: HelmActionBarProps): JSX.Element {
  const saveOff = saveDisabledReasons({ blocked, saving, dirty }).length > 0;

  return (
    <div className={styles.actions}>
      <button
        className={cx(styles.button, styles.primary)}
        data-testid={PANEL_TEST_IDS.helmSave}
        disabled={saveOff}
        onClick={onSave}
        type="button"
      >
        {saving ? COPY.saving : COPY.save}
      </button>
      <button
        className={styles.button}
        data-testid={PANEL_TEST_IDS.helmDiscard}
        disabled={!dirty || saving}
        onClick={onDiscard}
        type="button"
      >
        {COPY.discard}
      </button>
      <button
        className={cx(styles.button, styles.actionsSpacer)}
        data-testid={PANEL_TEST_IDS.helmReload}
        disabled={!canReload || saving}
        onClick={onReload}
        type="button"
      >
        {COPY.reload}
      </button>
    </div>
  );
}
