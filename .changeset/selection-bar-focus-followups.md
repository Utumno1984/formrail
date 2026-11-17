---
'@formrail/pro': patch
'@formrail/core': patch
---

`VirtualListReport`: the focus rule of the selection bar (a focused control of the bulk actions that goes away hands the focus to the header checkbox) now also sees a control nested inside a wrapper of the consumer (a change of children or of `hidden`/`class`/`style` anywhere inside the bulk actions) and a control under `visibility: hidden` (e.g. "Select all N results" once the selection stops being partial because of a change that is not a gesture on it); a control with `visibility: visible` inside a hidden wrapper keeps its focus. The label `selectAllResultsDescription` of `VirtualListReportLabels` is optional (it has a default, now documented as English only like the other labels).

`@formrail/core`: the observer of that rule left `ListReportFrame` for the Pro, so the Free `ListReport` no longer ships it (smaller bundle, no change of behaviour). Internal channels only: the frame's internal `keepBulkActionsFocus` is replaced by `bulkActionsSlotRef`, and `/internal` re-exports `isLaidOut`; no public API change.
