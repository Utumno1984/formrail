---
'@formrail/core': minor
'@formrail/pro': patch
---

List Report: per-row actions. `ListReportTable` and `ListReport` accept `rowActions: (row) => readonly ListReportRowAction[]`, which adds a trailing structural column (not one of `columns`, as wide as a row is tall, sticky at the inline end so it stays in view while a narrow table scrolls sideways) with, in every row that has actions, a "…" button named "Actions for <row label>" (`labels.rowActions`, from the resolved `getRowLabel`, also without `selectable`) that opens a `Menu` with one item per action (`label`, optional `icon`, `disabled`, `tone: 'danger'`). `onSelect` receives `{ returnFocusRef }`, the row's trigger, to pass to a dialog the action opens. The header is named "Actions" (`labels.rowActionsColumn`, visually hidden); skeleton, empty, no-results and error states span the extra column. Without `rowActions` the DOM is unchanged. Exports `ListReportRowAction`, `ListReportRowActionContext`, `ListReportRowActions`. In `@formrail/pro`, `VirtualListReportTable`/`VirtualListReport` pass `rowActions` to their rows (same column and menu on the mounted rows).
