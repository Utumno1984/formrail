---
'@formrail/core': minor
---

New `MultiSelect`: a synchronous multi-value combobox. The selected values are chips inside the field (they wrap, a long label is truncated with its full text in a tooltip on hover), the list stays open after each pick, Backspace on an empty text or a chip's remove button removes a value, and the value is in selection order (`[]` when the user removes the last one). Integrated with `Field` (forced/locked never open nor change the value), no echo for a `value` or `options` that change from outside, hidden inputs for `FormData.getAll(name)` and native form reset. Exports `MultiSelect`, `MultiSelectProps`, `MultiSelectOption`, `MultiSelectLabels`, `MultiSelectSize`.
