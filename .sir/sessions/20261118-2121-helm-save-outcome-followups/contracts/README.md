# Contracts: none

This session has one task (T1), so no interface crosses a task boundary and nothing is frozen here.

`useSaveOutcomeScroll`'s signature may change in T1: it has one caller, `src/renderer/src/helm/HelmPanel.tsx`, and T1 owns both files. `HelmNoticesProps` has one caller as well, `HelmPanel.tsx`, which T1 also owns. The store (`src/renderer/src/state/panel-store.ts`) and main (`src/main/helm/helm-service.ts`) are not changed, so `HelmView`, `HelmActions` and the `helm:save` envelope keep the shape they have at `c40d1bb`.
