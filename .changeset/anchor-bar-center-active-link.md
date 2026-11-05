---
'@react-object-page/core': patch
---

`ObjectPageAnchorBar`: the active link is now centered in the horizontally scrolling list whenever it changes (it used to be aligned to the nearest edge, and only when not fully visible), so the scroll position of the bar no longer depends on which sections were active along the way.
