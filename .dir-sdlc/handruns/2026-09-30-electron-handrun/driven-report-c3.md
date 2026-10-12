# Driven hand-run — results

Generated 2026-10-12T19:04:31.740Z
Build `out/main/index.js` · Electron via playwright _electron · Playwright local devDependency

**32/32 checks passed.** 0 step(s) errored.

| Step | Title | Checks | Verdict |
|---|---|---|---|
| C3-1 | Both new tokens resolve on :root in the real window | 4 | PASS |
| C3-2 | Live-DOM weight census — converted selectors at 600, ramp respected | 3 | PASS |
| C3-3 | NewPodDialog — scrim veils, heading and bypass warning at 600 | 6 | PASS |
| C3-4 | DeletePodDialog — scrim veils, heading and subject at 600 | 5 | PASS |
| C3-5 | PanelBar: aria-current carries open state AND still paints it | 5 | PASS |
| C3-6 | Helm close-confirmation scrim veils the window | 4 | PASS |
| C3-7 | Beachcomber preview scrim veils the window | 3 | PASS |
| C3-8 | Positive control: the compositing probe can detect an opaque scrim | 2 | PASS |

## C3-1 — Both new tokens resolve on :root in the real window

- note: --oc-bg-app = #14161a

## C3-2 — Live-DOM weight census — converted selectors at 600, ramp respected

- note: distinct computed font-weights in the live DOM: 400, 500, 600

  - `screenshots/c3/01-empty-workspace.png`

## C3-3 — NewPodDialog — scrim veils, heading and bypass warning at 600

- note: bypass warning not rendered in default permission mode; not asserted

  - `screenshots/c3/02-newpod-dialog-veiled.png`
  - `screenshots/c3/02b-control-forced-opaque.png`

## C3-4 — DeletePodDialog — scrim veils, heading and subject at 600

- note: createPod -> {"ok":true,"value":{"id":"49220bf0-0f75-4c7f-8f81-80e2afe90ed0","title":"oc-c3-pod","cwd":"C:\\oc-sandbox\\repos\\plain-

  - `screenshots/c3/03-deletepod-dialog-veiled.png`

## C3-5 — PanelBar: aria-current carries open state AND still paints it

- note: panel buttons: [{"key":"beachcomber","current":"false","pressed":null,"bg":"rgba(0, 0, 0, 0)","borderColor":"rgba(0, 0, 0, 0)"},{"key":"helm","current":"true","pressed":null,"bg":"rgb(51, 58, 71)","borderColor":"rgb(69, 77, 91)"}]
- note: That paint check is the one jsdom cannot make: the attribute rename also had to move the stylesheet selector, and had it not, every renderer test would still pass while the open panel lost its highlight.

  - `screenshots/c3/04-panelbar-aria-current.png`
