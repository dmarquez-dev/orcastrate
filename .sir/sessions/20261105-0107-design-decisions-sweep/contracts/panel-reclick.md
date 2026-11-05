<!-- frozen: 20261105-0107-design-decisions-sweep, Gate 2 -->

# Contract: the PanelBar re-click route (item 1)

Markdown, because this session changes no declaration in `renderer-panels.ts` for item 1:
it changes which existing operation one affordance calls, plus the prose that records the
routing. Every type named here already exists in the source tree at
`src/renderer/src/contracts/renderer-panels.ts` (base `cc5077c`). Consumers import it from
there, and no task re-declares any of it.

Owner of the frozen-contract edit: **T4** (`src/renderer/src/contracts/renderer-panels.ts`).
Owner of the behaviour: **T1** (`src/renderer/src/shell/PanelBar.tsx`).

## Declarations: unchanged

- `PanelBarProps`: `open: PanelKey | null`, `onOpen(key: PanelKey): void`, `onClose(): void`.
  Signatures stay synchronous and void. Nothing is widened to a promise.
- `PanelCloseController.requestClose(): Promise<void>`: destination `null`. Asks the
  registered close guard, if one is registered.
- `PanelCloseController.requestOpen(next: PanelKey): Promise<void>`: when `next` is already
  open, this is a no-op and the guard is not asked. **Semantics unchanged.** After this
  session no shell affordance issues that call. The no-op stays as a defence, and the
  harness test `panel-close-guard.test.tsx:356` (base) pins it.
- `PanelTransitionRules` (guard declined, no guard, re-entrancy, fail-open on throw):
  unchanged, and they apply to the re-click exactly as they apply to the close button.

## Routing (the behaviour change)

A click or keyboard activation (Enter or Space) on a `PanelBar` per-panel button for key `k`
works like this:

| `open` at the moment of the click | PanelBar calls | Shell (`App.tsx`, unchanged) calls |
|---|---|---|
| `null` | `onOpen(k)` | `requestOpen(k)` |
| a key other than `k` | `onOpen(k)` | `requestOpen(k)` (a switch, guarded) |
| `k` (re-click) | `onClose()` | `requestClose()` (a close, guarded) |

PanelBar calls exactly one callback per activation, and calls it exactly once.

Errors and edge cases:

- **The guard declines** (a dirty Helm draft, answered Keep editing). `openPanel` is
  unchanged, the panel stays mounted, and the draft survives. This matches the close
  button's behaviour.
- **The guard throws.** It fails open, per `PanelCloseGuard.beforeClose`. Unchanged.
- **A transition is already pending** (the dialog is up and the user re-clicks). The
  request is dropped per the RE-ENTRANCY rules, and the guard is not asked a second time.
- **No guard is registered** (Beachcomber). The close is synchronous: no awaited turn comes
  before `openPanel` moves.
- **Focus after a re-click close.** `open` becomes `null`, and PanelBar's existing effect
  (base `PanelBar.tsx:61-66`) returns focus to the re-clicked button.

ARIA: the open state stays on `aria-current` (`true` on the open panel's button, `false` on the
others). The button does not get `aria-pressed`.

## Prose T4 updates in `renderer-panels.ts`

- The `requestOpen` docblock (base `:210-214`) no longer justifies the no-op by the re-click,
  because PanelBar no longer routes a re-click there.
- The RE-ENTRANCY count of affordances (base `:236-237`, "three affordances") includes the
  re-click.
- The ROUTING paragraph (base `:257-261`) names the re-click → `requestClose()` route.
