---
'@react-object-page/core': minor
---

New `Avatar`: image with initials fallback and a fixed square box (`xs` to `xl`, `circle` or `square`) that is identical while there is no `src`, while loading, once loaded and after an error. A changed `src` goes back to the fallback until the new image has loaded; the accessible name comes from `name` (or `decorative` hides it).
