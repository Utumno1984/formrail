---
'@formrail/pro': patch
---

`ChangeSummary`: the added / removed / changed badges have a clearer hierarchy (#485). Each is a tint of its token (`--color-rop-success` / `--color-rop-error` / `--color-rop-primary`, 12% on the surface) behind a bolder text mixed 45% with black, and a decorative shape drawn in CSS (a plus, a minus, a diamond): the text on its tint is at least 4.5:1 (WCAG AA) with the default tokens and with a redeclared primary, and the three kinds differ without colour. The 1px outline is kept, so the badge stays visible in forced-colors mode. A blank text for a kind in `valueLabels` (`added: ''`) now gives the default text instead of an empty badge. No public API change, and the text read by assistive technology is unchanged.
