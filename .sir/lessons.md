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
