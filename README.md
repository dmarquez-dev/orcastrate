# Orcastrate

A native desktop dashboard for Claude Code: named, persistent conversations
(**Pods**) as tabs, each exposing the sub-agents it dispatched (**Calves**) as
individually inspectable lanes, plus GUI administration of Claude Code's
settings and on-disk state.

Design spec: [`docs/superpowers/specs/2026-08-18-orcastrate-design.md`](docs/superpowers/specs/2026-08-18-orcastrate-design.md).
Windows is the validated target for MVP; macOS and Linux are expected to work.

## Requirements

- Node.js >= 22.12 (electron 43's floor)
- A working `claude` CLI on `PATH` — Orcastrate drives your real installation
  through `@anthropic-ai/claude-agent-sdk` rather than reimplementing it

No native toolchain is required. `better-sqlite3` v13 ships Node-API prebuilds,
so the same binary loads under Node and under Electron with no rebuild step.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Installs everything. No postinstall rebuild. |
| `npm run dev` | Electron with HMR for the renderer. |
| `npm run build` | Typechecks, then bundles main, preload, and renderer into `out/`. |
| `npm run typecheck` | `tsc --noEmit` over both projects. |
| `npm test` | Vitest, one run. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run build:unpack` | Build plus an unpacked electron-builder app in `release/`. |

## Layout

```
src/
  main/       Electron main process. Bootstrap and window creation only.
  preload/    The context-bridge. The renderer's ONLY capability surface.
  renderer/   React view layer. No filesystem, no child processes, no IPC
              beyond `window.orcastrate`.
  shared/
    contracts/  Frozen interface definitions — see below.
tests/        Cross-cutting suites and fixtures. Co-located `*.test.ts` also runs.
```

## Contracts

`src/shared/contracts/` holds the interfaces frozen before parallel
implementation began. They are the single definition of these types in the
repository — do not redeclare them elsewhere, and do not edit them to make code
compile.

| File | Boundary |
| --- | --- |
| `events.ts` | The normalized event, `Pod`, and `Lane` shapes. |
| `event-store.ts` | SQLite persistence, synchronous. |
| `lane-router.ts` | SDK messages in, normalized events out. Pure, no I/O. |
| `pod-runner.ts` | One long-lived Agent SDK `query()` session per open Pod. |
| `ipc.ts` | The complete preload surface: `INVOKE_CHANNELS`, `EVENT_CHANNELS`, `OrcastrateApi`. |
| `fixture-corpus.md` | Protocol fixture layout and `findings.json` schema. |

Three corrections that the contracts encode and the design spec predates: the
SDK permission enum has no `acceptEdits`; the resume option is `resume`; and the
SDK's `env` **replaces** the subprocess environment rather than merging, so a
runner must pass `{ ...process.env, ...envOverrides }` or the CLI launches
without `PATH`.

## Security posture

The window is created with `contextIsolation: true`, `nodeIntegration: false`,
and `sandbox: true` (design spec section 3). Everything the renderer can do is
enumerated in `contracts/ipc.ts` and bridged in `src/preload`. `ipcRenderer`
itself is never exposed, no method hands the renderer a filesystem path it can
act on, and every invoke channel resolves an `IpcResult` envelope instead of
rejecting — an Electron IPC rejection would lose the error code across the
bridge.

Because the preload runs sandboxed it cannot `require()` relative files at
runtime; electron-vite bundles it into a single CommonJS file that requires only
`electron`. Keep it that way.

## Dependency policy

Versions are pinned exactly and `.npmrc` sets `save-exact=true`. Anything the
main process loads at runtime — currently `better-sqlite3` and
`@anthropic-ai/claude-agent-sdk` — belongs in `dependencies` so electron-vite
externalizes it and electron-builder ships it. Build-time and renderer-bundled
packages (React included) belong in `devDependencies`.
