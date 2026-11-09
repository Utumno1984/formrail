---
'@react-object-page/core': minor
---

New `ConfirmDialog` and `useConfirmDialog`: a confirmation for destructive actions built on `Dialog`, with a safe
initial focus (Cancel for `tone="danger"`), a required `confirmLabel` that names the action, and a pending state for an
async `onConfirm` (no double submission, no dismissal while pending, focus never lost). `useConfirmDialog` returns
`[confirm, confirmDialog]`: `await confirm(options)` resolves `true` / `false`.
