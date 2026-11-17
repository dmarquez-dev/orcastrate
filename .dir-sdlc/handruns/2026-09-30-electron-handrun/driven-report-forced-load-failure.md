# Driven hand-run: forced load failure (forced-load-failure)

Generated 2026-11-17T19:11:42.221Z. Exit code 1.

- Electron 43.4.0, Playwright 1.63.0
- devicePixelRatio 1.0000000149011612, viewport 1280x860
- display scale factor 1.25, page zoom factor 1
- driver sha256 `3c077fd6bd0e2ef97276e1971c00cc7972447906870a62f1a57c083908ac9455`
- out/main/index.js sha256 `c50eb91eb5ae7ecf9f578be295c442151f7cfa404f9784edbf27a29da2f0e2dd`
- sandbox C:\Users\dmarq\AppData\Local\Temp\claude\250d2aff6534ff91\ec0304f5-ec2b-4a55-b493-0ed81b4ca128\scratchpad\sir\20261117-1751-forced-load-failure\T1\sandbox-normal, removed after the run: true
- main env: USERPROFILE C:\Users\dmarq\AppData\Local\Temp\claude\250d2aff6534ff91\ec0304f5-ec2b-4a55-b493-0ed81b4ca128\scratchpad\sir\20261117-1751-forced-load-failure\T1\sandbox-normal\home, APPDATA C:\Users\dmarq\AppData\Local\Temp\claude\250d2aff6534ff91\ec0304f5-ec2b-4a55-b493-0ed81b4ca128\scratchpad\sir\20261117-1751-forced-load-failure\T1\sandbox-normal\home\AppData\Roaming, userData C:\Users\dmarq\AppData\Local\Temp\claude\250d2aff6534ff91\ec0304f5-ec2b-4a55-b493-0ed81b4ca128\scratchpad\sir\20261117-1751-forced-load-failure\T1\sandbox-normal\home\AppData\Roaming\Electron, CLAUDE_CONFIG_DIR null
- real settings.json sha256 before 5f4739070e52ed7fedf9a8cb1ced9c1979d9cff28d676a4c56628494ebf0e9f0, after 5f4739070e52ed7fedf9a8cb1ced9c1979d9cff28d676a4c56628494ebf0e9f0

## Setup

- companion: HC load companion `201ce5f4-dbdd-4db2-848a-1c093cc2b421`
- live: HC load live `8a6f0163-ad7c-4780-9db6-67702d638214`
- target: HC load target `287ad1b9-3ede-4140-bbf0-ba3ae7a0a84b`
- tab order: 0=HC load companion, 1=HC load live, 2=HC load target
- expected message: `no Pod with id 287ad1b9-3ede-4140-bbf0-ba3ae7a0a84b` (src/main/pod-manager/pod-manager.ts:1657)
- delete result: `{"ok":true,"value":{"podId":"287ad1b9-3ede-4140-bbf0-ba3ae7a0a84b","podDeleted":true,"session":"not-requested","sessionError":null}}`
- live activation: `{"selectedAfterClick":"8a6f0163-ad7c-4780-9db6-67702d638214","errorItemsBeforeTargetClick":0,"directLanesListOk":true}`; target activation: `{"selectedAfterClick":"287ad1b9-3ede-4140-bbf0-ba3ae7a0a84b"}`

## O1 (precondition): pass

after the reload the selected Pod tab is "HC load companion" (first by tab order), so neither "HC load live" nor "HC load target" has been activated. Measured: `{"selectedTabId":"201ce5f4-dbdd-4db2-848a-1c093cc2b421","selectedTitle":"companion","firstTabByOrder":"201ce5f4-dbdd-4db2-848a-1c093cc2b421","liveSelected":false,"targetSelected":false}`

## Observations

| Obs | Row | Verdict | Fired | Undo verified | Measured | Control | Control predicted | Control observed | Reason |
|---|---|---|---|---|---|---|---|---|---|
| O2 | retry-button | pass | true | true | deleteOk=true; podDeleted=true; session=not-requested; targetTabStillRendered=true | the same tab-presence probe for a never-created id (a fresh UUID) | absent | fresh UUID 35826a44-53c7-492c-9675-3aafdb1353f1: tab absent | null |
| O3 | retry-button | pass | true | true | matchingItems=2; waitedConditionMet=true; timeoutMs=15000; expectedMessage=no Pod with id 287ad1b9-3ede-4140-bbf0-ba3ae7a0a84b; messages=error: no Pod with id 287ad1b9-3ede-4140-bbf0-ba3ae7a0a84b / error: no Pod with id 287ad1b9-3ede-4140-bbf0-ba3ae7a0a84b | O4: the must-not-fire count, at the same moment, of notification items whose text contains HC load live's id (whole-run control: the --skip-delete run) | 0 | 0 item(s) contain HC load live's id | null |
| O4 | retry-button | pass | true | true | itemsContainingLiveId=0; totalErrorItems=2 | the same id-containment count keyed on the target's id, at the same moment | 2 | 2 item(s) contain the target's id | null |
| O5 | retry-button | pass | true | true | items=2; perItem=item 1: 1 Retry, after <p> true, before dismiss true; item 2: 1 Retry, after <p> true, before dismiss true | the first item's Retry button detached from the DOM, the same probe run on that item, then reattached at its place and verified | 0 buttons | 0 buttons with Retry detached; reattached: 1 Retry, same node true | null |
| O6 | retry-button | pass | true | true | borderTopStyle=solid; borderTopWidth=0.8; cursor=pointer; background=rgb(26, 29, 35); itemBackground=rgb(58, 31, 34); effectiveBackground=rgb(26.00, 29.00, 35.00); itemEffectiveBackground=rgb(58.00, 31.00, 34.00); effectiveEqual=false; inline=null | inline border-style: none; background: transparent on that button | probe reports no border (style none or width 0) and an effective background equal to the item's | border-top-style none, width 0; effective background rgb(58.00, 31.00, 34.00) vs item rgb(58.00, 31.00, 34.00) (equal: true) | null |
| O7 | retry-button | pass | true | true | retryLeft=1181.0125732421875; messageRight=1173.0125122070312; tol=0.999999985098839; retryTop=771.6000366210938; retryBottom=790.6000366210938; messageTop=771.6000366210938; messageBottom=789.000036239624 | inline flex-direction: column on the item | no horizontal adjacency | retry left 856.8500366210938 vs message right 1157.9750366210938, retry top 746.2000122070312 vs message bottom 738.199987411499: adjacent false | null |
| O8 | retry-button | pass | true | true | startingPoint=first matching item's message <p> at (875.9, 780.3); active after the click: [data-testid="notification-viewport"]; tabPresses=1; tabBound=22; active=button._action_tao93_121; isRetry=true; focusVisible=true | the same focus probe, run before any Tab press | not focused | before any press: active [data-testid="notification-viewport"], Retry focused false, :focus-visible false | null |
| O9 | retry-button | fail | true | true | outlineStyle=solid; outlineWidth=1.6; outlineOffset=1.6; borderThickToken=2; focusedCaptureDiffersFromUnfocused=true; context=--oc-border-hairline 1px, Retry computed border-top-width 0.8px; ringClip=1175.01,765.60 57.98x31.00 | added <style> giving that one button outline: none !important | outline-style none, and the control capture is byte-identical to the unfocused capture | outline-style none; control capture byte-identical to unfocused capture: true | null |
| O10 | retry-button | pass | true | true | ringOuter=l 1177.81 r 1230.19 t 768.40 b 793.80; itemPaddingBox=l 844.85 r 1263.20 t 763.60 b 798.60; ringInside=true | inline padding: 0 on the item | ring outside the padding box | ring l 1189.81 r 1242.19 t 776.40 b 801.80 vs padding box l 844.85 r 1263.20 t 779.60 b 798.60: inside false | null |
| O11 | retry-button | pass | true | true | ancestorsChecked=body (hidden/hidden) contains true; clippingAncestors=0 | inline overflow: hidden; padding: 0 on the item | a clipping ancestor is reported (the item) | clipping ancestors: [data-testid="notification"] | null |
| O12 | retry-themes | pass | true | true | colorScheme=dark; foreground=rgb(232, 234, 238); foregroundAlpha=1; effectiveBackground=rgb(26.00, 29.00, 35.00); contrastRatio=14.016; threshold=4.5 | inline color on Retry set to the measured effective background (dark preference) | ratio 1.00 | ratio 1.00 | null |
| O13 | retry-themes | pass | true | true | colorScheme=light; foreground=rgb(232, 234, 238); foregroundAlpha=1; effectiveBackground=rgb(26.00, 29.00, 35.00); contrastRatio=14.016; threshold=4.5 | inline color on Retry set to the measured effective background (light preference) | ratio 1.00 | ratio 1.00 | null |
| O14 | retry-themes | pass | true | true | dark=color rgb(232, 234, 238); background rgb(26, 29, 35); border-top rgb(69, 77, 91); item rgb(58, 31, 34); light=color rgb(232, 234, 238); background rgb(26, 29, 35); border-top rgb(69, 77, 91); item rgb(58, 31, 34); differing=none; emulationApplied=dark prefersLight=false, light prefersLight=true; emulateMediaResetToNull=true; prefersLightAfterReset=false | added <style> with @media (prefers-color-scheme: light) setting that one button's color to rgb(1, 2, 3) !important | a difference under light (color) and none under dark | under dark, differing from dark: none; under light, differing from dark: color (color rgb(1, 2, 3)) | null |

## Screenshots

- `screenshots/forced-load-failure/01-after-reload.png`
- `screenshots/forced-load-failure/02-after-target-click.png`
- `screenshots/forced-load-failure/O9-ring-clip-unfocused.png`
- `screenshots/forced-load-failure/viewport-dark-unfocused.png`
- `screenshots/forced-load-failure/viewport-light-unfocused.png`
- `screenshots/forced-load-failure/O9-ring-clip-focused.png`
- `screenshots/forced-load-failure/O9-ring-clip-control-outline-none.png`
- `screenshots/forced-load-failure/viewport-dark-retry-focused.png`
- `screenshots/forced-load-failure/viewport-light-retry-focused.png`
