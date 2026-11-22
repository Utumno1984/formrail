---
'@formrail/core': patch
---

`ConfirmDialog`: `0n` (bigint zero) now counts as blank, like `0` and `NaN`, both as `confirmDisabledReason` (no reason: the button works) and as `confirmLabel` (logs the "needs a confirmLabel" `console.error` in development). The TSDoc of `confirmLabel` lists the values that count as a blank label.
