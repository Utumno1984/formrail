---
'@formrail/core': patch
---

Tabs: the overflow indicators of a horizontal tab list read the layout at most once per frame while
scrolling (the final position of a scroll is always read), and adding or removing a tab only starts
or stops observing that tab instead of re-observing the whole list. ObjectPage's Anchor Bar, the
List Report table and Tabs now share one internal resize/mutation subscription; no change to their
observable behaviour.
