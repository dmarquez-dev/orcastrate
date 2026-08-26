# Coverage — 2026-08-26-orcastrate-stop-transcript-visibility

Gate 2 columns written before the approval that freezes `manifest.json`.
End state written at Gate 3.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. A `lane_closed`/`stopped` written by the stop sweep is pushed live to the renderer | T1 | covered | met |
| 2. That event survives `'conversation'` mode, the default view | T2 | covered | met |
| 3. `lane_closed` is NOT unhidden wholesale — `done` and `orphaned` stay hidden | T2 | covered | met |
| 4. The transcript reads `Lane closed` / `Stopped`, with no new rendering work | T2 (confirms), T3 (asserts the rendered words) | covered | met |
| 5. Idempotence preserved: a second `closePod` pushes nothing on any channel | T1 | covered | met — after 1 revision round |
| 6. The joined outcome is proven by a test that would have failed at `ad0368a` | T3 | covered | met |
| 7. Both `_AssertNever` guards and the three-set partition survive untouched | T2 | covered | met |
| 8. `transcript-filter.ts`'s prose stays true of the code it describes | T2 | covered | met |
| 9. Migration 4's shipped blob is pinned in the frozen-migration tripwire | T4 | covered | met — after 1 revision round |

No uncovered rows.

## Contract operations

Filled at Gate 3. **Read the note below the table before reading the End state column** — the
mechanical search's literal output and the operation's actual reachability differ here, for a
reason specific to a defect-fix session, and both are recorded rather than one being silently
preferred.

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `push.podEvent({ podId, events: stored })` from `#stopRunningLanes` | T1 | T3 | covered | reached — see note |
| `appendMany`'s `NormalizedEvent[]` return captured rather than discarded | T1 | T1, then T3 through the pushed payload | covered | reached — see note |
| `podEvent` push suppressed on the idempotent second close | T1 | T1 | covered | reached — see note |
| `isDeliberateStopNotice(payload)` | T2 | T2 (`isHiddenInConversation`) | covered | reached — see note |
| `isHiddenInConversation` second exemption reaching `filterTranscriptEvents` | T2 | T3 | covered | reached — see note |
| `TranscriptEventItem` `lane_closed` case + `LANE_STATUS_LABEL.stopped` | pre-existing (previous session) | T3 | covered | reached — asserted by T3 |
| `SHIPPED_BLOB[4]` / `shippedMigration(4)` | T4 | T4 | covered | called — `migration-frozen.test.ts` `it.each([1,2,3,4])` |
| `hygiene.test.ts`'s `MAIN_REACHING_FILES` entry for `pod-stop.e2e.test.tsx` | pre-existing | T3 (satisfies it by not adding a file) | covered | satisfied — hygiene 21/21, file unedited |

## Two honest limitations, recorded rather than closed by declaration

**Same-task definition and call.** `isDeliberateStopNotice` is defined and called
inside T2, and the `podEvent` push is written and unit-tested inside T1. In both
cases the surviving cross-task evidence is T3's joined proof, which drives the real
`PodManager` from a click and reads the result off the rendered transcript. That is
the same shape the previous session recorded for `'stopped'` itself, and it is why
T3 depends on both halves rather than on either.

**A call site is not a user.** T3 proves the outcome in jsdom against real main-side
code. It does not prove it in a real Electron window — every test in this repository
is unit or jsdom by design (project spec §9), and the previous session hit exactly
this wall. The hand-confirmation of 2026-08-26 was the DIAGNOSIS, not the
verification, and nothing in this session's criteria may be reported as having
reproduced it. The strongest available claim after Gate 3 is that the joined path
was proven to fail without each half and to pass with both.

### The search's literal output, and why the End state column does not simply repeat it

**The mechanical rule returns `not called` for every operation above.** Run as specified — search
the session's touched files, then discard the definition site, every hit in a file owned by the
same task as the definition site, and every hit in a test file — nothing survives for any of them.

**That is a scoping artifact of a defect-fix session, not a gap in the product.** This session
changed six production lines across two files and added tests around them. Every consumer of every
operation is **pre-existing production code the session deliberately did not touch**, so no
consumer is in the touched-file set to be found. The one cross-task consumer that does exercise the
joined path, T3, is a test file and is discarded by the rule.

The reachability evidence, verified this session and recorded here because the table would
otherwise read as eight dead operations:

- **The push half.** `src/renderer/src/state/store.ts:287` — `api.on.podEvent((push) => this.onPodEvent(push))`.
  `git diff --name-only ad0368a..HEAD | grep -c state/store.ts` → **0**: untouched by this session.
- **The filter half.** `src/renderer/src/App.tsx:147,167` mount `TranscriptPane`, which calls
  `filterTranscriptEvents` (`TranscriptPane.tsx:89`), which calls `isHiddenInConversation`
  (`transcript-filter.ts:336`), which calls `isDeliberateStopNotice`. `App.tsx` is outside T2's
  `owns` and untouched by this session.

**What this still does not prove.** A call site proves something calls the operation; it never
proves a user can reach it. The chain above is read from source, not exercised against a running
application. The strongest claim this session supports is T3's: the joined path was proven to fail
without each half and to pass with both, in jsdom.
