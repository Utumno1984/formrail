---
'@formrail/pro': minor
---

`<RebaseNotice />` (#384): the result of a `useFormRebase` rebase as a message strip ("This record was updated while you were editing"), with the count of server changes applied and every conflict with both values (rendered like `ChangeSummary`, same `renderValue`) and the choices "Use server value" / "Keep mine" named after the field, plus "Use all server values". Announced once per update from a live region that is always mounted; the focus is never moved by an update, the focused field below the notice keeps its place on screen, and a choice that removes the focused button moves the focus to a live element. Texts configurable with `labels`. Fix: `useFormRebase` applies a rebase in a layout effect, so a keystroke typed right after the rebase render is no longer lost. The Pro showcase "Invoices with Change Summary" gains "Simulate server update" (story-only).
