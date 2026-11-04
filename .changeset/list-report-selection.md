---
'@react-object-page/core': minor
---

List Report: opt-in multiple selection on the data. `useListReport({ selectable: true })` adds `table.selection` (controlled `selectedIds` / `defaultSelectedIds` / `onSelectedIdsChange` called only for gestures, `toggle`, `toggleAllResults`, `clearSelection`, `setSelectedIds`, tri-state `allResultsState`, `selectedResultCount`, `hiddenSelectedCount`, `getSelectedRows()` = selected rows among the current results, in table order). `ListReportTable` renders a leading checkbox column (tri-state "Select all results" header, one distinctly named checkbox per row, `data-selected` row highlight); `ListReport` adds an always-mounted selection toolbar with the count, "Clear selection" and a `bulkActions` slot. Without `selectable` nothing changes.
