---
'@formrail/core': minor
---

`ConfirmDialog` / `useConfirmDialog`: new optional `confirmDisabledReason?: ReactNode` prop. When given, the confirm button is `aria-disabled="true"` (still focusable, never the native `disabled`, so the focus does not move when the reason appears or goes away while the dialog is open), described by the reason through `aria-describedby`, and a click, Enter or Space on it does nothing (`onConfirm` is not called). The reason is shown in the footer, above the buttons. Cancel, Escape and the backdrop still cancel. Without it nothing changes, and neither does it with `null`, a boolean, a blank string, `0`, `0n`, `NaN` or an array made only of those: all count as "no reason", so `count && reason` can be passed as is. The same values count as a blank `confirmLabel`, which logs the "needs a confirmLabel" `console.error` in development.
