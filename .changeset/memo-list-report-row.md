---
'@react-object-page/core': patch
'@react-object-page/pro': patch
---

`ListReportTableRow` (`/internal`) is memoized: a row re-renders only when its row object, selected state, `columns`, id, selection label, `labels.selectRow`, `rowProps` or extension props change, not on every render of its parent. `VirtualListReportTable` now hands each mounted row a stable `rowProps` object (cached per id) and a stable `onToggle`, so a range change during scroll renders only the rows that enter the range.

**Behaviour change on the public `ListReportTable`:** a render of the parent no longer re-evaluates `cell`, or `accessor` when it provides the cell text, for an unchanged row. If your `columns` array stays the same:

- A cell that reads anything other than its `row` and the values `columns` was built with (a ref, a module variable such as the current language, a store snapshot, `Date.now()`, the selection of other rows) keeps showing the old value. Make that value a dependency of the `useMemo` that builds `columns`, or return a component that subscribes to it.
- A row object mutated in place is not detected, and the old content stays on screen. Pass a new object in `rows`.

A new `columns` array on every render keeps the previous behaviour for cells: every row renders with its parent.
