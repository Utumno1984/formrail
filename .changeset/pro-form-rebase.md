---
'@react-object-page/pro': minor
---

`computeRebase` and `useFormRebase` (#383): three-way merge of a server update into a form being edited. Fields the user did not touch take the incoming value, touched fields keep the user's value, and fields changed by both sides in different ways are exposed as conflicts. `useFormRebase` applies the merge to a core `useObjectPageForm` through its public API (`reset` + `setValues` in one batch), queues an update that arrives during a save, and tracks the conflicts until they are resolved, the form is saved or reset. The package stays private.
