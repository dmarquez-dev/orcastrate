import { useMemo, useState, type JSX, type ReactNode } from 'react';

import type { LaneId } from '@shared/contracts/events';
import type { PanelKey } from './contracts/renderer-panels';
import type { PermissionRespondArgs } from './contracts/renderer-view';
import {
  useComposer,
  useLaneRail,
  usePermissionCards,
  useTranscript,
  useWorkspace,
} from './state';
import { Composer } from './composer';
import { LaneRail } from './lanes';
import { PermissionCardList } from './permissions';
import { TranscriptPane } from './transcript';
import { PodsChrome } from './pods/PodsChrome';
import { BeachcomberPanelConnected } from './beachcomber';
import { ConnectedHelmPanel } from './helm';
import { EmptyWorkspace, LoadingWorkspace } from './shell/EmptyWorkspace';
import { PanelBar } from './shell/PanelBar';
import { PanelRegion } from './shell/PanelRegion';
import { WorkspaceLayout } from './shell/WorkspaceLayout';

/**
 * The workspace, assembled.
 *
 * `App` is an ARRANGER: it reads the state layer's hooks, hands each region's
 * data to the component that owns that region, and renders nothing itself. The
 * regions come from four different tasks and `WorkspaceLayout` knows about
 * none of them — they arrive as slots (frozen `renderer-view.ts`).
 */
export function App(): JSX.Element {
  const [newPodOpen, setNewPodOpen] = useState(false);

  // WHICH PANEL IS OPEN LIVES HERE AND NOWHERE ELSE. It is client interaction
  // state, not server data, so per the frontend discipline it does not go in
  // the workspace store — `panel-provider.tsx` says the same thing from the
  // other side, and its suite asserts the store has no such field. Nothing
  // outside this file needs to know: the strip is told, the region is told.
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  const { activePodId, session, routingMode, actions } = useWorkspace();
  const rail = useLaneRail();

  // The Pod's lane registry, flattened once. `TranscriptPane` memoizes on
  // `lanes` identity and there are two call sites, so mapping inline would hand
  // each pane a fresh array on every render. `Loadable.value` is never
  // undefined (renderer-state.ts): while the registry loads it is simply empty,
  // which is what the panes are given — no `[]` default hides a real registry.
  const lanes = useMemo(() => rail.value.map((row) => row.lane), [rail.value]);

  const selectedLaneId = session?.selectedLaneId ?? null;
  const pinnedLaneId = session?.pinnedLaneId ?? null;

  // Hooks are unconditional; whether their output is RENDERED is decided below.
  const primaryView = useTranscript(selectedLaneId);
  const splitView = useTranscript(pinnedLaneId);
  const primaryCards = usePermissionCards(selectedLaneId);
  const splitCards = usePermissionCards(pinnedLaneId);
  const composer = useComposer();

  const podBar = (
    <PodsChrome
      dialogOpen={newPodOpen}
      onDismissNewPod={() => {
        setNewPodOpen(false);
      }}
      onRequestNewPod={() => {
        setNewPodOpen(true);
      }}
    />
  );

  const closePanel = (): void => {
    setOpenPanel(null);
  };

  const panelBar = <PanelBar onClose={closePanel} onOpen={setOpenPanel} open={openPanel} />;

  // PANELS DO NOT REQUIRE A POD, so this is decided before `empty` is and
  // independently of it. Cleanup and settings are precisely what a user with
  // no Pods reaches for. Mounting the connected panel is also what issues its
  // first fetch — the hooks' own mount effects do that — so nothing here
  // fetches, and neither panel's hook is mounted while its panel is closed.
  const panel: ReactNode =
    openPanel === null ? null : (
      <PanelRegion onClose={closePanel} panelKey={openPanel}>
        {openPanel === 'beachcomber' ? <BeachcomberPanelConnected /> : <ConnectedHelmPanel />}
      </PanelRegion>
    );

  // `routingMode` is null until `app.routingMode()` answers. Rendering the
  // rail or the transcript before then would force a `'lanes'` assumption,
  // which the frozen contract forbids — so the shell waits instead.
  const empty: ReactNode | undefined =
    routingMode === null ? (
      <LoadingWorkspace />
    ) : activePodId === null || session === undefined ? (
      <EmptyWorkspace
        onNewPod={() => {
          setNewPodOpen(true);
        }}
      />
    ) : undefined;

  let laneRail: ReactNode = null;
  let primary: ReactNode = null;
  let split: ReactNode = null;
  let composerNode: ReactNode = null;

  if (empty === undefined && routingMode !== null && session !== undefined) {
    const podId = session.podId;
    const laneOf = (laneId: LaneId | null) =>
      laneId === null ? null : (rail.value.find((row) => row.lane.id === laneId)?.lane ?? null);

    const respond = (req: PermissionRespondArgs): void => {
      void actions.respondToPermission(req);
    };
    const jumpToLane = (laneId: LaneId): void => {
      actions.jumpToLane(podId, laneId);
    };

    laneRail = (
      <LaneRail
        onPin={(laneId) => {
          actions.pinLane(podId, laneId);
        }}
        onSelect={(laneId) => {
          actions.selectLane(podId, laneId);
        }}
        onSteer={(laneId) => {
          actions.steerFromLane(podId, laneId);
        }}
        onUnpin={() => {
          actions.unpinLane(podId);
        }}
        routingMode={routingMode}
        rows={rail.value}
      />
    );

    primary = (
      <TranscriptPane
        hasMore={session.backfill.hasMore}
        isSplit={false}
        lane={laneOf(selectedLaneId)}
        lanes={lanes}
        onJumpToLane={jumpToLane}
        onLoadMore={() => {
          void actions.loadMoreEvents(podId);
        }}
        permissionSlot={<PermissionCardList cards={primaryCards} onRespond={respond} />}
        routingMode={routingMode}
        view={primaryView}
      />
    );

    split =
      pinnedLaneId === null ? null : (
        <TranscriptPane
          hasMore={session.backfill.hasMore}
          isSplit
          lane={laneOf(pinnedLaneId)}
          lanes={lanes}
          onJumpToLane={jumpToLane}
          onLoadMore={() => {
            void actions.loadMoreEvents(podId);
          }}
          permissionSlot={<PermissionCardList cards={splitCards} onRespond={respond} />}
          routingMode={routingMode}
          view={splitView}
        />
      );

    composerNode =
      composer === undefined ? null : (
        <Composer
          onChange={(text) => {
            actions.setComposerText(podId, text);
          }}
          onInterrupt={() => {
            void actions.interruptPod(podId);
          }}
          onSend={() => {
            void actions.sendComposer(podId);
          }}
          state={composer}
        />
      );
  }

  return (
    <WorkspaceLayout
      composer={composerNode}
      empty={empty}
      laneRail={laneRail}
      panel={panel}
      panelBar={panelBar}
      podBar={podBar}
      primary={primary}
      split={split}
    />
  );
}
