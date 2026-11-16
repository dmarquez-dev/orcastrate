import { useMemo, useState, type JSX, type ReactNode } from 'react';

import type { LaneId } from '@shared/contracts/events';
import type { PanelKey } from './contracts/renderer-panels';
import type { PermissionRespondArgs } from './contracts/renderer-view';
import {
  useComposer,
  useLaneRail,
  usePermissionCards,
  useSlashCommands,
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
import { PanelCloseGuardProvider, usePanelCloseGuardHost } from './shell/panel-close-guard';
import { WorkspaceAlerts } from './shell/WorkspaceAlerts';
import { WorkspaceLayout } from './shell/WorkspaceLayout';
import { NotificationProvider, useNotify } from './notifications';

/** The key rows S8 and E7 share (`contracts/action-messages.md`). */
const INTERRUPT_KEY = 'pod-interrupt';

/**
 * The workspace, assembled.
 *
 * `App` is an ARRANGER: it reads the state layer's hooks, hands each region's
 * data to the component that owns that region, and renders nothing itself. The
 * regions come from four different tasks and `WorkspaceLayout` knows about
 * none of them — they arrive as slots (frozen `renderer-view.ts`).
 *
 * THE WHOLE TREE SITS INSIDE ONE `NotificationProvider`, which renders the
 * notification viewport once, after everything else
 * (`contracts/notifications.ts`). The arranging itself happens one level down,
 * in `Workspace`, because a component cannot read a context it provides:
 * `useNotify()` has to be called from below the provider, and the interrupt
 * outcome below is reported through it.
 */
export function App(): JSX.Element {
  return (
    <NotificationProvider>
      <Workspace />
    </NotificationProvider>
  );
}

/** `App`'s body: the arranger, rendered inside the notification region. */
function Workspace(): JSX.Element {
  const notifier = useNotify();
  const [newPodOpen, setNewPodOpen] = useState(false);

  // WHICH PANEL IS OPEN LIVES HERE AND NOWHERE ELSE. It is client interaction
  // state, not server data, so per the frontend discipline it does not go in
  // the workspace store — `panel-provider.tsx` says the same thing from the
  // other side, and its suite asserts the store has no such field. Nothing
  // outside this file needs to know: the strip is told, the region is told.
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  // EVERY MOVE OF `openPanel` GOES THROUGH THE CONTROLLER, and the setter above
  // is handed to it and called nowhere else in this file — see the invariant
  // note below the panel for why the shell asks rather than checks.
  const panelGuard = usePanelCloseGuardHost(openPanel, setOpenPanel);

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
  // The active Pod's latest command list (from its pushes, or from the store's
  // one startup pull when no push beat it), passed through untouched: the
  // renderer names no command of its own, so what the composer suggests is
  // only ever what the Pod reported, in the order it reported it.
  const slashCommands = useSlashCommands();

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

  // EVERY CLOSE AFFORDANCE AND THE SWITCH ROUTE THROUGH THE CONTROLLER: the
  // strip's close button, Escape, and a re-click of the open panel's own strip
  // button (which PanelBar turns into `onClose`) all reach `requestClose`.
  // The promise is discarded explicitly at each call site: `PanelBarProps`
  // keeps its synchronous `onOpen(key): void` / `onClose(): void` signatures,
  // and handing a promise-returning function to a void-returning prop is the
  // floating promise `no-misused-promises` exists to catch.
  const closePanel = (): void => {
    void panelGuard.controller.requestClose();
  };

  const openPanelRequest = (key: PanelKey): void => {
    void panelGuard.controller.requestOpen(key);
  };

  const panelBar = <PanelBar onClose={closePanel} onOpen={openPanelRequest} open={openPanel} />;

  // PANELS DO NOT REQUIRE A POD, so this is decided before `empty` is and
  // independently of it. Cleanup and settings are precisely what a user with
  // no Pods reaches for. Mounting the connected panel is also what issues its
  // first fetch — the hooks' own mount effects do that — so nothing here
  // fetches, and NEITHER PANEL'S HOOK IS MOUNTED WHILE ITS PANEL IS CLOSED.
  //
  // THE CLOSE GUARD PRESERVES THAT, and is why closing no longer discards a
  // Helm draft. Knowing whether a draft is dirty would mean mounting Helm's own
  // state hook here, and that hook's mount effect issues the scope fetch — the
  // shell would become a data fetcher and would fetch Helm's scopes with the
  // Helm panel shut. So the shell does not check: it ASKS, and this file names
  // no Helm hook at all. `panel-close-guard.tsx` fetches nothing and subscribes
  // to nothing; the mounted panel registers a guard, and THE PANEL OBJECTS —
  // the shell only asks, and never learns what "dirty" means. Beachcomber
  // registers nothing and closes exactly as it always did.
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

    // THE RAIL GETS TWO CALLBACKS, NOT FOUR (`contracts/lane-pin-removal.ts`
    // section 1, item 4). `onShowInFollower` and `onHideFollower` are deleted:
    // `onSelect` -> `showLane` IS the show-in-follower gesture, and closing is
    // the follower pane's own `onHide` below. `App.smoke.test.tsx` reads the
    // props rather than inferring them from what the rail happened to draw.
    laneRail = (
      <LaneRail
        onSelect={(laneId) => {
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
          commands={slashCommands}
          onChange={(text) => {
            actions.setComposerText(podId, text);
          }}
          onInterrupt={() => {
            // Rows S8 and E7 of `contracts/action-messages.md`. The standing
            // error is cleared as the next interrupt starts, and either outcome
            // lands on the same key, so a successful retry replaces a failure.
            notifier.dismiss(INTERRUPT_KEY);
            void actions.interruptPod(podId).then((result) => {
              if (result.ok) {
                notifier.notify({ kind: 'info', message: 'Interrupt sent', key: INTERRUPT_KEY });
              } else {
                notifier.notify({ kind: 'error', message: result.error.message, key: INTERRUPT_KEY });
              }
            });
          }}
          onSend={() => {
            void actions.sendComposer(podId);
          }}
          state={composer}
        />
      );
  }

  return (
    <PanelCloseGuardProvider host={panelGuard}>
      <WorkspaceAlerts />
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
    </PanelCloseGuardProvider>
  );
}
