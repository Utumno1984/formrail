---
'@react-object-page/core': minor
---

New `Pagination`: standalone controlled pagination (Previous/Next, page numbers, ellipses, `siblingCount`/`boundaryCount`). The number of slots is constant for every page and each numeric slot has the width of the widest page number (tabular digits), so the control never changes width while paging; when the focused button is disabled or removed by the page change (e.g. "Next" on the last page) the focus moves to the current page. `onPageChange` is called only by a user gesture, never because `page` or `pageCount` changed from outside.
