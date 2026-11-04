---
'@react-object-page/core': minor
---

New `Calendar`: inline month grid to pick one date, fully keyboard accessible (roving tabindex, arrows, Home/End, PageUp/PageDown, Shift+PageUp/PageDown, Enter/Space). Values are ISO calendar dates (`IsoDate`, `YYYY-MM-DD`) computed with integer arithmetic, so a selection never shifts by a day across time zones or daylight saving changes. Localized with `Intl` only (no date library): month and day names from `locale` (runtime default when omitted), first day of the week from `weekStartsOn`, else `Intl.Locale` week info, else a CLDR region table, else Monday. Controlled or uncontrolled (`value`/`defaultValue`/`onValueChange`, `month`/`defaultMonth`/`onMonthChange`) with no echo on external changes; `min`/`max`/`isDateDisabled` (reachable, not selectable), injectable `today`, `disabled` and `readOnly`, `Field` integration, and a grid that always has 6 rows.
