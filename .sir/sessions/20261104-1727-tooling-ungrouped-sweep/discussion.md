# Tooling and Ungrouped sweep

Close every remaining Tooling and Ungrouped item in `.sir/backlog.md` except the live-`claude`
hand-run harness: four concrete fixes, two behavior changes the user decided at Gate 1, and one
item closed as declined.

## Context

Earlier sessions emptied Correctness, Tests and guards, Prose drift, and Cosmetic and
structural. What remains is Design decisions (8, untouched here), Tooling (4) and Ungrouped
(4). Base is `main` at `c5692ee`. Every citation below was re-measured against that tree at
discuss time (2026-11-04):

- `npx prettier --check` on `src/renderer/src/contracts/renderer-panels.ts`,
  `src/renderer/src/state/panel-store.ts` and `src/renderer/src/helm/HelmPanel.tsx` warns on
  all three.
- `src/renderer/src/test-utils/stub-api.ts:256-288` holds three non-`projects` Beachcomber
  rows carrying `pathSource: 'session-record'` (grep over those lines: 3 matches).
- `src/renderer/src/pods/PodsChrome.tsx:206` sets `tabIndex={-1}` on the `.chrome` container,
  the focus fallback after a Pod delete or create, which has no visible focus style.
- `tsconfig.web.json:24` sets `noUncheckedIndexedAccess: true`. `.sir/disciplines/` does not
  exist; `.sir/config.json` has only a `git` key.
- `src/main/pod-manager/pod-manager.ts:511-518`: `closePod`'s guard is
  `pod !== null && pod.status !== 'beached'`, so an already-`closed` Pod re-runs the lane
  sweep, `updatePod` and the `podStatus 'closed'` push.
  `tests/unit/pod-manager/close-pod-lane-sweep.test.ts`'s whole-record count pins the re-push.
- `src/renderer/src/pods/DeletePodDialog.tsx:96`:
  `useDialogFocus(fallbackFocusRef, { open: podId !== null })` moves focus only on open,
  where base did so on every `podId` change.

## Decisions

1. Session name `tooling-ungrouped-sweep`, track Standard (Gate 1, user approved).
2. Prettier: run a formatting-only change on the three flagged files. No semantic edits.
   Afterwards `npx prettier --check` must pass on all three.
3. Stub API: give the three non-`projects` Beachcomber rows `pathSource: 'absolute-path'`.
4. PodsChrome: give the `tabIndex={-1}` focus-fallback container a visible focus style,
   matching the project's existing focus-ring tokens and idiom. Do not invent a new color.
5. Discipline: add a project fragment at `.sir/disciplines/frontend.md` requiring an explicit
   guard when indexing or destructuring under `noUncheckedIndexedAccess`, so an absent node is
   a named failure rather than a silent `undefined`. Use the fragment format `sir-disciplines`
   defines. Do not create or edit `.sir/config.json` unless that format requires registering
   the fragment.
6. closePod (user decided: stop the re-push): `closePod` on an already-`closed` Pod makes no
   `podStatus 'closed'` push. Update the whole-record count in
   `close-pod-lane-sweep.test.ts` to match. The `beached` exclusion and the
   sweep-before-push ordering stay as they are. Whether the lane sweep and `updatePod` should
   also be skipped for an already-closed Pod is for the spec to settle from the code.
7. DeletePodDialog (user decided: restore re-focus): the dialog re-focuses whenever `podId`
   changes to a different non-null id without passing through null, as base did. Open, trap
   and return-on-close behavior stay as they are.
8. commit-msg hook (user decided: decline): close the Tooling item as "won't do". No hook is
   added. Trailers stay as the committing agent writes them.
9. Out of scope: the live-`claude` hand-run harness (Tooling, its own session) and all eight
   Design-decision items.
10. Closing the backlog: at Gate 3, remove the seven items this session closes (Tooling lines
    for the noUncheckedIndexedAccess discipline, prettier, and commit-msg hook; all four
    Ungrouped lines).
