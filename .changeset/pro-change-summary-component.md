---
'@react-object-page/pro': minor
---

Add `<ChangeSummary />` (accessible, responsive presentation of the Change Summary entries, `renderValue`, `emptyLabel`, `valueLabels`, `locale`/`timeZone`) and the pure `formatChangeValue` with sensible defaults for booleans, dates, numbers, empty values, arrays and objects, and an anti-collision rule when before and after would look identical (precise texts, then the contents of arrays / objects / Map / Set written out, then an explicit `contents differ`). Ship `@react-object-page/pro/styles.css`: only `.rop-pro-*` component classes in the nested layer `rop.utilities.pro` (no Tailwind utility shared with core, so the import order does not matter and core utilities in `className` override the defaults); `@react-object-page/core` is now a peer dependency.
