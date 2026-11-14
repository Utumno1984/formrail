---
'@formrail/core': patch
---

List Report: below 640px, a selection bar without `bulkActions` keeps the count and "Clear selection" on one line (the count is truncated, "Clear selection" keeps its box while hidden). With `bulkActions` the bar stays on two lines; from 640px up nothing changes. The bar carries `data-rop-bulk-actions="true"` or `"false"`, decided at render by the presence of the prop.
