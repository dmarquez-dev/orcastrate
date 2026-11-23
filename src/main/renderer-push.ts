/**
 * The main process's broadcast to every renderer, and the logger for a
 * renderer process that disappears.
 *
 * A push must never be able to crash main or stop the other windows from
 * receiving it. A window can be destroyed, its webContents can be destroyed or
 * crashed, and its main frame can be destroyed, detached, or unreadable — the
 * `mainFrame` getter itself can throw once the frame is disposed. Each window
 * is therefore attempted on its own inside a try/catch: the pre-checks skip
 * the states that can be detected, and the catch is the guarantee for the
 * ones that cannot.
 *
 * This module imports nothing from `electron`. Its window and webContents
 * parameters are structural interfaces that Electron's `BrowserWindow`
 * satisfies, so the bootstrap hands in `BrowserWindow.getAllWindows` and the
 * tests hand in plain objects.
 */

/** The part of Electron's `WebFrameMain` the broadcast reads. */
export interface PushFrame {
  isDestroyed(): boolean;
  readonly detached: boolean;
}

/** The part of Electron's `WebContents` the broadcast reads. */
export interface PushWebContents {
  readonly id: number;
  isDestroyed(): boolean;
  isCrashed(): boolean;
  readonly mainFrame: PushFrame;
  send(channel: string, ...args: unknown[]): void;
}

/** The part of Electron's `BrowserWindow` the broadcast reads. */
export interface PushWindow {
  isDestroyed(): boolean;
  readonly webContents: PushWebContents;
}

/** Receives one complete log line. */
export type PushLogSink = (line: string) => void;

export interface RendererPushDeps {
  /** Returns the windows open at the moment of the push. */
  readonly getWindows: () => readonly PushWindow[];
  readonly log: PushLogSink;
}

export type RendererPush = (channel: string, payload: unknown) => void;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Builds the broadcast. Dependencies are fixed here, at construction.
 *
 * Failures are logged once per failure episode, per webContents `id`: the
 * first throw for an id logs one line and marks it failing, later throws for
 * a marked id log nothing, and a send that completes clears the mark. A skip
 * that throws nothing logs nothing and leaves the mark as it is. The payload
 * is never logged — only the channel, the id and the error's message.
 */
export function createRendererPush(deps: RendererPushDeps): RendererPush {
  const { getWindows, log } = deps;
  const failing = new Set<number | undefined>();

  return (channel: string, payload: unknown): void => {
    for (const window of getWindows()) {
      let id: number | undefined;
      try {
        if (window.isDestroyed()) continue;
        const contents = window.webContents;
        id = contents.id;
        if (contents.isDestroyed()) continue;
        if (contents.isCrashed()) continue;
        const frame = contents.mainFrame;
        if (frame.isDestroyed() || frame.detached) continue;
        contents.send(channel, payload);
        failing.delete(id);
      } catch (err) {
        // Deliberately not rethrown. A push is best-effort: a renderer that
        // missed one re-reads its state when it next loads. A throw here would
        // instead unwind the caller — the event-persist path that emitted the
        // push — and skip every window after this one.
        if (failing.has(id)) continue;
        failing.add(id);
        log(
          `[orcastrate] renderer push on "${channel}" failed for webContents ${
            id === undefined ? 'unknown' : String(id)
          }: ${errorMessage(err)}; further failures for it are not logged until a push succeeds`,
        );
      }
    }
  };
}

/** The part of Electron's `RenderProcessGoneDetails` the logger reads. */
export interface RenderProcessGoneInfo {
  readonly reason: string;
  readonly exitCode: number;
}

export type RenderProcessGoneListener = (
  event: unknown,
  webContents: { readonly id: number },
  details: RenderProcessGoneInfo,
) => void;

/**
 * Builds the listener for the App's `render-process-gone` event, which fires
 * for every webContents, including windows opened after it was registered. It
 * logs the reason, exit code and webContents id, so a disposed frame seen by
 * the broadcast can be traced back to the process loss that caused it.
 */
export function createRenderProcessGoneLogger(log: PushLogSink): RenderProcessGoneListener {
  return (_event, webContents, details): void => {
    log(
      `[orcastrate] renderer process gone for webContents ${String(webContents.id)}: reason ${details.reason}, exit code ${String(details.exitCode)}`,
    );
  };
}
