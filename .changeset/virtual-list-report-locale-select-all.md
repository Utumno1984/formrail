---
'@formrail/pro': patch
---

`VirtualListReport`: the default "Select all N results" formats N in the `locale` of `useListReport` (it was always `en-US`),
like the count and the selection text of the core floorplan. A custom `labels.selectAllResultsAction` still receives the raw number.
