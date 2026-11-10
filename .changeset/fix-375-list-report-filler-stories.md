---
'@react-object-page/core': patch
---

Stories only, no API or default change: the `Foundations/Interaction states` Playground and `Internal/IconTextAlignment` stories set `loadingRowCount={1}` on their `ListReportTable`, so the empty reserved-space filler row no longer reads as a layout gap under the single real row (#375).
