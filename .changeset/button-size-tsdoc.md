---
'@formrail/core': patch
---

`Button`: the TSDoc of `size` no longer says "Default `md`" for the `icon-*` sizes, where `size` is required. One text, true
for both branches of `ButtonProps`: `md` is the default of the text sizes; the `icon-*` sizes are passed explicitly with
`aria-label` or `aria-labelledby`. Documentation only, no type changes.
