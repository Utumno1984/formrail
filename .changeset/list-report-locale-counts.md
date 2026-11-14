---
'@formrail/core': minor
---

List Report: the default texts with numbers (the count next to the title, "n of m", and the selection bar's "1,234 selected
(56 hidden by filters)") format the numbers with `Intl.NumberFormat` in the `locale` passed to `useListReport` (the runtime
default when absent or invalid; with server rendering pass `locale` to avoid a hydration mismatch). A custom `labels.count`
or `labels.selectionCount` still receives the raw numbers. `UseListReportReturn` now returns the `locale` option
(`table.locale`). The count never wraps inside the number.
