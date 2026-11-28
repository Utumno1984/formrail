---
'@formrail/core': patch
---

At 320 px the Tooltip, the Calendar and the List Report edge shade stay inside the viewport. The Tooltip maximum width shrinks to the room available (20rem otherwise) and its text wraps; the Calendar gives up padding (never the 40 px day cells) below 22rem; the edge shade of a table shorter than its scrollport ends where the last row ends.
