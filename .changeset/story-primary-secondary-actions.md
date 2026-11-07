---
'@react-object-page/core': patch
---

Stories only, no API or default change: the Object Page / Object Page Footer stories (and the validation and schema recipes) now render the main action (Save, Approve) as an explicit `variant="primary"` next to the secondary Cancel / Discard / Reject, as the Introduction and Showcase already did. `Button` keeps `secondary` as its default.
