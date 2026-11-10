---
'@react-object-page/core': patch
---

Stories only, no API or behaviour change: the `Forms/Switch` and `Forms/Checkbox` "Controlled In Form" stories now carry a Docs description explaining that a controlled component does not follow a native form reset (React owns `checked`; reset the owning state in `onReset`) (#385).
