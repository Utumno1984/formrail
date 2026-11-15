---
'@formrail/core': patch
---

`ListReport` selection bar without `bulkActions`, below 640px: the count keeps a minimum width of `8ch` and,
when there is no room for it next to "Clear selection" (large text, a long localized label), the bar goes to
two lines instead of squeezing the count to a few pixels. The wrap depends only on width, text size and label,
never on the selection, so the bar keeps the same box at 0 and at n selected. The TSDoc of `bulkActions` now
says that the presence of the prop decides the layout (a function returning `null` counts as "with actions").
