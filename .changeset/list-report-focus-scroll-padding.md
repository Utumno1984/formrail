---
'@react-object-page/core': patch
'@react-object-page/pro': patch
---

List Report: moving the focus upwards with Shift+Tab no longer leaves the focused row checkbox hidden behind the sticky header. The scroll container now reserves the header height as scroll padding, so the browser scrolls the focused row into view below the header (`ListReportTable` and `VirtualListReportTable`).
