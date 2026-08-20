# Orcastrate Beachcomber and Helm (sub-session 3)

Ship the last two MVP items — the on-disk cleanup panel and the settings editor —
by populating the two IPC namespaces sub-session 1 reserved for them.

## Context

Sub-session 1 shipped the main process and froze the preload surface. Sub-session
2 shipped the workspace UI against it. What remains of MVP scope is items 6 and 7
of design section 10: **Beachcomber** (design §6) and **Helm** (design §7).

`src/shared/contracts/ipc.ts:244-249` still carries `beachcomber?: never` and
`helm?: never`, above a docblock stating that populating them is a contract
change requiring an escalation. This session is the one that populates them.

Three things this session verified rather than inherited, each of which changed
the design:

- **The design's Beachcomber decoding rule is unsound.** `~/.claude/projects/`
  directory names collapse `:`, `\`, `/`, `.` and literal `-` into one character,
  so decoding back to a path is ambiguous — on this machine
  `C--Users-dmarq-Development-Repos-dir-ect` reads equally as `…\Repos\dir-ect`
  or `…\Repos\dir\ect`. Orphan detection built on decoding produces false
  orphans, and a false orphan invites the deletion of live state. The true `cwd`
  is recorded verbatim in every session `.jsonl`, so that is what this session
  reads.
- **Helm is not the only writer of the file it edits.** `allow_always` returns
  `updatedPermissions` with `destination: 'projectSettings'`, so the CLI writes
  project `settings.json` from inside the running app, one click away in the same
  window (`src/main/pod/options.ts:170-185`).
- **There is no layout slot for a panel.** `WorkspaceLayoutProps` is `podBar`,
  `laneRail`, `primary`, `split`, `composer`, `empty`. Both panels have nowhere
  to render without amending a contract sub-session 2 froze.

## Definition of done

**The contract surface**

1. `ipc.ts` carries `beachcomber: BeachcomberApi` and `helm: HelmApi` as
   non-optional members. Neither `?: never` remains, and the RESERVED docblock is
   rewritten to record that this session populated them.
2. `INVOKE_CHANNELS` holds exactly 21 entries — the fifteen that shipped plus
   `beachcomber:scan`, `beachcomber:preview`, `beachcomber:trash`, `helm:scopes`,
   `helm:load`, `helm:save`. `EVENT_CHANNELS` holds exactly six, the new one
   being `push:helmChanged`. Counts and value-uniqueness are asserted.
3. The no-paths hard rule is restated in `ipc.ts` naming Beachcomber explicitly,
   and holds in the code: `displayPath` crosses as an opaque display string, and
   every mutating call names a main-minted `BeachcomberEntryId` or `HelmScopeId`
   the renderer cannot forge. A stale id answers `NOT_FOUND`, never a rematch by
   path.
4. `dependencies` in `package.json` is unchanged: `@anthropic-ai/claude-agent-sdk`
   and `better-sqlite3`.

**Beachcomber**

5. All four roots — `projects`, `shell-snapshots`, `file-history`,
   `paste-cache` — are enumerated with a display path, entry count and total
   bytes. A root that does not exist reports `present: false` rather than
   throwing.
6. A `projects/` entry's path comes from the first `cwd`-bearing record in its
   session `.jsonl`, reported as `pathSource: 'session-record'`. A directory with
   no such record falls back to the decoded name, reported as
   `pathSource: 'decoded-name'` and labelled in the UI with
   `UNVERIFIED_PATH_NOTICE` verbatim.
7. **`orphan` is true only when the path came from a session record.** A guessed
   path is never reported as an orphan, even when it does not exist on disk.
8. An entry whose resolved path matches any known Pod's `cwd` is hard-blocked:
   `aria-disabled`, an inert checkbox, and a refusal naming the Pod that blocked
   it. Path comparison is normalized for case, trailing separator, and separator
   direction. This blocks a superset of design §6's rule — see Assumptions.
9. Preview shows exactly what will be removed before any action: item totals
   equal the sum of the listed items, refusals are listed separately, and sample
   names are bare file names.
10. Deletion goes to the recycle bin through an injected `shell.trashItem` and
    nothing else. A source scan asserts `src/main/beachcomber/**` contains no
    `rm`, `unlink`, `rmdir`, or `force: true` in any form.
11. Partial failure is a value, not an exception: with one path failing, the rest
    are reported trashed, the failure carries the platform message verbatim, and
    a fresh scan comes back with it.

**Helm**

12. Scopes are named, never paths: the user scope plus `project:<podId>` and
    `projectLocal:<podId>` per Pod. The renderer names a scope; it can never name
    a file, so a traversal string is a table miss rather than a path.
13. An absent settings file is a normal state — `exists: false`, no throw. Both
    the user scope with no `permissions` key and a project with no `.claude/`
    directory are normal.
14. A load-then-save round trip with an untouched draft preserves every key Helm
    does not manage, including nested objects and arrays.
15. Writes are atomic: the temp file is created in the target's own directory and
    renamed over it.
16. A timestamped backup is taken before every write, its bytes equal the
    pre-write content, and the result names it. **A failed backup aborts the
    write.**
17. The file is re-read and compared before writing. A change since load fails
    with `CONFLICT` naming the file and stating nothing was written; the panel
    re-loads and shows current contents beside the pending edit. There is no
    "save anyway" that skips the comparison. This is proven **with the watcher
    disabled**, so a working watcher can never be what makes a safety test pass.
18. The in-app writer is covered explicitly: a test named for `allow_always`
    reproduces a `permissions.allow` rule landing in the file under a loaded
    draft.
19. A best-effort watcher emits `helmChanged` so a stale form says so
    immediately. It is advisory; item 17 is the guarantee.
20. Filesystem errors surface the OS message verbatim, unmodified.
21. Hooks are a validated raw-JSON pane, never restructured: a `hooks` object
    round-trips deep-equal and Helm adds no key to it.
22. Helm never overwrites a file it could not parse — an unparseable file loads
    with a `parseError` and refuses to save.
23. `crossSessionInbound` offers all three values, with `hold` carrying
    `CROSS_SESSION_HOLD_CAVEAT` verbatim: only `accept` and `refuse` were
    observed in CLI 2.1.235.

**Shell, hygiene, and coverage**

24. Both panels open from a strip beneath the Pod bar, replacing the workspace
    body; closing restores the previously selected and pinned lanes unchanged.
    Both open with zero Pods.
25. `src/renderer/src/state/**` remains the only place referencing
    `window.orcastrate`, with `isolation.test.ts` passing unchanged.
26. **All six new channels get a real error surface, and none joins the
    surface-less allowlist.** `SURFACELESS_CHANNELS` still holds exactly the nine
    names it holds today, the surfaced list becomes exactly twelve, and each new
    channel is genuinely invoked during the sweep.
27. The style-hygiene rule widens to cover border widths, tracking and font
    weights, now that tokens exist for them — the backlog item this closes.
28. No test deletes a real file or reads a developer path. Every filesystem test
    builds its own tree under `mkdtempSync(join(tmpdir(), …))` with tracked
    cleanup.
29. `npm test` and `npm run typecheck` pass.

## Scope

**In:** everything in the definition of done — design §6 and §7 in full, the four
contract changes they require, and the widened hygiene rule the backlog predicted.

### Not in scope

- **`~/.claude.json`** — global CLI config and MCP server entries. Out of MVP by
  design §7.
- **A hooks builder UI.** Hooks stay a validated raw-JSON pane; a partial builder
  would misrepresent what hooks can express.
- **Adopting terminal-started sessions.** Beachcomber enumerates
  `~/.claude/projects/` for cleanup only; giving those sessions Orcastrate titles
  is a separate backlog item.
- **Direct Calf steering, `forkSession` branching, the `canUseTool` ordering
  race.** Unchanged from sub-session 2.
- **Widening `PodManagerApi` with a liveness predicate.** See Assumptions — this
  session blocks a superset instead.
- **Pinning `MIGRATION_1`'s four remaining interpolated enums.** A live backlog
  item, but this session adds no migration and does not touch
  `src/main/store/**`.
- **Any new runtime dependency.**

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Is `~/.claude/projects/` directory-name decoding reversible? | No — lossy and ambiguous. `:`, `\`, `/`, `.` and literal `-` all collapse to `-` | 1 | `~/.claude/projects/` listing: `C--Users-dmarq-Development-Repos-dir-ect`, `…-dir-ect--claude-worktrees-dir-plugin` |
| Where does a project's true path come from? | The `cwd` field of the first cwd-bearing record in the directory's session `.jsonl` | 1 | `~/.claude/projects/C--Users-dmarq-Development-Repos-dir-ect/0bde2d77-….jsonl` → `"cwd":"C:\\Users\\dmarq\\Development\\Repos\\dir-ect"` |
| Can "a directory backing a currently **open** Pod" be computed? | No. `PodManagerApi` has no liveness predicate and `Pod.status: idle` covers both open-and-quiet and closed. Every known Pod's directory is blocked instead — strictly stronger, and the refusal says so | 1 | `PodManagerApi`; `Pod.status` in `src/shared/contracts/events.ts` |
| Is `crossSessionInbound` a real settings key? | Yes, in CLI 2.1.235, with a `peer_inbound_gate` and a `crossSessionInbound=refuse` opt-out path | 1 | strings in `~/.local/share/claude/versions/2.1.235` |
| Is its full value set confirmed? | No. `accept` and `refuse` observed; `hold` implied by a "not parking a late peer message" line but unconfirmed. Offered with a verbatim caveat and validated as a warning, not an error — refusing it would make Helm less capable than a text editor | 1 | same binary; design §7 names all three |
| Does a settings file always exist? | No. This repo has no `.claude/`, and `~/.claude/settings.json` has no `permissions` key. Absent file and absent key are normal | 1 | `ls -a` repo root; key listing of `~/.claude/settings.json` |
| Is Helm the only writer of project `settings.json`? | No — the CLI writes it on every "Allow always", from inside the running app | 1 | `src/main/pod/options.ts:170-185`; `src/main/pod/permissions.ts:93-98` |
| Does the no-paths rule forbid Beachcomber? | No. It forbids a path the renderer can **act on**. Ids are main-minted per scan, so the renderer cannot forge one for a directory it was not shown — strictly stronger than `dialog.pickDirectory`, which does hand over a real path | 1 | `src/shared/contracts/ipc.ts:12-14,140-142` |
| Is there a panel slot in the layout? | No. `WorkspaceLayoutProps` has six slots and none of them fits a panel | 1 | `src/renderer/src/contracts/renderer-view.ts:46-58` |
| How is main-process filesystem work tested here? | `mkdtempSync(join(tmpdir(), …))` with tracked cleanup; nothing touches developer paths | 1 | `tests/unit/store/helpers.ts:9-35` |
| Baseline | 55 test files / 881 tests pass, typecheck clean — verified this session after `npm ci`, which was needed because `node_modules` was absent | 1 | `npm test`, `npm run typecheck`, 2026-08-19 |

## Contracts

Four drafts, frozen at Gate 2. `ipc.ts` is imported rather than restated; these
are the seams between this session's tasks.

- `contracts/panel-host.ts` — `PodDirectory`, `PodDirectoryProvider`,
  `TrashItem`, `PanelClock`. The two dangerous capabilities — "move this to the
  recycle bin" and "which directories belong to a Pod" — are injected ports, so
  every service test runs against a synthetic tree instead of a real disk.
- `contracts/beachcomber.ts` — roots, `BeachcomberEntry` with `pathSource` and
  `blocked`, scan/preview/trash payloads, `BeachcomberApi`,
  `BeachcomberService`.
- `contracts/helm.ts` — scopes, `HelmDocument` and `HelmRevision`, validation
  severities, save request and result, `HELM_CONFLICT_CODE`, `HelmChangedPush`,
  `HelmApi`, `HelmService`.
- `contracts/renderer-panels.ts` — panel view models and hooks, the layout-slot
  amendment, `ADDED_TOKENS` and `ADDED_LAYOUT_TOKENS`, `PANEL_TEST_IDS`, and the
  two verbatim user-facing notices.

## Open questions

None unresolved. Four **contract changes** need approval at Gate 2 before any
dispatch, and the tasks that carry them are instructed to stop and report if
approval did not happen:

1. `ipc.ts` — the reserved namespaces become real, non-optional members.
2. `renderer-view.ts` — `WorkspaceLayoutProps` gains `panelBar?` and `panel?`.
3. `renderer-theme.ts` — `TOKENS` gains seven style tokens and two layout
   tokens, additions only.
4. `src/preload/api.ts` — follows (1) mechanically.
