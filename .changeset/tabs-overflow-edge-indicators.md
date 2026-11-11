---
'@formrail/core': patch
---

`TabsList` (horizontal): when the tabs do not fit, the list no longer looks cut off at its edge. Each side that hides tabs shows an indicator (a fade ending in a chevron, `aria-hidden`, not focusable); clicking it scrolls one view towards that side. The native scrollbar of the horizontal list is hidden in favour of the indicators, and `scroll-padding` keeps a tab brought into view by the arrow keys clear of the indicator. The tablist is now wrapped in a `<div data-rop-tabs-scroll>` (a positioning box when horizontal, `display: contents` when vertical, so a vertical layout is unchanged and switching orientation never remounts the list); the `ref`, `className` and props of `TabsList` still go to the `role="tablist"` element.
