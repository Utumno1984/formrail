---
'@react-object-page/core': minor
---

New `RadioGroup` and `RadioGroupItem`: native radios sharing a `name` inside a `role="radiogroup"`, wired to `Field` (the Field `id`, description, invalid, required and read-only state sit on the group, never on a radio, so a click on the Field's label never changes the value). In `forced`/`locked` the selected radio stays focusable but arrows, Space and clicks (radio, inline label, Field label) change nothing; `onValueChange` is never called from an external `value` change or a form reset.
