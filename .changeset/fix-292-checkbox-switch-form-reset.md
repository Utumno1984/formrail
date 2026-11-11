---
'@formrail/core': patch
---

Fix (#292): a controlled `Checkbox` / `Switch` inside a `<form>` now realigns with its `checked` prop after a native form reset (same mechanism as `RadioGroup`). Before, the reset changed only the DOM, so the control and the React state diverged. The reset reports nothing and the next click still calls `onCheckedChange`.
