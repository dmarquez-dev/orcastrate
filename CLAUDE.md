# CLAUDE.md

## Git: every change reaches `main` through a pull request

Nothing is committed to `main` locally and `main` is never pushed. Work goes on a
feature branch off an up-to-date `origin/main`, which is pushed. The user opens and
merges the PR, using a merge commit, never a squash or rebase. The work is finished
once the PR has merged.

These rules override the SIR plugin's own merge-to-base and push-the-base steps
wherever the two disagree.

### SIR sessions (every track, Small included)

1. **Branch.** Fetch `origin` first, then branch from `origin/main`. The SIR plugin
   names the session branch (`<type>/<slug>`) and records it as `branch` in
   `.sir/sessions/<id>/state.json`. Every `<branch>` below means that recorded name.
   A Small session gets its branch too and never commits in place on `main`. Small has
   no `state.json` and the plugin names no branch for it, so name it `<type>/<slug>`:
   the type from the request, the slug the session id's topic (the part after
   `YYYYMMDD-HHMM-`). Check it with
   `node <plugin root>/scripts/branch-name.mjs check <name> <repo root>` before creating
   it, and read it later with `git branch --show-current`.
2. **Gate 3 approval does not merge.** Skip `merge-session`. On approval:
   - Commit the session's records onto the session branch, in the session worktree:
     `.sir/sessions/<id>/`, plus the Gate 3 edits to `.sir/backlog.md`. These files are
     written in the main checkout during the session, so copy them into the worktree
     first.
   - Run wrap on the branch in the same way: the `.sir/lessons.md` and `.sir/log.md`
     appends, plus `session.json`'s metrics, `ended` and `status`. The session is
     recorded `WRAPPED` in the commit the PR carries, so the PR holds the code, the
     records and the lessons together.
   - Gate 3's push question means pushing the session branch:
     `git push -u origin <branch>`.
3. **Hand over the PR.** Give the user the branch name and the compare link
   `https://github.com/dmarquez-dev/orcastrate/compare/main...<branch>?expand=1`.
4. **Wait for the merge in the same session.** Do not finish until the PR has merged.
   - Check with `gh pr view <branch> --json state,mergedAt` if `gh` is
     installed.
   - Otherwise, after `git fetch origin`, check that
     `git merge-base --is-ancestor <branch tip> origin/main` succeeds.
   - Poll at a sensible interval rather than in a tight loop.
   - If review asks for changes, commit them to the same branch, push, and keep
     waiting.
5. **After the merge:**
   - Confirm each `.sir/` file left in the main checkout is byte-identical to its copy
     on the merged branch. Compare the blobs, not the working tree, because
     `core.autocrlf` is on.
   - Discard those copies, restoring the tracked ones and removing the untracked session
     directory, so that `git pull` does not refuse on them.
   - Run `git pull --ff-only` on `main`, then remove the worktree. Keep the branch.

### `/sir:sir-tend` and other bookkeeping

A tend, or any other `.sir/` edit outside a session, works the same way. Branch off
`origin/main` in the main checkout, on `chore/tend-<YYYYMMDD>` for a tend (otherwise a
`<type>/<slug>` name the SIR plugin's `branch-name.mjs check` accepts), commit there,
and push the branch. Then wait for the PR to merge, switch back to `main` and run
`git pull --ff-only`.
