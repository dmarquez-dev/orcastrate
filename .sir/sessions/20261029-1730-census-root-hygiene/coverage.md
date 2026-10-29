# Coverage

**Definition of done**

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| DoD1: no `process.cwd()` root; each self-locates on `import.meta.url` | T1 (criteria 1–3) | covered | met |
| DoD2: per-file root-mismatch guard, red before conversion, green after | T1 (criteria 4–7, 9) | covered | met |
| DoD3: reintroduction guard with positive control, near-miss, injection | T2 (criteria 1–5) | covered | met |
| DoD4: mismatched-geometry run passes and agrees | T1 (criteria 7, 8); T2 (criterion 16) | covered | met |
| DoD5: `BORDER_PROPERTIES` docblock and constant agree | T2 (criterion 6) | covered | met |
| DoD6: retired-id self-check proves purpose | T2 (criteria 7–10) | covered | met |
| DoD7: prose counts at base `:850`, `:1170`, `:1341–1342`, `:1376`, `:1434–1435` | T2 (criteria 11–15) | covered (`:1434` added at Gate 2) | met |
| DoD8: repo-wide typecheck and full suite green | T1 (criteria 11, 12); T2 (criteria 17, 18) | covered | met |

**Contract operations**

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| (none: no contracts this session) | | | | |
