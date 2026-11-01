---
'@react-object-page/core': minor
---

`Field`: new `name` prop, the logical name of the field. The control gets `data-rop-name` (a valid attribute on any element, so `Select`'s trigger carries it too; absent when `name` is not set) and `Input` and `Combobox` also emit a native `name` unless given their own; `Select` still never emits `name`. `useFocusFirstInvalidField` now looks controls up by `data-rop-name` first and falls back on `[name]` for the keys no Field-wired control answers to, so an invalid `Select` receives the focus (before, it could not be found). A render-prop control must spread `data-rop-name` to be found this way.
