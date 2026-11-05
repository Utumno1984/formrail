---
'@react-object-page/core': patch
---

`StatusBadge`: with `tone="warning"` the icon is nudged up by 4% of its own height (about 0.5px at the `xs` icon size), an optical correction for the conventional apex-up warning triangle, whose visual weight sits below its geometric centre. The other tones keep the shared cap-height centring unchanged, and no other component that shares the icon set or the alignment slot is affected. Badge size and layout are unchanged. The shift applies to `<svg>` icons only (also nested); non-SVG icons (`img`, icon fonts) are not moved, and a round icon used with `tone="warning"` is moved by about 0.5px.
