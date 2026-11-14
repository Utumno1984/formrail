---
'@formrail/core': patch
---

Story-only showcase, no API or default change (#470): in the invoice editor of the CRUD showcase, the `frameRef` read by the `scrollerRef` given to `useAddons` is declared before the addons hook, so an addon that reads `scrollerRef.current` during its render gets `null` before the first commit instead of a `ReferenceError`.

Also story-only: the editor's notice row (the `notice` of `useAddons`) is capped by the room that stays visible, through the new `notice-cap.ts` of the showcase, which is not exported. The cap is 40% of the visible editor. The page's scroller keeps 10rem above the line where a focused Field lands, which accounts for the virtual keyboard through `visualViewport`. The notice never goes below 3rem. The fixed `40vh` stays only as a fallback before the first measurement.
