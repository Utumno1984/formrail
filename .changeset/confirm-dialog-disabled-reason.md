---
'@formrail/core': minor
---

`ConfirmDialog` / `useConfirmDialog`: new optional `confirmDisabledReason?: ReactNode` prop. When given, the confirm button is `aria-disabled="true"` (still focusable, never the native `disabled`, so the focus does not move when the reason appears or goes away while the dialog is open), described by the reason through `aria-describedby`, and a click, Enter or Space on it does nothing (`onConfirm` is not called). The reason is shown in the footer, above the buttons. Cancel, Escape and the backdrop still cancel. Without it (or with `null`, a boolean or a blank string) nothing changes.
