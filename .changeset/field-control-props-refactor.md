---
'@react-object-page/core': patch
---

Internal refactor, no behaviour change: `Input`, `Select` and `Combobox` now resolve what they take from the enclosing `Field` through one internal hook, share one invalid-border class, and `isDev` lives in one internal file.
