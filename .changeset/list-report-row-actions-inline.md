---
'@formrail/core': minor
'@formrail/pro': patch
---

List Report: `rowActionsInline` (#364) on `ListReportTable`, `ListReport` and the internal `ListReportFrame`. With `rowActionsInline={n}` the first `n` actions with an `icon` of every row are inline icon buttons (a tooltip with the label on hover/keyboard focus, named `labels.rowAction(label, rowLabel)`, default "Delete FT-2026-0001") while the table's scroll container is at least 40rem wide, followed by the "…" menu with the other actions; below 40rem every action is back in the "…" menu. The switch is CSS alone (a container query on the scroll container, not the viewport): both forms are rendered from the same descriptors and only one is displayed, so `onSelect` and `disabled` are the same in both (a disabled inline action is `aria-disabled`, focusable, and does nothing). `returnFocusRef` is the control that was used. A menu open when the form changes closes without running anything and the focus goes to the visible control of the row. The actions column is `n` icon slots wider in the wide form, the same on every row and in every state. With `rowActionsInline` the scroll container gets inline-size containment (its width must come from its parent). Default `0`: unchanged. New label `rowAction`.

Row actions menu: a press on the "…" trigger now gives it the focus, so closing the menu returns the focus to that trigger instead of to the control that was focused before (e.g. another row's button).

Pro: `VirtualListReportTable` and `VirtualListReport` pass `rowActionsInline` to their rows.
