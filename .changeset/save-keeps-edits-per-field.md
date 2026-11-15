---
'@formrail/core': minor
---

`useObjectPageForm`: a `save` that succeeds while the user kept typing now decides field by field, with the same rule as the React Hook Form adapter of `@formrail/pro` (#507).

- Before: any edit made during the save kept all the current values, so a field the user did not touch but the server normalized (a trim, `50.123` → `50.12`) stayed dirty with the typed value.
- After: a field edited since the save started keeps the typed value and stays dirty; every other field takes the value returned by the handler and is clean; `values` is the returned object itself when nothing differs from it.

The rule descends into plain objects; an array edited during the save is kept whole (rows are never paired by position); keys removed or added by the user stay so, a key the server did not return is dropped unless the user edited it. "Edited" is decided with the default structural comparison, never with `isEqual`. A `reset` during the save still wins, and a handler that returns nothing keeps the current values against the sent baseline, as before. No signature changes.
