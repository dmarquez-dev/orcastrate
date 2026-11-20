/**
 * The main -> renderer push surface.
 *
 * Every Pod-pipeline channel in `EVENT_CHANNELS` is emitted through exactly one
 * method here. `push:helmChanged` is the exception: HelmService's watcher sends
 * it through the same sink, not through this object. The channel names come
 * from the frozen contract rather than from string literals, so a rename cannot
 * desync main from the preload bridge.
 *
 * `send` is injected because the transport differs by caller: production sends
 * to every live `BrowserWindow.webContents`; a test collects into an array.
 * Nothing in this file imports `electron`, which is what lets PodManager be
 * tested in a plain Node vitest environment.
 */

import {
  EVENT_CHANNELS,
  type AutoModeSupportPush,
  type LaneChangedPush,
  type PermissionRequestedPush,
  type PermissionResolvedPush,
  type PodCommandsPush,
  type PodEventPush,
  type PodStatusPush,
} from '../../shared/contracts/ipc';

export type SendToRenderer = (channel: string, payload: unknown) => void;

export interface Pushes {
  podEvent(payload: PodEventPush): void;
  podStatus(payload: PodStatusPush): void;
  laneChanged(payload: LaneChangedPush): void;
  permissionRequested(payload: PermissionRequestedPush): void;
  permissionResolved(payload: PermissionResolvedPush): void;
  /** A snapshot, so it is sent even when `commands` is empty. */
  podCommands(payload: PodCommandsPush): void;
  /** The app-level cached auto-mode flag; the caller sends it only on change. */
  autoModeSupport(payload: AutoModeSupportPush): void;
}

export function createPushes(send: SendToRenderer): Pushes {
  return {
    podEvent(payload) {
      // Contract: "Batched in `seq` order. Never empty."
      if (payload.events.length === 0) return;
      send(EVENT_CHANNELS.podEvent, payload);
    },
    podStatus(payload) {
      send(EVENT_CHANNELS.podStatus, payload);
    },
    laneChanged(payload) {
      send(EVENT_CHANNELS.laneChanged, payload);
    },
    permissionRequested(payload) {
      send(EVENT_CHANNELS.permissionRequested, payload);
    },
    permissionResolved(payload) {
      send(EVENT_CHANNELS.permissionResolved, payload);
    },
    podCommands(payload) {
      send(EVENT_CHANNELS.podCommands, payload);
    },
    autoModeSupport(payload) {
      send(EVENT_CHANNELS.autoModeSupport, payload);
    },
  };
}
