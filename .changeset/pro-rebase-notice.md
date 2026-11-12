---
'@formrail/pro': minor
---

`<RebaseNotice />` (#384): the result of a `useFormRebase` rebase as a message strip ("This record was updated while you were editing"). It shows the count of server changes applied and every conflict with both values (rendered like `ChangeSummary`, with the same `renderValue`), the choices "Use server value" / "Keep mine" named after the field, and "Use all server values".
- **Announcements**: once per update, from a live region that is always mounted; a pending update that changes nothing once applied is announced too (`labels.pendingNoChanges`). An update never moves the focus.
- **Layout**: the content in view does not move when the notice appears or goes away, whatever has the focus. The scroll container follows; place the notice right above it with `scrollContainerRef`.
- **Focus**: a choice that removes the focused button moves the focus to a live element (`focusTargetFor`).
- **Texts**: configurable with `labels`.

`useFormRebase().conflicts` are now `OpenRebaseConflict` (new exported type): each conflict also carries `currentPath` and `labelPath` (and `label`) at the item's current position. Items of id-keyed arrays are found again by id after the user moves, removes or adds items.

Fix: `useFormRebase` applies a rebase in a layout effect, so a keystroke typed right after the rebase render is no longer lost.

The Pro showcase "Invoices with Change Summary" gains "Simulate server update" (story-only).
