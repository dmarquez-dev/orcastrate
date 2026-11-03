# Contracts: none

This session has no cross-task interface, so `manifest.json` lists `"contracts": []`.

The only interface change is D4's third `BeachcomberPathSource` member, `'absolute-path'`. It is declared in the source-tree contract `src/shared/contracts/beachcomber.ts`, and that file belongs to T2. Its consumers are `src/main/beachcomber/service.ts` and `paths.ts` and the renderer row test that covers the new member, and T2 owns all of them, so no other task reads it.
