---
'@react-object-page/core': patch
---

`@react-object-page/core/internal` (not public API): three optional, non-breaking props for the
virtualized table of `@react-object-page/pro` — `ListReportTableRow` gets `onToggle(id, event)` (replaces
`selection.toggle(id)` as the effect of the row checkbox and receives the click event, so a range
gesture can read `shiftKey`) and `renderCellOptions` (passed to `renderCell`, e.g. `forceTruncate`);
`ListReportTableShell` gets `headRowProps` (attributes of the header `<tr>`, e.g. `aria-rowindex`).
Without them the DOM and behaviour of `ListReportTable`/`ListReport` are unchanged.
