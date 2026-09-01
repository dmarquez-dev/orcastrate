# Coverage — 2026-08-31-orcastrate-helm-draft-safety

Gate 2 columns written at sign-off; End state filled at Gate 3 from `reviews/<task-id>.md`
and from a call-site search over the session's own change surface
(`git diff --name-only $(git merge-base main HEAD)..HEAD`, 29 files).

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. Failed same-scope reload keeps the draft | T2 (impl + unit), T5 (e2e, and corrects the comment that pinned the old behaviour) | covered | **met** — T2 criteria 1-5 met, both directions shown failing against the mutation that actually breaks each; T5 criteria 1-3 met |
| 2. Contract's side-by-side becomes buildable and is built | T1 (declares `compare`/`incoming`, amends conflict docblock), T2 (store impl), T4 (comparison UI), T5 (e2e) | covered | **met** — T1 criteria 1,4,5 met; T2 criterion 6 met; T4 criterion 4 met, with the probe failing explicitly if the two columns cannot be told apart; T5 criterion 4 met |
| 3. Closing with a dirty draft does not discard it | T1 (guard contract), T3 (mechanism + shell routing), T4 (guard + panel-owned dialog), T5 (e2e) | covered | **met** — T1 criterion 6 met; T3 criteria 1-10, 14-19 met; T4 criteria 1-3 met; T5 criteria 5-7 met |
| 4. `HelmValidationIssue.field` documents seven names | T1 | covered | **met** — T1 criteria 2 and 3 met; type still `string`, verified by a negative search whose failure modes the reviewer stated |

## Contract operations

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `HelmActions.compare()` | T2 (`panel-store.ts`) | T4, T5 | covered | **called** — `src/renderer/src/helm/HelmPanel.tsx` |
| `HelmView.incoming` | T2 (`panel-store.ts`) | T4 (read), T5 | covered | **called** — `src/renderer/src/helm/comparison.ts`, `HelmComparison.tsx`, `HelmPanel.tsx` |
| `HelmView.comparing` | T2 (`panel-store.ts`) | T4 (read), T5 | covered | **called** — `src/renderer/src/helm/HelmComparison.tsx`, `HelmPanel.tsx`, `HelmNotices.tsx` |
| `useRegisterPanelCloseGuard` | T3 (`shell/panel-close-guard.tsx`) | T4 | covered | **called** — `src/renderer/src/helm/HelmCloseGuard.tsx` |
| `PanelCloseGuard.beforeClose()` | T4 (`helm/HelmCloseGuard.tsx`) | T3 (the controller awaits it), T5 | covered | **called** — `src/renderer/src/shell/panel-close-guard.tsx` |
| `PanelCloseController.requestClose()` | T3 (`shell/panel-close-guard.tsx`) | T3 — self-called | covered, with a caveat recorded at Gate 2 | **not called**, by the rule — see the note below |
| `PanelCloseController.requestOpen(next)` | T3 (`shell/panel-close-guard.tsx`) | T3 — self-called | covered; added at Gate 2 when the `onOpen` row was folded in | **not called**, by the rule — see the note below |
| `HELM_VALIDATION_ISSUE_FIELDS` | none — never shipped | none | no caller, deliberately | **out of scope** — T1 criterion 3 forbade shipping it; it documents the seven names, and narrowing `field` to a union would remove the pressure keeping `issues.ts`'s catch-all honest |

### The two `not called` rows, with their weight stated plainly

Both controller methods **are** invoked in shipped code — `src/renderer/src/App.tsx` calls
`requestClose()` and `requestOpen(key)`. The rows read `not called` because the search discards
every hit in a file owned by the same task that owns the definition site, and T3 owns both
`shell/panel-close-guard.tsx` and `App.tsx`. Every other surviving caller is a test file, which
the search also discards.

**This is the false alarm the check is designed to prefer over a silent pass, and Gate 2
predicted it in writing**: the coverage table recorded at sign-off that this pair is self-called
and therefore gets no cross-task integration pressure, and named T5's end-to-end suite as the
compensating check. That check was delivered — T5's suite drives the real `App` and clicks the
real strip buttons, and its reviewer independently reddened all eight of its tests.

What the rule correctly refuses to certify is that any *other* task had to integrate against
these two methods. None did. If T3's routing were wrong in a way its own tests shared a blind
spot with, no second task's work would have collided with it.

## Uncovered at Gate 2

| Row | Status |
|---|---|
| `PanelBar.onOpen` is not guarded | **Closed at Gate 2.** User folded it into T3 rather than backlogging it: `onOpen` now routes through `requestOpen()`, and a declined switch leaves the original panel open and mounted. T3 gained 6 criteria, T5 gained 1. No uncovered rows remained at freeze. |
