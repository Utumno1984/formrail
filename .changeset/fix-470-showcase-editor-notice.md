---
'@formrail/core': patch
---

Story-only showcase, no API or default change (#470): in the invoice editor of the CRUD showcase, the `frameRef` read by the `scrollerRef` given to `useAddons` is declared before the addons hook, so an addon that reads `scrollerRef.current` during its render gets `null` before the first commit instead of a `ReferenceError`.
