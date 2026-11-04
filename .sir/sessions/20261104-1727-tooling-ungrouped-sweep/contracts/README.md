# Contracts: none

This session has no cross-task contracts, and this file is the only thing in `contracts/`.

No two tasks in `manifest.json` share an interface:

- T1 changes `PodManager.closePod`'s body and its own test file. Its public signature
  (`closePod(podId: PodId): Promise<void>`) does not change, and no other task calls it.
- T2 owns both sides of the only interface it changes: `useDialogFocus`'s options
  (`src/renderer/src/shell/use-dialog-focus.ts`) and its one new caller
  (`src/renderer/src/pods/DeletePodDialog.tsx`). The other two callers,
  `NewPodDialog.tsx` and `BeachcomberPreviewDialog.tsx`, are owned by no task and do not
  change; the new option is optional and defaults to today's behaviour, which their
  existing suites pin.
- T3 adds one CSS rule and a test that reads it as text.
- T4 edits fixture data and its own test file.
- T5 writes a discipline fragment and the config entry that registers it.
- T6 writes nothing.

So the manifest's `contracts` array is empty.
