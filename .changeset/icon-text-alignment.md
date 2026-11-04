---
'@react-object-page/core': patch
---

Fix: icons next to text (`StatusBadge`, `Checkbox`, `RadioGroupItem`, `Switch`, `FieldMessage`, `MessageStrip`, `Toast`, the Object Page footer, the `Select`/`Combobox` selected check, the `ListReportTable` sort arrow, and direct `svg` children of `Text`) are now centred on the cap height of the adjacent text instead of the line box, so the vertical alignment no longer depends on which font `font-rop-sans` resolves to on a given platform (up to 2px off previously with some font fallbacks).
