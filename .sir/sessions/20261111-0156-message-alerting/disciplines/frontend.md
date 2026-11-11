<!-- source: sir-sdlc disciplines/frontend.md -->
# Frontend discipline

Rules are binding. Where one conflicts with a frozen contract, the contract wins.

## State ownership

- Every piece of state has exactly one owner. Two components holding the same fact will disagree.
- State lives at the lowest point that can serve every reader. Lifting further is a cost paid by everything in between.
- Derived values are computed, never stored. Stored derivations go stale silently.
- Server data and client interaction state are separate concerns and do not share a store.

## Data fetching

- A component states what data it needs; it does not orchestrate how the fetch happens.
- Every fetch has a declared loading state, a declared error state, and a declared empty state. A component that renders only the success path is unfinished.
- Requests whose results are independent are issued together. A dependent chain is a waterfall and is justified explicitly or removed.
- Nothing is fetched in response to a render. Fetching belongs to an explicit lifecycle or event.

## Component boundaries

- A component either arranges other components or renders content. One that does both is two components.
- Props are an interface. A component reaching around its props into global state cannot be reused or tested.
- Presentation components take data and callbacks; they do not know where either came from.
- A component file that has to be scrolled to be understood is doing too much.

## Accessibility floor

- Every interactive element is reachable and operable by keyboard alone.
- Semantic elements are used for their meaning. A clickable non-interactive element must carry an explicit role and keyboard handling.
- Every form control has a programmatically associated label.
- Color is never the only carrier of meaning.
- Focus is visible, and it moves predictably after an action that changes what is on screen.

<!-- source: .sir/disciplines/frontend.md -->
# Orcastrate frontend fragment

Rules are binding. Where one conflicts with a frozen contract, the contract wins.

## Indexed access under `noUncheckedIndexedAccess`

- `noUncheckedIndexedAccess` is on for the renderer and shared code (`tsconfig.web.json:24`), so indexing an array or record, and destructuring from one, yields `T | undefined`.
- Where an indexed or destructured value being absent would be a defect, narrow it with an explicit guard that throws a named error before the value is used: `if (x === undefined) throw new Error('<what was missing>')`, where the message names what was missing (the key, index, or entity), not a generic "undefined".
- Do not use a non-null assertion (`!`) as that guard. It silences the type without checking anything, and the missing value surfaces later as an unrelated failure.
- Do not use a type cast (`as`) as that guard. A cast to `T` asserts the same thing as `!` and checks nothing at runtime.
- Where absence is a legitimate state rather than a defect, handle it explicitly (a default, an early return, an empty render) instead of throwing.
