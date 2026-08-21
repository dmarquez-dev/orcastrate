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

  // THE PANE MODEL FEEDS THE SLOTS (`contracts/renderer-panes.ts` section 1).
  // `WorkspaceLayoutProps` is unchanged — `primary` and `split` are the same
  // two slots they always were. What changed is which lane feeds each: the
  // primary is the Matriarch's, always, and `split` takes the first follower.
  const primaryLaneId = session?.primaryLaneId ?? null;
  const followerLaneId = session?.followerLaneIds[0] ?? null;

  // Hooks are unconditional; whether their output is RENDERED is decided below.
  const primaryView = useTranscript(primaryLaneId);
  const splitView = useTranscript(followerLaneId);
  const primaryCards = usePermissionCards(primaryLaneId);
  const splitCards = usePermissionCards(followerLaneId);
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

    // BOTH FOLLOWER CALLBACKS ARE PASSED ON EVERY RENDER. They are optional in
    // the frozen contract only so T1 and T2 can land concurrently; an absent
    // one here is a defect, not a valid state, and `App.smoke.test.tsx` reads
    // the props rather than inferring them from what the rail happened to draw.
    laneRail = (
      <LaneRail
        onHideFollower={(laneId) => {
          actions.hideLane(podId, laneId);
        }}
        onSelect={(laneId) => {
          actions.showLane(podId, laneId);
        }}
        onShowInFollower={(laneId) => {
          actions.showLane(podId, laneId);
        }}
        onSteer={(laneId) => {
          actions.steerFromLane(podId, laneId);
        }}
        routingMode={routingMode}
        rows={rail.value}
      />
    );

    primary = (
      <TranscriptPane
        hasMore={session.backfill.hasMore}
        isSplit={false}
        lane={laneOf(primaryLaneId)}
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

    // The follower pane carries its OWN dismiss control (`onHide`), because the
    // pane is where a user looks to dismiss what is in front of them. The
    // primary never gets one: the Matriarch cannot be closed.
    split =
      followerLaneId === null ? null : (
        <TranscriptPane
          hasMore={session.backfill.hasMore}
          isSplit
          lane={laneOf(followerLaneId)}
          lanes={lanes}
          onHide={() => {
            actions.hideLane(podId, followerLaneId);
          }}
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
