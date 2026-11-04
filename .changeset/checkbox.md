---
'@react-object-page/core': minor
---

New `Checkbox`: a styled native `<input type="checkbox">` with an optional inline label and an indeterminate state, wired to `Field` (id, name, description, invalid, required, disabled). In `forced`/`locked` it stays focusable but click (box, Field label, inline label) and Space change nothing; `onCheckedChange` is never called from an external `checked` change or a form reset.
