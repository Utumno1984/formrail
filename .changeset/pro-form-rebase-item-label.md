---
'@formrail/pro': minor
---

Form Rebase (#534): row labels from the engine, in `@formrail/pro/engine` and `@formrail/pro`.

- `RebaseOptions.itemLabel` and `UseFormRebaseOptions.itemLabel`: the same option as
  `ChangeSummaryOptions.itemLabel` (#424), for the array-item segments of the labels of `applied`, of the
  conflicts and of the open conflicts of `useFormRebase`: `Line items > Item 2 (Chair) > Quantity` instead of
  `Line items > Item 2 > Quantity`. `ItemLabelContext.side` keeps its two values: `'values'` for an item of the
  result (the merged item, at its index there), `'baseline'` for an item that exists only in a baseline (removed
  by the server: the previous baseline; removed by the user and changed by the server: `incoming`).
- `useFormRebase` names every open conflict at its current position, with the item as it is now in
  `form.values`: a row the user moves, renames, or with rows added or removed above it, is named as it is now.
  A row that is not in the values any more keeps the label of the rebase. `itemLabel` is compared by identity
  (pass a stable function): a stable one keeps the `conflicts` array between renders.
- Lazy: called only for the item segments of what is reported, at most once per item and position in a rebase,
  never while the merge only decides whether a subtree changed.

Without the new option nothing changes. No new runtime export. Bundle: `computeRebase` +124 B and
`useFormRebase` +188 B gzip; see the PR for the numbers.
