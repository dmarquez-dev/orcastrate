import type { JSX } from 'react';

import styles from './EmptyWorkspace.module.css';

export interface EmptyWorkspaceProps {
  /** Opens the New Pod dialog. The only affordance this state offers. */
  onNewPod(): void;
}

/**
 * The first-run state (frozen `renderer-view.ts`, `WorkspaceLayoutProps.empty`):
 * rendered instead of the rail, transcript and composer when there is no active
 * Pod. Its only affordance is opening the New Pod dialog.
 */
export function EmptyWorkspace({ onNewPod }: EmptyWorkspaceProps): JSX.Element {
  return (
    <section className={styles.empty} aria-labelledby="empty-workspace-heading">
      <h1 className={styles.heading} id="empty-workspace-heading">
        No Pod open
      </h1>
      <p className={styles.body}>
        A Pod is one Claude Code session in one working directory. Create one to start.
      </p>
      <button className={styles.action} type="button" onClick={onNewPod}>
        New Pod
      </button>
    </section>
  );
}

/**
 * Shown while `WorkspaceStore.routingMode` is still unresolved. It is a
 * separate state from `EmptyWorkspace` on purpose: rendering the rail and the
 * transcript before `app.routingMode()` answers would force a consumer to
 * assume `'lanes'`, which the frozen contract forbids.
 */
export function LoadingWorkspace(): JSX.Element {
  return (
    <section className={styles.empty} aria-labelledby="loading-workspace-heading">
      <h1 className={styles.heading} id="loading-workspace-heading">
        Starting up
      </h1>
      <p className={styles.body} role="status">
        Reading the workspace.
      </p>
    </section>
  );
}
