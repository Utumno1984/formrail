---
'@formrail/core': minor
'@formrail/pro': patch
---

List Report table (#501): when the columns do not fit the scroll container, a translucent shade marks each inline edge past
which columns are hidden (end at first, both in the middle, start at the end; mirrored in `rtl`). It sits above the sticky
header and below every overlay, takes no pointer event, is `aria-hidden`, and stops before the sticky row actions column.
New documented styling hook on the scroll container: `data-rop-overflow-start` / `data-rop-overflow-end`, set on the client
only (on scroll and on resize, 1px tolerance). The fade uses the feedback motion tokens and is instant under reduced motion;
in forced colours a `CanvasText` line marks the edge. Shared by `ListReportTable`, `ListReport` and, in `@formrail/pro`,
`VirtualListReportTable` / `VirtualListReport` (no Pro source change). Nothing is rendered when every column fits.
