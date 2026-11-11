---
'@formrail/core': minor
---

New `NumberInput` (#337): a numeric field with `role="spinbutton"`, a `number | undefined` value, `min`/`max`/`step`, ArrowUp/ArrowDown, PageUp/PageDown, Home/End and two stepper buttons (`Increase`/`Decrease`, renamable through `labels`). Typed text is a draft committed on focus loss or Enter (limited to `[min, max]`, never rounded to `step`); keys and steppers commit at once, without floating-point noise. The text follows the `locale`'s decimal separator (`.` is always accepted too, thousands separators never), the mouse wheel never changes the value, and a hidden input carries the canonical value (`"12.5"`) for `FormData`. Integrated with `Field` like `Input`: `forced`/`locked` block typing, paste, keys and steppers; no `onValueChange` for a value or locale changed from outside. Exports `NumberInput`, `NumberInputProps`, `NumberInputLabels`, `NumberInputSize`.
