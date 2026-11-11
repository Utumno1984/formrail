---
'@formrail/core': minor
---

`ConfirmDialog` / `useConfirmDialog`: new optional `initialFocus?: 'cancel' | 'confirm'` prop that chooses which button takes the focus when the dialog opens, independently of `tone`. Without it nothing changes (Cancel for `danger`, the confirm button for `default`). Use `initialFocus="cancel"` with `tone="default"` for a non-destructive review step, so a key held on the opener (Enter auto-repeat) cannot confirm it before the user has read it.
