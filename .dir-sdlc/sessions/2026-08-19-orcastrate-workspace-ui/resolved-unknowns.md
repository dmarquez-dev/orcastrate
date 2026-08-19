# Resolved unknowns — 2026-08-19-orcastrate-workspace-ui

Resolved from repository evidence before decomposition. Rung noted per item.
Nothing here was asked of the user.

## U1 — Does the renderer have a styling convention to follow?

**No.** `src/renderer/` holds three files: `index.html`, `main.tsx`, `App.tsx`.
There is no `.css` file anywhere in the repo, no CSS-in-JS dependency, and no
Tailwind. `App.tsx` uses inline `style` objects and its own docblock says the
placeholder must not be grown.

**Resolution:** the session picks one. Default to plain CSS (or CSS Modules,
which `electron-vite` supports with no config) over adding a styling
dependency — the repo has added no runtime dependency it does not use, and the
choice is cheap to reverse. *Rung 1 — repository evidence.*

## U2 — How are renderer component tests meant to run?

`vitest.config.ts` already anticipates them: its docblock states the default
environment is `node` "because everything in sub-session 1 is Node-side" and
that "renderer component tests should opt into jsdom with a
`// @vitest-environment jsdom` docblock rather than slowing every suite." Its
`include` already covers `*.test.tsx`. `jsdom` 30 is installed.

**Resolution:** renderer tests are per-file jsdom opt-in, exactly as that
docblock instructs. `@testing-library/react` is **not** installed; adding it as
a devDependency is the natural completion of a convention the repo already
declared, not a new direction. *Rung 1 — repository evidence.*

## U3 — Is the permission contract wide enough to render a card in the asking lane?

**Yes.** Spec 5.4 calls widening `PermissionPrompt` "a required change, not an
optional one", but it was already made: `PermissionRequestedPush` in the frozen
`ipc.ts` carries `laneId` alongside `podId`, `requestId`, `toolName`, and
`input`. No contract change is needed for the permission cards.
*Rung 1 — frozen contract.*

## U4 — Does the renderer have a state-management library?

**No.** `package.json` dependencies are `@anthropic-ai/claude-agent-sdk` and
`better-sqlite3` only; React 19.2 is a devDependency of the build. No Redux,
Zustand, or Jotai.

**Resolution:** React's own primitives. The renderer's state is a Pod list, a
per-Pod lane list, an append-only event log per lane, and a pending-permission
set — all fed by push channels that already deliver snapshots
(`LaneChangedPush` is explicitly "a snapshot, not a delta"). *Rung 1.*

## U5 — Which module alias do renderer files use to reach the contracts?

`@shared/*` → `src/shared/*`, declared in both `tsconfig.web.json` `paths` and
`vitest.config.ts` `resolve.alias`. *Rung 1.*

## U6 — Does `PermissionMode` need widening, and how far does it reach?

`src/shared/contracts/events.ts:82` declares
`'default' | 'plan' | 'bypassPermissions'` — three values. The backlog's
"Decided for sub-session 2" requires four, adding `acceptEdits`.

**Not resolved by inference — this is a contract change**, and a contract change
is always an escalation. Raised at Gate 2 rather than discovered mid-task,
because it lands on the IPC validator, the permission guard, and the New Pod
dialog together. *Escalated.*
