---
'@formrail/core': patch
'@formrail/pro': patch
---

List Report table (#562): the `data-rop-overflow-start` / `data-rop-overflow-end` attributes and the edge shades follow a
`dir` changed after a horizontal scroll at once, also in Firefox, which moves the scroll back to the start without a
`scroll` event: a `dir` attribute changed on the scroll container or on an ancestor is now observed (one observer,
disconnected on unmount). A direction changed by the CSS `direction` property alone is still picked up at the next scroll
or resize. In browsers without `color-mix()` (Safari 16.0 and 16.1) the shades are now drawn, from an `@supports not`
fallback with the same colour and alpha; nothing changes where `color-mix()` is supported. Shared by `ListReportTable`,
`ListReport` and, in `@formrail/pro`, `VirtualListReportTable` / `VirtualListReport` (no Pro source change).
