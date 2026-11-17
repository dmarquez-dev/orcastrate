# Driven hand-run: forced load failure (forced-load-failure-skip-delete)

Generated 2026-11-17T19:12:35.022Z. Exit code 2.

- Electron 43.4.0, Playwright 1.63.0
- devicePixelRatio 1.0000000149011612, viewport 1280x860
- display scale factor 1.25, page zoom factor 1
- driver sha256 `3c077fd6bd0e2ef97276e1971c00cc7972447906870a62f1a57c083908ac9455`
- out/main/index.js sha256 `c50eb91eb5ae7ecf9f578be295c442151f7cfa404f9784edbf27a29da2f0e2dd`
- sandbox C:\Users\dmarq\AppData\Local\Temp\claude\250d2aff6534ff91\ec0304f5-ec2b-4a55-b493-0ed81b4ca128\scratchpad\sir\20261117-1751-forced-load-failure\T1\sandbox-skip, removed after the run: true
- main env: USERPROFILE C:\Users\dmarq\AppData\Local\Temp\claude\250d2aff6534ff91\ec0304f5-ec2b-4a55-b493-0ed81b4ca128\scratchpad\sir\20261117-1751-forced-load-failure\T1\sandbox-skip\home, APPDATA C:\Users\dmarq\AppData\Local\Temp\claude\250d2aff6534ff91\ec0304f5-ec2b-4a55-b493-0ed81b4ca128\scratchpad\sir\20261117-1751-forced-load-failure\T1\sandbox-skip\home\AppData\Roaming, userData C:\Users\dmarq\AppData\Local\Temp\claude\250d2aff6534ff91\ec0304f5-ec2b-4a55-b493-0ed81b4ca128\scratchpad\sir\20261117-1751-forced-load-failure\T1\sandbox-skip\home\AppData\Roaming\Electron, CLAUDE_CONFIG_DIR null
- real settings.json sha256 before 5f4739070e52ed7fedf9a8cb1ced9c1979d9cff28d676a4c56628494ebf0e9f0, after 5f4739070e52ed7fedf9a8cb1ced9c1979d9cff28d676a4c56628494ebf0e9f0

## Setup

- companion: HC load companion `542ce6b8-a37c-48bf-8f46-9660df9404c6`
- live: HC load live `1caf7d98-6b66-4d40-b5ab-c16aa0eae3ff`
- target: HC load target `48b80bd2-8ec7-4102-ac37-8c5c9ac8d071`
- tab order: 0=HC load companion, 1=HC load live, 2=HC load target
- expected message: `no Pod with id 48b80bd2-8ec7-4102-ac37-8c5c9ac8d071` (src/main/pod-manager/pod-manager.ts:1657)
- delete result: `null`
- live activation: `{"selectedAfterClick":"1caf7d98-6b66-4d40-b5ab-c16aa0eae3ff","errorItemsBeforeTargetClick":0,"directLanesListOk":true}`; target activation: `{"selectedAfterClick":"48b80bd2-8ec7-4102-ac37-8c5c9ac8d071"}`

## O1 (precondition): pass

after the reload the selected Pod tab is "HC load companion" (first by tab order), so neither "HC load live" nor "HC load target" has been activated. Measured: `{"selectedTabId":"542ce6b8-a37c-48bf-8f46-9660df9404c6","selectedTitle":"companion","firstTabByOrder":"542ce6b8-a37c-48bf-8f46-9660df9404c6","liveSelected":false,"targetSelected":false}`

## Observations

| Obs | Row | Verdict | Fired | Undo verified | Measured | Control | Control predicted | Control observed | Reason |
|---|---|---|---|---|---|---|---|---|---|
| O2 | retry-button | instrument-invalid | false | null |  | the same tab-presence probe for a never-created id (a fresh UUID) | absent | null | --skip-delete: the target is not deleted, so O2 is not measured and its control is not run |
| O3 | retry-button | fail | true | true | matchingItems=0; waitedConditionMet=false; timeoutMs=15000; expectedMessage=no Pod with id 48b80bd2-8ec7-4102-ac37-8c5c9ac8d071; messages= | O4: the must-not-fire count, at the same moment, of notification items whose text contains HC load live's id (whole-run control: the --skip-delete run) | 0 | 0 item(s) contain HC load live's id | null |
| O4 | retry-button | instrument-invalid | false | true | itemsContainingLiveId=0; totalErrorItems=0 | the same id-containment count keyed on the target's id, at the same moment | 2 | 0 item(s) contain the target's id | control did not fire as predicted (2); observed: 0 item(s) contain the target's id |
| O5 | retry-button | instrument-invalid | false | null |  | the first item's Retry button detached from the DOM, the same probe run on that item, then reattached at its place and verified | 0 buttons | null | --skip-delete: no error item to measure, so no control was run |
| O6 | retry-button | instrument-invalid | false | null |  | inline border-style: none; background: transparent on that button | probe reports no border (style none or width 0) and an effective background equal to the item's | null | --skip-delete: no error item to measure, so no control was run |
| O7 | retry-button | instrument-invalid | false | null |  | inline flex-direction: column on the item | no horizontal adjacency | null | --skip-delete: no error item to measure, so no control was run |
| O8 | retry-button | instrument-invalid | false | null |  | the same focus probe, run before any Tab press | not focused | null | --skip-delete: no error item to measure, so no control was run |
| O9 | retry-button | instrument-invalid | false | null |  | added <style> giving that one button outline: none !important | outline-style none, and the control capture is byte-identical to the unfocused capture | null | --skip-delete: no error item to measure, so no control was run |
| O10 | retry-button | instrument-invalid | false | null |  | inline padding: 0 on the item | ring outside the padding box | null | --skip-delete: no error item to measure, so no control was run |
| O11 | retry-button | instrument-invalid | false | null |  | inline overflow: hidden; padding: 0 on the item | a clipping ancestor is reported (the item) | null | --skip-delete: no error item to measure, so no control was run |
| O12 | retry-themes | instrument-invalid | false | null |  | inline color on Retry set to the measured effective background (dark preference) | ratio 1.00 | null | --skip-delete: no error item to measure, so no control was run |
| O13 | retry-themes | instrument-invalid | false | null |  | inline color on Retry set to the measured effective background (light preference) | ratio 1.00 | null | --skip-delete: no error item to measure, so no control was run |
| O14 | retry-themes | instrument-invalid | false | null |  | added <style> with @media (prefers-color-scheme: light) setting that one button's color to rgb(1, 2, 3) !important | a difference under light (color) and none under dark | null | --skip-delete: no error item to measure, so no control was run |

## Screenshots

- `screenshots/forced-load-failure-skip-delete/01-after-reload.png`
- `screenshots/forced-load-failure-skip-delete/02-after-target-click.png`
