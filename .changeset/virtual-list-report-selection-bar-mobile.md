---
'@formrail/pro': patch
'@formrail/core': patch
---

`VirtualListReport`: below 640px without the consumer's `bulkActions`, the selection bar is one line (count and "Clear selection") with no "Select all N results" (hidden by CSS: out of the layout, the accessibility tree and the tab order); the header checkbox selects every result there. The header checkbox keeps its name ("Select all results") and gains a description, "All 10,000 results, including those not on screen", from the new optional label `selectAllResultsDescription` (absent while there is no result). With the consumer's `bulkActions`, or from 640px, the bar is unchanged. When "Select all N results" or a consumer action holds the focus and goes away (a viewport crossing 640px, `bulkActions` dropped), the focus goes to the header checkbox.

`@formrail/core`: internal channels only for this (`ListReportFrame`'s internal `bulkActionsWideOnly` and `keepBulkActionsFocus`, `headSelectAllProps` on `ListReportTableShell`, `selectAllProps` on `ListReportTableHead`, all from `/internal`); no public API and no change to `ListReport`.
