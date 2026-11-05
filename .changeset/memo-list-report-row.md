---
'@react-object-page/core': patch
'@react-object-page/pro': patch
---

`ListReportTableRow` (`/internal`) is memoized: a row re-renders only when its row object, selected state, `columns`, id, selection label, `labels.selectRow`, `rowProps` or extension props change, not on every render of its parent. `VirtualListReportTable` now hands each mounted row a stable `rowProps` object (cached per id) and a stable `onToggle`, so a range change during scroll renders only the rows that enter the range. This also applies to the public `ListReportTable`: a `cell` that reads state other than its `row` while `columns` stays the same is no longer re-evaluated by a parent render (put that state in the `columns` dependencies), and a row object mutated in place is not detected (pass a new object).
