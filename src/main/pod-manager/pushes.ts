/**
 * The main -> renderer push surface.
 *
 * Every one of the five `EVENT_CHANNELS` is emitted through exactly one method
 * here, and the channel names come from the frozen contract rather than from
 * string literals, so a rename cannot desync main from the preload bridge.
 *
 * `send` is injected because the transport differs by caller: production sends
 * to every live `BrowserWindow.webContents`; a test collects into an array.
 * Nothing in this file imports `electron`, which is what lets PodManager be
 * tested in a plain Node vitest environment.
 */

import {
  EVENT_CHANNELS,
  type LaneChangedPush,
  type PermissionRequestedPush,
  type PermissionResolvedPush,
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
  };
}
