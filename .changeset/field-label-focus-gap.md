---
'@react-object-page/core': patch
---

`Field`: the label now sits 8px above the control (was 4px), so the 2px focus ring (2px offset) of `Input`, `Select` and `Combobox` no longer touches the label (measured gap 0px → 4px). The ring itself is unchanged. The space under the control (help, reason, error) is out of scope here.
