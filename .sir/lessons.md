# Lessons

<!-- Project-level, not session-level. Append one line per lesson at wrap:
     the date, the session id, and the lesson in a sentence. Never create
     this file when there is nothing to append.

     A lesson is what the session learned that its artifacts do not already
     say — a rule that fired wrongly, a gate that cost more than it saved,
     an assumption that turned out false. Nothing that is already in
     reviews/, coverage.md, or a commit message: a lesson that restates an
     artifact is noise in the one file the next session reads first. -->

2026-10-29 20261029-1701-dir-backlog-to-sir Every session id on a seeded `.sir/backlog.md` line is a DIR id, so resolve it under `.dir-sdlc/sessions/` (six of nine resolve there; the other three are the synthetic ids the backlog header names), never under `.sir/sessions/`, where none exist.
2026-10-29 20261029-1730-census-root-hygiene Before a criterion names an in-repo idiom as the template to copy, check that the precedent runs under the same vitest environment as the files that will copy it: the `new URL('../../', import.meta.url)` root at `tests/router/helpers.ts:27` runs under the default `node` environment, and under the jsdom docblock the same literal form is turned into an `http:` URL that `fileURLToPath` rejects.
2026-11-03 20261102-2224-prose-drift-sweep Read every literal a criterion quotes off `git show <base>:<path>` at the moment you write it, never from a report or an earlier note: T4 C3 was frozen at Gate 2 quoting `hygiene.test.ts:1550-1551` in words the file never held (escalation E5), and the amendment written to fix it put the right words at the wrong anchor (:1549-1550), which only the re-review caught (A2).
2026-11-03 20261102-2224-prose-drift-sweep sir-report's four advisory groups have no kind for a docblock that misstates the code, so this session filed two of those (`Composer.styles.test.ts:56-59`, `rules.ts:16`) under `correctness risks` so that Gate 3 would ask about them; filed as `cosmetics` they would have shown only as a count and never been offered for carry-forward, even though on this project such items are backlog material.
2026-11-03 20261103-1657-tests-and-guards-sweep A lookbehind written to keep token-name digits out of a length matcher, `(?<![\w.-])`, also drops the leading minus of a real value, so `margin: -1px` (a form `LaneRail.module.css:429` already ships) went unseen by all three T7 scanners until the reviewer injected it. Give every stylesheet length or numeric scanner a signed must-match fixture next to its `--oc-space-1` near-miss.
2026-11-03 20261103-1657-tests-and-guards-sweep Gate 3's §3 needs a `Model` column, but neither `manifest.json` nor `state.json` records a task's model. The only durable source is the `DISPATCH` lines in the session's `log.md`, so a dispatch logged without its model leaves that column unrenderable after a resume.
2026-11-03 20261103-1657-tests-and-guards-sweep In the main thread, a `cd` inside a Bash command persists into later calls. The review phase's first read was a `cd .sir/sessions/<id> && cat …`, which moved the session's working directory into the session folder until a later command `cd`'d back to the repository root. Use absolute paths, as `sir-shell` says, even for a quick read.
