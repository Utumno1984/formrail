---
'@react-object-page/core': minor
---

Add `Textarea` (#336): a multi-line text control that plugs into `Field` exactly like `Input` (id, merged `aria-describedby`, `aria-invalid`, `aria-required`, `disabled`, native `readOnly` for `forced`/`locked`). Optional `autoResize` with `maxRows` makes the height follow the content without layout jumps at first paint, re-measured on external value changes, width changes, font loading and form reset. No `onChange` echo on external value changes; the user emptying it emits `''`. Exports `Textarea` and `TextareaProps`.
