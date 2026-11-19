---
'@formrail/pro': minor
---

`useFormRebase` (and the React Hook Form / TanStack Form bindings, which use the same engine): with several server
updates in a row, the conflicts **accumulate** until they are resolved (#584). Behavior change: before, every rebase
recomputed the conflicts from scratch, so the conflict of a first update disappeared when a second update changed
another field (and with it the "Server changes you overwrite" warning of an app that lists them).

- A conflict stays open until the user's value and the server's agree: closed by hand (`acceptTheirs`, `keepMine`,
  `acceptAllTheirs`, typing the server value), or by an update that brings the server to the user's value. An update
  that takes the server back to an older value does not close it.
- An update that changes the field of an open conflict again: still one conflict, `theirs` the latest server value,
  `base` the value that update replaced. Conflicts are deduplicated by field (array items by id); the order in which
  the updates arrive does not change the result.
- A successful save, `reset()`, `reset(newBaseline)` and a rehydration clear every accumulated conflict, as before.
- `applied` does not accumulate: it stays the list of the last update.
- The paths and labels of the conflicts are those of the last update; a conflict nested in a field that now has a
  conflict higher up is covered by it.

`computeRebase` is unchanged (one merge, no memory of earlier ones).
