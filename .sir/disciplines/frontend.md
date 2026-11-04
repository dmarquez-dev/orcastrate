# Orcastrate frontend fragment

Rules are binding. Where one conflicts with a frozen contract, the contract wins.

## Indexed access under `noUncheckedIndexedAccess`

- `noUncheckedIndexedAccess` is on for the renderer and shared code (`tsconfig.web.json:24`), so indexing an array or record, and destructuring from one, yields `T | undefined`.
- Where an indexed or destructured value being absent would be a defect, narrow it with an explicit guard that throws a named error before the value is used: `if (x === undefined) throw new Error('<what was missing>')`, where the message names what was missing (the key, index, or entity), not a generic "undefined".
- Do not use a non-null assertion (`!`) as that guard. It silences the type without checking anything, and the missing value surfaces later as an unrelated failure.
- Do not use a type cast (`as`) as that guard. A cast to `T` asserts the same thing as `!` and checks nothing at runtime.
- Where absence is a legitimate state rather than a defect, handle it explicitly (a default, an early return, an empty render) instead of throwing.
