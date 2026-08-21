# DIR log

One line per session. Sub-session records live under `sessions/<slug>/log.md`.

- 2026-08-18 — `2026-08-18-orcastrate-mvp` (Standard) — merged. MVP items 1–5: persistent Pods, lane routing, transcript and composer, permission prompts and interrupt, Steer.
- 2026-08-19 — `2026-08-19-orcastrate-workspace-ui` (Standard) — merged. Workspace shell, Pod bar, lane rail, permission cards, run control.
- 2026-08-19 — `2026-08-19-orcastrate-beachcomber-helm` (Standard) — merged. MVP items 6–7: the Beachcomber cleanup panel and the Helm settings editor.
- 2026-08-20 — `2026-08-20-orcastrate-pod-lifecycle` (Standard) — merged `1ba979c`. Fixed the four lifecycle defects the first hand-run found: startup reconciliation of persisted Pod and lane state, `opened` derived from `pod.status`, the orphaned child a failed `start()` left streaming, and session-id capture narrowed to `system/init` and `result`. Widened `PodStatus` with `'closed'` by user decision at Gate 2, which required pinning `MIGRATION_1`'s status list and adding migration 3. 7 tasks, 0 revision rounds, 0 blocking findings. 91/1392 tests → 102/1551.
- 2026-08-20 — `2026-08-20-orcastrate-open-resumes` (Small) — committed in place. Closing and reopening a Pod lost Claude Code's conversation context, because `openPod` never passed the SDK's `resume` option; only `reconnectPod` did, and only a beached Pod could reach it. Found by hand-running the app after the lifecycle session. `openPod` now resumes against the stored `ccSessionId`; a resume the CLI rejects falls back to one fresh session and writes a `resume_fallback` notice into the transcript, by user decision at dispatch. 0 revision rounds, 0 blocking findings. 102/1551 → 103/1562.
