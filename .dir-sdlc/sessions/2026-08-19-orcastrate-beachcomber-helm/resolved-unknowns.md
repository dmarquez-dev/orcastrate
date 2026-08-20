# Resolved unknowns — sub-session 3 (Beachcomber + Helm)

Every row settled at rung 1 (repo/machine evidence) or rung 2 (project docs)
unless stated. Nothing here cost a web search.

## Beachcomber

**The design's decoding rule is unsound, and the machine proves it.**
`~/.claude/projects/<dir>` names are produced by replacing every non-alphanumeric
run in the cwd with `-`, which is lossy: `:`, `\`, `/`, `.` and a literal `-` all
collapse to the same character. On this machine
`C--Users-dmarq-Development-Repos-dir-ect` is ambiguous between
`C:\Users\dmarq\Development\Repos\dir-ect` and `...\Repos\dir\ect`, and
`C--Users-dmarq-Development-Repos-dir-ect--claude-worktrees-dir-plugin` shows a
`\.` collapsing to `--` as well. Design section 6 says a row "is decoded back to
the original working directory path"; decoding alone cannot do that, and orphan
detection built on it produces false orphans for any path containing a hyphen.

**The authoritative source is inside the directory, not in its name.** Every
session `.jsonl` records the true cwd verbatim:
`"cwd":"C:\\Users\\dmarq\\Development\\Repos\\dir-ect"` in
`~/.claude/projects/C--Users-dmarq-Development-Repos-dir-ect/0bde2d77-…jsonl`.
Read the path from the first record that carries `cwd`; fall back to the decoded
name only when a directory holds no such record, and mark that row's path as
unverified rather than presenting a guess as fact.

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Which directories does Beachcomber cover? | `projects/`, `shell-snapshots/`, `file-history/`, `paste-cache/` — all four exist on this machine (9, 12, and 11 entries respectively; `projects/` holds 20) | 1 | `ls ~/.claude/`; design §6 |
| Is directory-name decoding reversible? | **No.** Lossy and ambiguous — see above | 1 | `~/.claude/projects/` listing |
| Where does the true path come from? | The `cwd` field in the directory's session `.jsonl` records | 1 | `~/.claude/projects/C--Users-dmarq-Development-Repos-dir-ect/*.jsonl` |
| How is deletion performed? | Electron `shell.trashItem`, main process only; never a recursive unlink | 2 | design §6 |
| Is Electron's `shell` already imported in main? | Yes | 1 | `src/main/window.ts:2` |

## Helm

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Is `crossSessionInbound` a real settings key? | Yes, in CLI 2.1.235, alongside a `peer_inbound_gate` with `accept` / `refused` / `expired` outcomes and a `crossSessionInbound=refuse` opt-out path | 1 | strings in `~/.local/share/claude/versions/2.1.235` |
| Is the exact accepted value set confirmed? | No. `accept` and `refuse` are observed; `hold` is implied by a "not parking a late peer message" log line but not confirmed as a settings value. Helm must validate before writing | 1 | same binary; design §7 names all three |
| Does a settings file always exist? | No. This repo has no `.claude/` at all, and the user-scope `~/.claude/settings.json` has **no `permissions` key**. Absent file and absent key are the normal cases, not error cases | 1 | `ls -a` in repo root; key listing of `~/.claude/settings.json` |
| Is Helm the only writer of project `settings.json`? | **No.** `allow_always` returns `updatedPermissions` with `destination: 'projectSettings'`, so the CLI writes that file from inside the running app whenever a user clicks "Allow always" | 1 | `src/main/pod/options.ts:170-185`; `src/main/pod/permissions.ts:93-98` |
| What write safety is required? | Atomic temp-file + rename, timestamped backup before each write, re-read-and-compare against load, verbatim OS errors | 2 | design §7 (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:354-361`) |
| Are hooks edited as a form? | No — validated raw-JSON pane | 2 | design §7 |

## Shared / platform

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Are the reserved IPC namespaces still unpopulated? | Yes — `beachcomber?: never; helm?: never`, with an explicit note that populating them is a contract change requiring escalation | 1 | `src/shared/contracts/ipc.ts:16-18,244-249` |
| Does the no-paths rule block Beachcomber? | Not as worded — it forbids a path *the renderer can act on*. Paths as opaque display strings are already the pattern; `dialog.pickDirectory` returns one and the renderer only hands it back | 1 | `src/shared/contracts/ipc.ts:12-14,140-142` |
| Is there a layout slot for a panel? | **No.** `WorkspaceLayoutProps` is `podBar`, `laneRail`, `primary`, `split`, `composer`, `empty`. Beachcomber and Helm have nowhere to render without changing that contract | 1 | `src/renderer/src/contracts/renderer-view.ts:46-58`; `src/renderer/src/shell/WorkspaceLayout.tsx` |
| Can the renderer reach the bridge outside `state/`? | No — enforced by a source-tree scan that strips comments first, so type-position and prose mentions elsewhere are correctly ignored | 1 | `src/renderer/src/state/isolation.test.ts` |
| How is main-process filesystem work tested? | `mkdtempSync(join(tmpdir(), …))` with tracked cleanup; nothing touches developer paths | 1 | `tests/unit/store/helpers.ts:9-35` |
| Where do main-process tests live? | `tests/unit/<area>/`; renderer tests live under `src/renderer/src/` because `tsconfig.node.json` includes `tests/` | 1 | `tests/unit/` layout; prior spec assumptions table |
| Electron version | 43.4.0 (devDependency); runtime `dependencies` are only the SDK and `better-sqlite3` | 1 | `package.json` |
| Baseline state | 55 test files / 881 tests pass, `typecheck` clean, tree clean — verified in this session after `npm ci`, which was required because `node_modules` was absent | 1 | `npm test`, `npm run typecheck` run 2026-08-19 |

## Carried in from the backlog

- `TOKENS` has no border-width, tracking, or font-weight token; six renderer
  directories reached for raw `1px` / `0.04em` / `font-weight: 700`. Flagged as
  "sub-session 3 will hit this the moment it styles Beachcomber or Helm."
  Changing `renderer-theme.ts` is a contract change.
- `MIGRATION_1` still interpolates four live enums into shipped DDL
  (`src/main/store/schema.ts:141-201`). Only relevant here if this session adds a
  migration; it should not need one.
- Nine of fifteen invoke channels have no surface that renders their error, held
  by an executable allowlist in
  `src/renderer/src/__tests__/failure-paths.e2e.test.tsx`. New channels added by
  this session either get an error surface or get added to that allowlist —
  silently growing it is the failure mode the test exists to prevent.
